import { and, asc, desc, eq, gt, inArray, max, sql } from 'drizzle-orm';
import {
  CATEGORY_BASE_TAG,
  type Category,
  LIMITS,
  type MyVendor,
  type Precision,
  type QuickStartInput,
  type VendorProfileUpdate,
} from '@streeteats/shared';
import type { FastifyRequest } from 'fastify';
import { type AppContext, requireUser } from '../../app';
import type { Db } from '../../db/client';
import {
  deletedEntities,
  menuItems,
  tags,
  vendorProfiles,
  vendorStatusPosts,
  vendorTags,
  verificationProgress,
} from '../../db/schema';
import { ApiError, isUniqueViolation } from '../../lib/errors';
import { computeEndsAt, endLiveSession, getLiveStatus } from '../live/service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

export interface VendorRef {
  id: string;
  timezone: string;
  hidden: boolean;
  defaultPrecision: Precision;
}

/** The signed-in vendor's business, or 401/403/409 (no business yet). */
export async function requireVendor(ctx: AppContext, request: FastifyRequest) {
  const user = requireUser(request, ['vendor']);
  const vendor = await findVendorByUser(ctx, user.id);
  if (!vendor) throw new ApiError('onboarding_required');
  return { ...vendor, userId: user.id };
}

export async function findVendorByUser(ctx: AppContext, userId: string): Promise<VendorRef | null> {
  const [v] = await ctx.db
    .select({
      id: vendorProfiles.id,
      timezone: vendorProfiles.timezone,
      hidden: vendorProfiles.hidden,
      defaultPrecision: vendorProfiles.defaultPrecision,
    })
    .from(vendorProfiles)
    .where(eq(vendorProfiles.userId, userId));
  return v ?? null;
}

function validTimezone(tz: string | undefined, fallback: string) {
  if (!tz) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    throw new ApiError('validation_failed');
  }
}

/** Keeps each category's base tag attached, so category words always find the vendor. */
async function syncBaseTags(tx: Conn, vendorId: string, previous: Category[], next: Category[]) {
  const slugsFor = (cats: Category[]) => cats.map((c) => CATEGORY_BASE_TAG[c]).filter((s): s is string => Boolean(s));
  const add = slugsFor(next);
  const remove = slugsFor(previous).filter((s) => !add.includes(s));
  if (remove.length) {
    const ids = (await tx.select({ id: tags.id }).from(tags).where(inArray(tags.slug, remove))).map((r) => r.id);
    if (ids.length) await tx.delete(vendorTags).where(and(eq(vendorTags.vendorId, vendorId), inArray(vendorTags.tagId, ids)));
  }
  if (add.length) {
    const ids = (await tx.select({ id: tags.id }).from(tags).where(inArray(tags.slug, add))).map((r) => r.id);
    if (ids.length) await tx.insert(vendorTags).values(ids.map((tagId) => ({ vendorId, tagId }))).onConflictDoNothing();
  }
}

/** $ / $$ / $$$ from the median menu price (same rule as lib/price.ts). */
async function refreshPriceLevel(tx: Conn, vendorId: string) {
  await tx.execute(sql`
    UPDATE vendor_profiles v SET price_level = CASE
        WHEN m.median IS NULL THEN NULL
        WHEN m.median < 500 THEN 1
        WHEN m.median <= 1200 THEN 2
        ELSE 3 END
    FROM (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) AS median
          FROM menu_items WHERE vendor_id = ${vendorId}) m
    WHERE v.id = ${vendorId}`);
}

// ---------------------------------------------------------------- onboarding & profile

export async function quickStart(ctx: AppContext, userId: string, input: QuickStartInput & { paymentMethods: string[] }) {
  const timezone = validTimezone(input.timezone, ctx.config.defaultTimezone);
  try {
    await ctx.db.transaction(async (tx) => {
      const [v] = await tx
        .insert(vendorProfiles)
        .values({
          userId,
          displayName: input.displayName,
          categories: input.categories,
          paymentMethods: input.paymentMethods,
          languages: input.languages ?? [],
          defaultPrecision: input.defaultPrecision ?? 'approximate',
          timezone,
          quickStartAt: new Date(),
        })
        .returning({ id: vendorProfiles.id });
      const vendorId = v!.id;
      await tx.insert(menuItems).values(
        input.menu.map((m, i) => ({ id: m.id, vendorId, name: m.name, priceCents: m.priceCents, sortOrder: i })),
      );
      await syncBaseTags(tx, vendorId, [], input.categories);
      await tx.insert(verificationProgress).values({ vendorId }).onConflictDoNothing();
      await refreshPriceLevel(tx, vendorId);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'vendor_profiles_user_id_unique')) throw new ApiError('already_onboarded');
    if (isUniqueViolation(err)) throw new ApiError('conflict');
    throw err;
  }
  const vendor = await findVendorByUser(ctx, userId);
  return getMyVendor(ctx, vendor!.id);
}

export async function getMyVendor(ctx: AppContext, vendorId: string): Promise<MyVendor> {
  const [v] = await ctx.db.select().from(vendorProfiles).where(eq(vendorProfiles.id, vendorId));
  if (!v) throw new ApiError('onboarding_required');
  const [menu, posts, live] = await Promise.all([
    ctx.db.select().from(menuItems).where(eq(menuItems.vendorId, vendorId)).orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt)),
    ctx.db
      .select()
      .from(vendorStatusPosts)
      .where(and(eq(vendorStatusPosts.vendorId, vendorId), gt(vendorStatusPosts.expiresAt, sql`now()`)))
      .orderBy(desc(vendorStatusPosts.createdAt)),
    getLiveStatus(ctx, vendorId),
  ]);
  return {
    id: v.id,
    displayName: v.displayName,
    description: v.description,
    categories: v.categories as MyVendor['categories'],
    languages: v.languages as MyVendor['languages'],
    paymentMethods: v.paymentMethods as MyVendor['paymentMethods'],
    priceLevel: v.priceLevel,
    defaultPrecision: v.defaultPrecision,
    contactText: v.contactText,
    contactVisible: v.contactVisible,
    timezone: v.timezone,
    hidden: v.hidden,
    menu: menu.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      priceCents: m.priceCents,
      soldOut: m.soldOut,
      sortOrder: m.sortOrder,
      clientUpdatedAt: m.clientUpdatedAt.toISOString(),
    })),
    statusPosts: posts.map((p) => ({ id: p.id, body: p.body, expiresAt: p.expiresAt.toISOString(), createdAt: p.createdAt.toISOString() })),
    live,
  };
}

export async function updateProfile(ctx: AppContext, vendor: VendorRef, patch: VendorProfileUpdate) {
  const timezone = patch.timezone ? validTimezone(patch.timezone, vendor.timezone) : undefined;
  await ctx.db.transaction(async (tx) => {
    const [current] = await tx.select({ categories: vendorProfiles.categories }).from(vendorProfiles).where(eq(vendorProfiles.id, vendor.id));
    await tx
      .update(vendorProfiles)
      .set({ ...patch, ...(timezone ? { timezone } : {}), updatedAt: new Date() })
      .where(eq(vendorProfiles.id, vendor.id));
    if (patch.categories) await syncBaseTags(tx, vendor.id, current!.categories as Category[], patch.categories);
  });
  // Vacation mode takes the vendor off the map immediately.
  if (patch.hidden) await endLiveSession(ctx, vendor.id);
  return getMyVendor(ctx, vendor.id);
}

// ---------------------------------------------------------------- client-id entities (LWW)
//
// A change older than what's stored is "superseded". A change with the same
// timestamp is re-applied, so an outbox retrying the exact same request
// still gets "applied".

type Kind = 'menu_item' | 'status_post';
export type WriteOutcome = 'applied' | 'superseded';

/**
 * Last-write-wins against a delete. Returns true when a delete made later
 * than this edit already won. An older tombstone is cleared so the newer
 * edit can bring the entity back.
 */
async function deletedLater(tx: Tx, id: string, vendorId: string, at: Date) {
  const [tomb] = await tx.select().from(deletedEntities).where(eq(deletedEntities.id, id));
  if (!tomb) return false;
  if (tomb.vendorId !== vendorId) throw new ApiError('not_found');
  if (tomb.deletedAt >= at) return true;
  await tx.delete(deletedEntities).where(eq(deletedEntities.id, id));
  return false;
}

async function recordDelete(tx: Tx, id: string, vendorId: string, kind: Kind, at: Date) {
  await tx
    .insert(deletedEntities)
    .values({ id, vendorId, kind, deletedAt: at })
    .onConflictDoUpdate({
      target: deletedEntities.id,
      set: { deletedAt: sql`greatest(${deletedEntities.deletedAt}, ${at.toISOString()}::timestamptz)` },
    });
}

/** Device clocks drift; a change can't claim to be from the future. */
function clientTime(iso: string) {
  const at = new Date(iso);
  if (at.getTime() > Date.now() + 10 * 60_000) throw new ApiError('validation_failed');
  return at;
}

export async function upsertMenuItem(
  ctx: AppContext,
  vendorId: string,
  id: string,
  input: { name: string; description: string; priceCents: number; soldOut: boolean; sortOrder?: number; clientUpdatedAt: string },
): Promise<WriteOutcome> {
  const at = clientTime(input.clientUpdatedAt);
  return ctx.db.transaction(async (tx) => {
    if (await deletedLater(tx, id, vendorId, at)) return 'superseded';
    const [existing] = await tx
      .select({ vendorId: menuItems.vendorId, clientUpdatedAt: menuItems.clientUpdatedAt })
      .from(menuItems)
      .where(eq(menuItems.id, id))
      .for('update');
    if (existing && existing.vendorId !== vendorId) throw new ApiError('not_found');
    if (existing && existing.clientUpdatedAt > at) return 'superseded';

    const fields = {
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      soldOut: input.soldOut,
      clientUpdatedAt: at,
      updatedAt: new Date(),
    };
    if (existing) {
      await tx
        .update(menuItems)
        .set({ ...fields, ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}) })
        .where(eq(menuItems.id, id));
    } else {
      const count = await tx.$count(menuItems, eq(menuItems.vendorId, vendorId));
      if (count >= LIMITS.menuItemsMax) throw new ApiError('validation_failed');
      const [{ last } = { last: null }] = await tx.select({ last: max(menuItems.sortOrder) }).from(menuItems).where(eq(menuItems.vendorId, vendorId));
      await tx.insert(menuItems).values({ id, vendorId, ...fields, sortOrder: input.sortOrder ?? (last ?? -1) + 1 });
    }
    await refreshPriceLevel(tx, vendorId);
    return 'applied';
  });
}

/** One-tap sold out. Same clock as other menu edits. */
export async function setSoldOut(ctx: AppContext, vendorId: string, id: string, soldOut: boolean, clientUpdatedAt: string): Promise<WriteOutcome> {
  const at = clientTime(clientUpdatedAt);
  return ctx.db.transaction(async (tx) => {
    if (await deletedLater(tx, id, vendorId, at)) return 'superseded';
    const [existing] = await tx
      .select({ vendorId: menuItems.vendorId, clientUpdatedAt: menuItems.clientUpdatedAt })
      .from(menuItems)
      .where(eq(menuItems.id, id))
      .for('update');
    if (!existing || existing.vendorId !== vendorId) throw new ApiError('not_found');
    if (existing.clientUpdatedAt > at) return 'superseded';
    await tx.update(menuItems).set({ soldOut, clientUpdatedAt: at, updatedAt: new Date() }).where(eq(menuItems.id, id));
    return 'applied';
  });
}

export async function deleteMenuItem(ctx: AppContext, vendorId: string, id: string, clientUpdatedAt: string): Promise<WriteOutcome> {
  const at = clientTime(clientUpdatedAt);
  return ctx.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ vendorId: menuItems.vendorId, clientUpdatedAt: menuItems.clientUpdatedAt })
      .from(menuItems)
      .where(eq(menuItems.id, id))
      .for('update');
    if (existing && existing.vendorId !== vendorId) throw new ApiError('not_found');
    if (existing && existing.clientUpdatedAt > at) return 'superseded';
    if (existing) await tx.delete(menuItems).where(eq(menuItems.id, id));
    await recordDelete(tx, id, vendorId, 'menu_item', at);
    await refreshPriceLevel(tx, vendorId);
    return 'applied';
  });
}

export async function upsertStatusPost(
  ctx: AppContext,
  vendor: VendorRef,
  id: string,
  input: { body: string; expiresInHours?: number; clientUpdatedAt: string },
): Promise<WriteOutcome> {
  const at = clientTime(input.clientUpdatedAt);
  // Default: until the end of the vendor's street day.
  const expiresAt = computeEndsAt(ctx, new Date(), vendor.timezone, input.expiresInHours);
  return ctx.db.transaction(async (tx) => {
    if (await deletedLater(tx, id, vendor.id, at)) return 'superseded';
    const [existing] = await tx
      .select({ vendorId: vendorStatusPosts.vendorId, clientUpdatedAt: vendorStatusPosts.clientUpdatedAt })
      .from(vendorStatusPosts)
      .where(eq(vendorStatusPosts.id, id))
      .for('update');
    if (existing && existing.vendorId !== vendor.id) throw new ApiError('not_found');
    if (existing && existing.clientUpdatedAt > at) return 'superseded';
    const fields = { body: input.body, expiresAt, clientUpdatedAt: at, updatedAt: new Date() };
    if (existing) await tx.update(vendorStatusPosts).set(fields).where(eq(vendorStatusPosts.id, id));
    else await tx.insert(vendorStatusPosts).values({ id, vendorId: vendor.id, ...fields });
    return 'applied';
  });
}

export async function deleteStatusPost(ctx: AppContext, vendorId: string, id: string, clientUpdatedAt: string): Promise<WriteOutcome> {
  const at = clientTime(clientUpdatedAt);
  return ctx.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ vendorId: vendorStatusPosts.vendorId, clientUpdatedAt: vendorStatusPosts.clientUpdatedAt })
      .from(vendorStatusPosts)
      .where(eq(vendorStatusPosts.id, id))
      .for('update');
    if (existing && existing.vendorId !== vendorId) throw new ApiError('not_found');
    if (existing && existing.clientUpdatedAt > at) return 'superseded';
    if (existing) await tx.delete(vendorStatusPosts).where(eq(vendorStatusPosts.id, id));
    await recordDelete(tx, id, vendorId, 'status_post', at);
    return 'applied';
  });
}
