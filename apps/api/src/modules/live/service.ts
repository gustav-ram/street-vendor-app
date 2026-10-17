import { eq, sql } from 'drizzle-orm';
import type { LatLng, Precision } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { vendorLiveSessions, vendorProfiles } from '../../db/schema';
import { publicLocation } from '../../lib/geo/fuzz';
import { pointSql } from '../../lib/geo/sql';
import { localTimeOnDay } from '../../lib/time';

/**
 * When a live session must end no matter what: the vendor's auto-off timer,
 * the end of their "street day" (e.g. 3:00 AM local) or the hard maximum.
 */
export function computeEndsAt(ctx: AppContext, now: Date, timezone: string, autoOffHours?: number): Date {
  const { streetDayEndsAt, maxHours } = ctx.config.live;
  let dayEnd = localTimeOnDay(now, 0, streetDayEndsAt, timezone);
  if (dayEnd <= now) dayEnd = localTimeOnDay(now, 1, streetDayEndsAt, timezone);
  const candidates = [dayEnd.getTime(), now.getTime() + maxHours * 3_600_000];
  if (autoOffHours) candidates.push(now.getTime() + autoOffHours * 3_600_000);
  return new Date(Math.min(...candidates));
}

/**
 * Starts a live session or refreshes it (heartbeat). Only the public point
 * is written; in approximate mode the exact coordinates never reach the database.
 */
export async function upsertLiveSession(
  ctx: AppContext,
  vendorId: string,
  rawPoint: LatLng,
  opts: { precision: Precision; timezone: string; autoOffHours?: number },
) {
  const now = new Date();
  const fuzz = { secret: ctx.config.fuzzSecret, cellMeters: ctx.config.approxCellMeters };
  const [existing] = await ctx.db
    .select({ cellKey: vendorLiveSessions.cellKey, precision: vendorLiveSessions.precision, endsAt: vendorLiveSessions.endsAt })
    .from(vendorLiveSessions)
    .where(eq(vendorLiveSessions.vendorId, vendorId));
  const samePrecision = existing?.precision === opts.precision;
  const loc = publicLocation(rawPoint, opts.precision, vendorId, fuzz, samePrecision ? existing?.cellKey : null);
  const expiresAt = new Date(now.getTime() + ctx.config.live.graceSec * 1000);
  const endsAt = existing && opts.autoOffHours === undefined ? existing.endsAt : computeEndsAt(ctx, now, opts.timezone, opts.autoOffHours);

  await ctx.db
    .insert(vendorLiveSessions)
    .values({
      vendorId,
      publicPoint: pointSql(loc),
      precision: opts.precision,
      cellKey: loc.cellKey,
      startedAt: now,
      lastHeartbeatAt: now,
      expiresAt,
      endsAt,
    })
    .onConflictDoUpdate({
      target: vendorLiveSessions.vendorId,
      set: {
        publicPoint: pointSql(loc),
        precision: opts.precision,
        cellKey: loc.cellKey,
        lastHeartbeatAt: now,
        expiresAt,
        endsAt,
      },
    });

  // "Last active" is kept to the hour, and is only a time, never a place.
  await ctx.db
    .update(vendorProfiles)
    .set({ lastLiveAt: sql`date_trunc('hour', now())` })
    .where(eq(vendorProfiles.id, vendorId));

  return { location: loc, expiresAt, endsAt };
}

/** Going offline deletes the row, and with it the only copy of the location. */
export async function endLiveSession(ctx: AppContext, vendorId: string) {
  const deleted = await ctx.db
    .delete(vendorLiveSessions)
    .where(eq(vendorLiveSessions.vendorId, vendorId))
    .returning({ vendorId: vendorLiveSessions.vendorId });
  return deleted.length > 0;
}
