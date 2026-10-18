import { createHmac, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { LatLng, Role, StillHereResult } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { hashPeppers, stillHereConfirmations, users, vendorLiveSessions } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { distanceMeters } from '../../lib/geo/fuzz';
import { localDay } from '../../lib/time';
import { bumpCounter } from '../analytics/counters';
import { assertNotBlocked, publicVendor } from './guards';

/**
 * "Still here?" (PLAN.md §6.6). A customer near a live vendor taps "Yes,
 * they're here". What's stored is only: which vendor, which (vendor-local)
 * day, whether it counted toward the badge, and an expiring hash.
 *
 * - The hash is HMAC(pepper for this 30-day epoch, user id | vendor id). It
 *   lets us spot repeats without storing who confirmed. Rows are deleted
 *   after 30 days and peppers after two epochs, after which no row can be
 *   linked to anyone, even by us.
 * - The customer's location is compared with the vendor's public point in
 *   memory and then dropped. It's never written or logged.
 *
 * Anti-gaming rules:
 * - signed-in customers only, with accounts at least a day old; never the
 *   vendor (vendor accounts can't confirm), and not someone the vendor blocked;
 * - the vendor must be live right now, and the customer within ~400 m of the
 *   public point (approximate mode) or ~200 m (exact mode);
 * - one confirmation per person per vendor per 24 h, and at most one per 7
 *   days counts toward the badge;
 * - each account confirms at most N vendors a day (counted in memory only),
 *   on top of a per-IP request limit set on the route.
 */

const EPOCH_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;
const COUNT_WINDOW_MS = 7 * DAY_MS;

export const epochOf = (d: Date) => Math.floor(d.getTime() / EPOCH_MS);

async function pepper(ctx: AppContext, epoch: number, create: boolean): Promise<string | null> {
  const read = async () =>
    (await ctx.db.select({ secret: hashPeppers.secret }).from(hashPeppers).where(eq(hashPeppers.epoch, epoch)))[0]?.secret ?? null;
  const existing = await read();
  if (existing || !create) return existing;
  await ctx.db.insert(hashPeppers).values({ epoch, secret: randomBytes(32).toString('base64url') }).onConflictDoNothing();
  return read();
}

/** This person's hash for this vendor, under the current epoch's pepper and (if still kept) the previous one. */
async function confirmerHashes(ctx: AppContext, userId: string, vendorId: string, now: Date, create: boolean) {
  const epoch = epochOf(now);
  const out: Array<{ epoch: number; hash: string }> = [];
  for (const e of [epoch, epoch - 1]) {
    const secret = await pepper(ctx, e, create && e === epoch);
    if (secret) out.push({ epoch: e, hash: createHmac('sha256', secret).update(`${userId}|${vendorId}`).digest('base64url') });
  }
  return out;
}

/** Confirmations per account per day, kept in memory only (lost on restart, which is fine). */
export function createDailyCounter() {
  let day = '';
  let counts = new Map<string, number>();
  const roll = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      counts = new Map();
    }
  };
  return {
    get: (id: string) => (roll(), counts.get(id) ?? 0),
    add: (id: string) => (roll(), counts.set(id, (counts.get(id) ?? 0) + 1)),
  };
}
export type DailyCounter = ReturnType<typeof createDailyCounter>;

export async function confirmedRecently(ctx: AppContext, userId: string, vendorId: string) {
  const hashes = await confirmerHashes(ctx, userId, vendorId, new Date(), false);
  if (hashes.length === 0) return false;
  const n = await ctx.db.$count(
    stillHereConfirmations,
    and(
      eq(stillHereConfirmations.vendorId, vendorId),
      inArray(stillHereConfirmations.confirmerHash, hashes.map((h) => h.hash)),
      gt(stillHereConfirmations.createdAt, new Date(Date.now() - DAY_MS)),
    ),
  );
  return n > 0;
}

export async function confirmStillHere(
  ctx: AppContext,
  user: { id: string; role: Role },
  vendorId: string,
  location: LatLng,
  daily: DailyCounter,
): Promise<StillHereResult> {
  const rules = ctx.config.stillHere;
  if (user.role !== 'customer') throw new ApiError('forbidden');

  const [account] = await ctx.db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, user.id));
  if (!account) throw new ApiError('unauthorized');
  if (Date.now() - account.createdAt.getTime() < rules.minAccountAgeHours * 3_600_000) throw new ApiError('account_too_new');

  const vendor = await publicVendor(ctx, vendorId);
  await assertNotBlocked(ctx, vendor.userId, user.id);

  const [live] = await ctx.db
    .select({
      lat: sql<number>`ST_Y(${vendorLiveSessions.publicPoint}::geometry)`,
      lng: sql<number>`ST_X(${vendorLiveSessions.publicPoint}::geometry)`,
      precision: vendorLiveSessions.precision,
    })
    .from(vendorLiveSessions)
    .where(
      and(
        eq(vendorLiveSessions.vendorId, vendorId),
        sql`${vendorLiveSessions.expiresAt} > now() AND ${vendorLiveSessions.endsAt} > now()`,
      ),
    );
  if (!live) throw new ApiError('not_live');

  // Compared in memory; the customer's coordinates go no further than this line.
  const radius = live.precision === 'exact' ? rules.radiusExactM : rules.radiusApproxM;
  if (distanceMeters(location, { lat: Number(live.lat), lng: Number(live.lng) }) > radius) throw new ApiError('too_far');

  const now = new Date();
  const hashes = await confirmerHashes(ctx, user.id, vendorId, now, true);
  const recent = await ctx.db
    .select({ createdAt: stillHereConfirmations.createdAt, counted: stillHereConfirmations.counted })
    .from(stillHereConfirmations)
    .where(
      and(
        eq(stillHereConfirmations.vendorId, vendorId),
        inArray(stillHereConfirmations.confirmerHash, hashes.map((h) => h.hash)),
        gt(stillHereConfirmations.createdAt, new Date(now.getTime() - COUNT_WINDOW_MS)),
      ),
    )
    .orderBy(desc(stillHereConfirmations.createdAt));
  if (recent.some((r) => now.getTime() - r.createdAt.getTime() < DAY_MS)) return { status: 'already_confirmed' };
  if (daily.get(user.id) >= rules.dailyLimit) throw new ApiError('rate_limited');

  const current = hashes.find((h) => h.epoch === epochOf(now))!;
  await ctx.db.insert(stillHereConfirmations).values({
    vendorId,
    confirmerHash: current.hash,
    epoch: current.epoch,
    localDay: localDay(now, vendor.timezone),
    counted: !recent.some((r) => r.counted),
  });
  daily.add(user.id);
  await ctx.db.update(vendorLiveSessions).set({ lastConfirmedAt: now }).where(eq(vendorLiveSessions.vendorId, vendorId));
  await bumpCounter(ctx.db, [vendorId], 'confirmations');
  return { status: 'confirmed' };
}
