import { type SQL, sql } from 'drizzle-orm';
import {
  coarsenCustomerLocation,
  type LiveResult,
  type SearchFilters,
  type SearchResponse,
  type UpcomingResult,
} from '@streeteats/shared';
import type { AppContext } from '../../app';
import { pointSql } from '../../lib/geo/sql';
import { localTimeOnDay, zonedParts } from '../../lib/time';
import { bumpCounter } from '../analytics/counters';
import { iso, minuteIso, point, roundDistance, summaryColumns, type SummaryRow, toSummary } from '../vendors/summary';
import { type ParsedQuery, parseQuery, textArray, textMatchSql } from './query';

const UPCOMING_WINDOW_H = 48;

export interface SearchParams {
  location: { lat: number; lng: number };
  radiusM: number;
  q?: string;
  filters: SearchFilters;
  include: Array<'live' | 'upcoming'>;
  limit: number;
}

/** Filter conditions for a vendor row aliased `v`. Vacation mode always hides. */
function vendorConditions(filters: SearchFilters, pq: ParsedQuery | null): SQL {
  const c: SQL[] = [sql`NOT v.hidden`];
  if (filters.categories?.length) c.push(sql`v.categories && ${textArray(filters.categories)}`);
  if (filters.priceLevels?.length) c.push(sql`v.price_level IN ${filters.priceLevels}`);
  if (filters.paymentMethods?.length) c.push(sql`v.payment_methods && ${textArray(filters.paymentMethods)}`);
  if (filters.languages?.length) c.push(sql`v.languages && ${textArray(filters.languages)}`);
  if (pq) c.push(textMatchSql(pq));
  return sql.join(c, sql` AND `);
}

/** Live right now: heartbeat still fresh and auto-off time not reached. */
const LIVE_NOW = sql`s.expires_at > now() AND s.ends_at > now()`;

export async function search(ctx: AppContext, p: SearchParams): Promise<SearchResponse> {
  // The customer's location is used for this query only: coarsened, never
  // stored, never logged (it arrives in the body, which isn't logged).
  const origin = pointSql(coarsenCustomerLocation(p.location));
  const pq = await parseQuery(ctx.db, p.q);
  const where = vendorConditions(p.filters, pq);

  const live = p.include.includes('live') ? await searchLive(ctx, origin, p, where, pq) : [];
  const upcoming = p.include.includes('upcoming') ? await searchUpcoming(ctx, origin, p, where) : [];

  // Aggregate "map impressions"; never let analytics break a search.
  void bumpCounter(ctx.db, [...live, ...upcoming].map((r) => r.id), 'mapImpressions').catch(() => {});

  return { live, upcoming, matchedTags: pq?.matchedTags ?? [] };
}

async function searchLive(ctx: AppContext, origin: SQL, p: SearchParams, where: SQL, pq: ParsedQuery | null): Promise<LiveResult[]> {
  // Results sort by distance, except that typing a vendor's actual name puts it first.
  const nameFirst = pq ? sql`(similarity(lower(unaccent(v.display_name)), ${pq.normalized}) >= 0.6) DESC,` : sql``;
  const rows = await ctx.db.execute<SummaryRow>(sql`
    SELECT ${summaryColumns},
      ST_Y(s.public_point::geometry) AS lat,
      ST_X(s.public_point::geometry) AS lng,
      s.precision,
      s.started_at,
      greatest(s.last_heartbeat_at, coalesce(s.last_confirmed_at, s.last_heartbeat_at)) AS confirmed_at,
      s.ends_at,
      ST_Distance(s.public_point, ${origin}) AS distance_m
    FROM vendor_live_sessions s
    JOIN vendor_profiles v ON v.id = s.vendor_id
    WHERE ${LIVE_NOW}
      AND ST_DWithin(s.public_point, ${origin}, ${p.radiusM})
      AND ${where}
    ORDER BY ${nameFirst} distance_m
    LIMIT ${p.limit}`);
  return rows.map((r) => ({
    ...toSummary(r),
    live: {
      location: point(r.lat, r.lng, r.precision),
      since: minuteIso(r.started_at),
      lastConfirmedAt: minuteIso(r.confirmed_at),
      endsAt: iso(r.ends_at),
    },
    distanceM: roundDistance(r.distance_m),
  }));
}

async function searchUpcoming(ctx: AppContext, origin: SQL, p: SearchParams, where: SQL): Promise<UpcomingResult[]> {
  const notLive = sql`NOT EXISTS (SELECT 1 FROM vendor_live_sessions s WHERE s.vendor_id = v.id AND ${LIVE_NOW})`;

  const posts = await ctx.db.execute<SummaryRow>(sql`
    SELECT ${summaryColumns},
      u.id AS spot_id, u.starts_at, u.ends_at, u.place_label, u.note, u.precision,
      ST_Y(u.public_point::geometry) AS lat,
      ST_X(u.public_point::geometry) AS lng,
      ST_Distance(u.public_point, ${origin}) AS distance_m
    FROM upcoming_spot_posts u
    JOIN vendor_profiles v ON v.id = u.vendor_id
    WHERE u.ends_at > now()
      AND u.starts_at < now() + make_interval(hours => ${UPCOMING_WINDOW_H})
      AND ST_DWithin(u.public_point, ${origin}, ${p.radiusM})
      AND ${notLive}
      AND ${where}
    ORDER BY u.starts_at, distance_m
    LIMIT ${p.limit}`);

  const schedules = await ctx.db.execute<SummaryRow>(sql`
    SELECT ${summaryColumns}, v.timezone,
      e.id AS spot_id, e.weekday, e.start_time, e.end_time, e.place_label, e.precision,
      ST_Y(e.public_point::geometry) AS lat,
      ST_X(e.public_point::geometry) AS lng,
      ST_Distance(e.public_point, ${origin}) AS distance_m
    FROM schedule_entries e
    JOIN vendor_profiles v ON v.id = e.vendor_id
    WHERE e.published
      AND e.public_point IS NOT NULL
      AND ST_DWithin(e.public_point, ${origin}, ${p.radiusM})
      AND ${notLive}
      AND ${where}
    LIMIT 500`);

  const results: UpcomingResult[] = posts.map((r) => ({
    ...toSummary(r),
    spot: {
      id: String(r.spot_id),
      kind: 'post' as const,
      startsAt: iso(r.starts_at),
      endsAt: iso(r.ends_at),
      placeLabel: (r.place_label as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      location: point(r.lat, r.lng, r.precision),
    },
    distanceM: roundDistance(r.distance_m),
  }));

  const now = new Date();
  for (const r of schedules) {
    const next = nextOccurrence(now, Number(r.weekday), String(r.start_time), String(r.end_time), String(r.timezone));
    if (!next) continue;
    results.push({
      ...toSummary(r),
      spot: {
        id: String(r.spot_id),
        kind: 'schedule',
        startsAt: next.start.toISOString(),
        endsAt: next.end.toISOString(),
        placeLabel: (r.place_label as string | null) ?? null,
        note: null,
        location: point(r.lat, r.lng, r.precision),
      },
      distanceM: roundDistance(r.distance_m),
    });
  }

  // One entry per vendor: their soonest spot.
  const soonest = new Map<string, UpcomingResult>();
  for (const r of results.sort((a, b) => a.spot.startsAt.localeCompare(b.spot.startsAt) || (a.distanceM ?? 0) - (b.distanceM ?? 0))) {
    if (!soonest.has(r.id)) soonest.set(r.id, r);
  }
  return [...soonest.values()].slice(0, p.limit);
}

/** Next time a weekly schedule entry is on, within the upcoming window. */
export function nextOccurrence(now: Date, weekday: number, start: string, end: string, timezone: string) {
  const horizon = now.getTime() + UPCOMING_WINDOW_H * 3_600_000;
  // Start from yesterday so an overnight slot that is still running counts.
  for (let d = -1; d <= 2; d++) {
    const startAt = localTimeOnDay(now, d, start.slice(0, 5), timezone);
    if (zonedParts(startAt, timezone).weekday !== weekday) continue;
    let endAt = localTimeOnDay(now, d, end.slice(0, 5), timezone);
    if (endAt <= startAt) endAt = localTimeOnDay(now, d + 1, end.slice(0, 5), timezone);
    if (endAt.getTime() > now.getTime() && startAt.getTime() < horizon) return { start: startAt, end: endAt };
  }
  return null;
}
