import { strToU8, zipSync } from 'fflate';
import { eq, sql } from 'drizzle-orm';
import type { AppContext } from '../../app';
import { users } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { verifySecret } from '../../lib/passwords';
import { findVendorByUser, getMyVendor } from '../dashboard/service';
import { endLiveSession } from '../live/service';

/**
 * Account controls (PLAN.md §6.7): export everything we hold about a person,
 * and delete it all for good.
 */

const iso = (d: unknown) => (d === null || d === undefined ? null : new Date(d as string).toISOString());

const README = `StreetEats data export / Exportación de datos de StreetEats

account.json has everything StreetEats keeps about your account: your sign-in
details, your business (if you're a vendor), what you posted, your reviews,
favorites and reports. photos/ has the photos you uploaded, as stored (with
location and camera data already removed).

Not included, because we can't link them to you: "Still here?" taps you made
(we keep only an unreadable code that expires), and anonymous daily totals
about other businesses.

account.json tiene todo lo que StreetEats guarda sobre su cuenta: sus datos
para entrar, su negocio (si es vendedor), lo que publicó, sus reseñas,
favoritos y reportes. photos/ tiene las fotos que usted subió, tal como se
guardan (ya sin ubicación ni datos de la cámara).

No se incluyen, porque no los podemos relacionar con usted: los toques de
"¿Sigue aquí?" que hizo (solo guardamos un código ilegible que vence) ni los
totales diarios anónimos de otros negocios.
`;

export async function exportAccount(ctx: AppContext, userId: string) {
  const { db } = ctx;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new ApiError('unauthorized');
  const vendor = await findVendorByUser(ctx, userId);

  const [photos, reviews, favorites, reports] = await Promise.all([
    db.execute<{ id: string; storage_key: string; kind: string; caption: string | null; moderation: string; vendor: string; created_at: Date }>(sql`
      SELECT p.id, p.storage_key, p.kind, p.caption, p.moderation, v.display_name AS vendor, p.created_at
      FROM photos p JOIN vendor_profiles v ON v.id = p.vendor_id
      WHERE p.uploader_user_id = ${userId} ORDER BY p.created_at`),
    db.execute(sql`
      SELECT v.display_name AS vendor, r.rating, r.body, r.moderation, r.vendor_reply, r.created_at, r.updated_at
      FROM reviews r JOIN vendor_profiles v ON v.id = r.vendor_id
      WHERE r.user_id = ${userId} ORDER BY r.created_at`),
    db.execute(sql`
      SELECT v.display_name AS vendor, f.notify_on_open, f.created_at
      FROM favorites f JOIN vendor_profiles v ON v.id = f.vendor_id
      WHERE f.user_id = ${userId} ORDER BY f.created_at`),
    db.execute(sql`
      SELECT target_type, reason, details, status, created_at, resolved_at
      FROM reports WHERE reporter_user_id = ${userId} ORDER BY created_at`),
  ]);

  let business: Record<string, unknown> | null = null;
  if (vendor) {
    const [mine, analytics, verification, blocks, reviewsReceived] = await Promise.all([
      getMyVendor(ctx, vendor.id),
      db.execute(sql`
        SELECT day, profile_views, map_impressions, directions_taps, favorites_added, favorites_removed, confirmations
        FROM analytics_daily WHERE vendor_id = ${vendor.id} ORDER BY day`),
      db.execute(sql`
        SELECT status, live_days, verified_at, revoked_reason FROM verification_progress WHERE vendor_id = ${vendor.id}`),
      db.execute(sql`
        SELECT u.display_name, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_user_id
        WHERE b.blocker_user_id = ${userId}`),
      db.execute(sql`
        SELECT r.rating, r.body, r.vendor_reply, r.vendor_reply_at, r.created_at
        FROM reviews r WHERE r.vendor_id = ${vendor.id} AND r.moderation = 'approved' ORDER BY r.created_at`),
    ]);
    business = {
      // `live` is what customers see right now; no earlier locations are kept, so none can be exported.
      ...mine,
      reviewsReceived: reviewsReceived.map((r) => ({ ...r, created_at: iso(r.created_at), vendor_reply_at: iso(r.vendor_reply_at) })),
      blockedPeople: blocks.map((b) => ({ displayName: b.display_name, since: iso(b.created_at) })),
      verification: verification[0] ?? null,
      dailyTotals: analytics.map((a) => ({ ...a, day: String(a.day).slice(0, 10) })),
    };
  }

  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      language: user.locale,
      signInWith: user.credentialKind,
      createdAt: user.createdAt.toISOString(),
    },
    business,
    photosYouUploaded: photos.map((p) => ({
      file: `photos/${p.id}.webp`,
      vendor: p.vendor,
      kind: p.kind,
      caption: p.caption,
      moderation: p.moderation,
      createdAt: iso(p.created_at),
    })),
    reviewsYouWrote: reviews.map((r) => ({ ...r, created_at: iso(r.created_at), updated_at: iso(r.updated_at) })),
    favorites: favorites.map((f) => ({ ...f, created_at: iso(f.created_at) })),
    reportsYouFiled: reports.map((r) => ({ ...r, created_at: iso(r.created_at), resolved_at: iso(r.resolved_at) })),
  };

  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'README.txt': strToU8(README),
    'account.json': strToU8(JSON.stringify(data, null, 2)),
  };
  for (const p of photos) {
    try {
      // Already-compressed WebP: stored as is.
      files[`photos/${p.id}.webp`] = [new Uint8Array(await ctx.storage.readPhoto(p.storage_key)), { level: 0 }];
    } catch {
      // The file is gone (deleted moments ago); the JSON still lists it.
    }
  }
  return zipSync(files, { level: 6, mtime: new Date() });
}

/** Deletes an account after checking the password or PIN again. */
export async function deleteAccount(ctx: AppContext, userId: string, secret: string) {
  const [user] = await ctx.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!user) throw new ApiError('unauthorized');
  if (!(await verifySecret(user.hash, secret))) throw new ApiError('invalid_credentials');
  await purgeUser(ctx, userId);
}

/**
 * Removes a person and everything that belongs to them: one DELETE (every
 * table cascades from users), then the files. Reports they filed stay, no
 * longer linked to anyone. Used by DELETE /me and the admin CLI.
 */
export async function purgeUser(ctx: AppContext, userId: string) {
  const vendor = await findVendorByUser(ctx, userId);
  // Off the map first, so the location goes even if something below fails.
  if (vendor) await endLiveSession(ctx, vendor.id);

  const [photoFiles, stagedFiles] = await Promise.all([
    ctx.db.execute<{ storage_key: string; thumb_key: string }>(sql`
      SELECT storage_key, thumb_key FROM photos
      WHERE uploader_user_id = ${userId} ${vendor ? sql`OR vendor_id = ${vendor.id}` : sql``}`),
    ctx.db.execute<{ tmp_key: string }>(sql`SELECT tmp_key FROM uploads WHERE user_id = ${userId}`),
  ]);

  const deleted = await ctx.db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  if (deleted.length === 0) throw new ApiError('not_found');

  await Promise.all([
    ...photoFiles.flatMap((p) => [ctx.storage.removePhoto(p.storage_key), ctx.storage.removePhoto(p.thumb_key)]),
    ...stagedFiles.map((u) => ctx.storage.removeTmp(u.tmp_key)),
  ]);
}
