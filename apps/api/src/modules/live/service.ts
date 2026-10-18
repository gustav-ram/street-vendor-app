import { and, eq, sql } from 'drizzle-orm';
import type { LatLng, LiveStatus, Precision } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { favorites, vendorLiveSessions, vendorProfiles } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { publicLocation } from '../../lib/geo/fuzz';
import { pointSql } from '../../lib/geo/sql';
import { localDay, localTimeOnDay } from '../../lib/time';
import { refreshVerification } from '../verification/service';

/**
 * Live sessions: heartbeat + TTL (PLAN.md §6.2).
 *
 * - A session row exists only while the vendor is live; there is no history.
 * - Each heartbeat pushes expires_at to now + grace. If heartbeats stop (no
 *   signal, app closed, phone died), the session silently expires and the
 *   sweeper deletes the row and the location with it.
 * - ends_at is a hard stop: the auto-off timer, the end of the vendor's
 *   "street day", or the maximum session length, whichever comes first.
 * - Only the public point is written. In approximate mode the exact
 *   coordinates from the phone are fuzzed in memory and never stored.
 */

const LIVE_NOW = sql`${vendorLiveSessions.expiresAt} > now() AND ${vendorLiveSessions.endsAt} > now()`;

export function computeEndsAt(ctx: AppContext, now: Date, timezone: string, autoOffHours?: number | null): Date {
  const { streetDayEndsAt, maxHours } = ctx.config.live;
  let dayEnd = localTimeOnDay(now, 0, streetDayEndsAt, timezone);
  if (dayEnd <= now) dayEnd = localTimeOnDay(now, 1, streetDayEndsAt, timezone);
  const candidates = [dayEnd.getTime(), now.getTime() + maxHours * 3_600_000];
  if (autoOffHours) candidates.push(now.getTime() + autoOffHours * 3_600_000);
  return new Date(Math.min(...candidates));
}

export function fuzzOptions(ctx: AppContext) {
  return { secret: ctx.config.fuzzSecret, cellMeters: ctx.config.approxCellMeters };
}

export async function getLiveStatus(ctx: AppContext, vendorId: string): Promise<LiveStatus> {
  const [s] = await ctx.db
    .select({
      lat: sql<number>`ST_Y(${vendorLiveSessions.publicPoint}::geometry)`,
      lng: sql<number>`ST_X(${vendorLiveSessions.publicPoint}::geometry)`,
      precision: vendorLiveSessions.precision,
      startedAt: vendorLiveSessions.startedAt,
      lastHeartbeatAt: vendorLiveSessions.lastHeartbeatAt,
      expiresAt: vendorLiveSessions.expiresAt,
      endsAt: vendorLiveSessions.endsAt,
    })
    .from(vendorLiveSessions)
    .where(and(eq(vendorLiveSessions.vendorId, vendorId), LIVE_NOW));
  const timing = { heartbeatIntervalSec: ctx.config.live.heartbeatIntervalSec, graceSec: ctx.config.live.graceSec };
  if (!s) {
    return { state: 'offline', location: null, startedAt: null, lastHeartbeatAt: null, expiresAt: null, endsAt: null, ...timing };
  }
  return {
    state: 'live',
    location: { lat: Number(s.lat), lng: Number(s.lng), precision: s.precision },
    startedAt: s.startedAt.toISOString(),
    lastHeartbeatAt: s.lastHeartbeatAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    ...timing,
  };
}

/** Starts (or restarts) a live session at the vendor's current location. */
export async function startLiveSession(
  ctx: AppContext,
  vendor: { id: string; timezone: string; hidden: boolean; defaultPrecision: Precision },
  rawPoint: LatLng,
  opts: { precision?: Precision; autoOffHours?: number | null; endsAt?: string } = {},
) {
  if (vendor.hidden) throw new ApiError('vacation_mode');
  const now = new Date();
  const precision = opts.precision ?? vendor.defaultPrecision;
  let endsAt = computeEndsAt(ctx, now, vendor.timezone, opts.autoOffHours);
  // Resuming after lost signal keeps the original end time, never extends it.
  if (opts.endsAt) {
    const requested = new Date(opts.endsAt);
    if (requested > now && requested < endsAt) endsAt = requested;
  }

  const [existing] = await ctx.db
    .select({ cellKey: vendorLiveSessions.cellKey, precision: vendorLiveSessions.precision, startedAt: vendorLiveSessions.startedAt })
    .from(vendorLiveSessions)
    .where(eq(vendorLiveSessions.vendorId, vendor.id));
  const previousCell = existing?.precision === precision ? existing.cellKey : null;
  const loc = publicLocation(rawPoint, precision, vendor.id, fuzzOptions(ctx), previousCell);
  const expiresAt = new Date(now.getTime() + ctx.config.live.graceSec * 1000);
  // startedAt identifies the session (see heartbeatLiveSession): every start gets a new one.
  const startedAt = existing && existing.startedAt >= now ? new Date(existing.startedAt.getTime() + 1) : now;

  const values = {
    publicPoint: pointSql(loc),
    precision,
    cellKey: loc.cellKey,
    startedAt,
    lastHeartbeatAt: now,
    expiresAt,
    endsAt,
  };
  await ctx.db
    .insert(vendorLiveSessions)
    .values({ vendorId: vendor.id, ...values })
    .onConflictDoUpdate({ target: vendorLiveSessions.vendorId, set: values });

  const [, newDay] = await Promise.all([touchLastLive(ctx, vendor.id), countLiveDay(ctx, vendor.id, localDay(now, vendor.timezone))]);
  if (newDay) await refreshVerification(ctx, vendor.id);
  return getLiveStatus(ctx, vendor.id);
}

/**
 * A heartbeat keeps an existing session alive and moves the public point if
 * the vendor moved. It never revives an expired session: the app has to
 * start a new one (so a vendor who walked away from the app stays offline).
 *
 * `startedAt` names the session the device opened. Once another device has
 * gone live for the same stand, the old device's heartbeats are refused, so
 * a forgotten browser tab at home can't drag the pin away from the cart.
 */
export async function heartbeatLiveSession(ctx: AppContext, vendorId: string, rawPoint: LatLng, startedAt?: string) {
  const [s] = await ctx.db
    .select({ precision: vendorLiveSessions.precision, cellKey: vendorLiveSessions.cellKey, startedAt: vendorLiveSessions.startedAt })
    .from(vendorLiveSessions)
    .where(and(eq(vendorLiveSessions.vendorId, vendorId), LIVE_NOW));
  if (!s) throw new ApiError('not_live');
  if (startedAt !== undefined && s.startedAt.getTime() !== new Date(startedAt).getTime()) throw new ApiError('live_elsewhere');

  const loc = publicLocation(rawPoint, s.precision, vendorId, fuzzOptions(ctx), s.cellKey);
  const now = new Date();
  const updated = await ctx.db
    .update(vendorLiveSessions)
    .set({
      publicPoint: pointSql(loc),
      cellKey: loc.cellKey,
      lastHeartbeatAt: now,
      expiresAt: new Date(now.getTime() + ctx.config.live.graceSec * 1000),
    })
    .where(and(eq(vendorLiveSessions.vendorId, vendorId), eq(vendorLiveSessions.startedAt, s.startedAt), LIVE_NOW))
    .returning({ vendorId: vendorLiveSessions.vendorId });
  // Expired (or replaced by another device) between the read and the write.
  if (updated.length === 0) throw new ApiError('not_live');

  await touchLastLive(ctx, vendorId);
  return getLiveStatus(ctx, vendorId);
}

/** Going offline deletes the row, and with it the only copy of the location. */
export async function endLiveSession(ctx: AppContext, vendorId: string) {
  const deleted = await ctx.db
    .delete(vendorLiveSessions)
    .where(eq(vendorLiveSessions.vendorId, vendorId))
    .returning({ vendorId: vendorLiveSessions.vendorId });
  return deleted.length > 0;
}

/** "Last active" is kept to the hour, and is only a time, never a place. */
async function touchLastLive(ctx: AppContext, vendorId: string) {
  await ctx.db
    .update(vendorProfiles)
    .set({ lastLiveAt: sql`date_trunc('hour', now())` })
    .where(eq(vendorProfiles.id, vendorId));
}

/** Counts distinct days live (for the badge). Stores a count and the last day only. */
async function countLiveDay(ctx: AppContext, vendorId: string, today: string) {
  const result = await ctx.db.execute(sql`
    INSERT INTO verification_progress (vendor_id, live_days, last_live_day)
    VALUES (${vendorId}, 1, ${today})
    ON CONFLICT (vendor_id) DO UPDATE
      SET live_days = verification_progress.live_days + 1,
          last_live_day = EXCLUDED.last_live_day,
          updated_at = now()
      WHERE verification_progress.last_live_day IS NULL
         OR verification_progress.last_live_day < EXCLUDED.last_live_day`);
  return (result.count ?? 0) > 0;
}

/**
 * "Notify me when they open" (stub). A real sender would push the vendor's
 * public area and let each phone decide locally whether it's "near me".
 * Only a count is ever returned or logged.
 */
export async function pendingOpenNotifications(ctx: AppContext, vendorId: string) {
  return ctx.db.$count(favorites, and(eq(favorites.vendorId, vendorId), eq(favorites.notifyOnOpen, true)));
}

