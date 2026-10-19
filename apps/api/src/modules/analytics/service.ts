import { sql } from 'drizzle-orm';
import type { AnalyticsRange, VendorAnalytics } from '@streeteats/shared';
import type { AppContext } from '../../app';

/**
 * A vendor's daily totals (PLAN.md §6.7): views, map impressions,
 * directions taps, favorites and "Still here?" taps. Only counts per day are
 * stored, so there is nothing about individual customers to show.
 */

const COUNTERS = ['profileViews', 'mapImpressions', 'directionsTaps', 'favoritesAdded', 'favoritesRemoved', 'confirmations'] as const;

export async function vendorAnalytics(ctx: AppContext, vendor: { id: string; timezone: string }, range: AnalyticsRange): Promise<VendorAnalytics> {
  const days = range === '7d' ? 7 : 30;
  // Every day in the range, in the vendor's time zone, zero when nothing happened.
  const rows = await ctx.db.execute<Record<string, string | number>>(sql`
    WITH today AS (SELECT (now() AT TIME ZONE ${vendor.timezone})::date AS d)
    SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
      coalesce(a.profile_views, 0)::int AS "profileViews",
      coalesce(a.map_impressions, 0)::int AS "mapImpressions",
      coalesce(a.directions_taps, 0)::int AS "directionsTaps",
      coalesce(a.favorites_added, 0)::int AS "favoritesAdded",
      coalesce(a.favorites_removed, 0)::int AS "favoritesRemoved",
      coalesce(a.confirmations, 0)::int AS confirmations
    FROM today, generate_series(today.d - ${days - 1}::int, today.d, interval '1 day') AS g(day)
    LEFT JOIN analytics_daily a ON a.vendor_id = ${vendor.id} AND a.day = g.day::date
    ORDER BY g.day`);
  const [fav] = await ctx.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM favorites WHERE vendor_id = ${vendor.id}`);

  const series = rows.map((r) => ({
    day: String(r.day),
    profileViews: Number(r.profileViews),
    mapImpressions: Number(r.mapImpressions),
    directionsTaps: Number(r.directionsTaps),
    favoritesAdded: Number(r.favoritesAdded),
    favoritesRemoved: Number(r.favoritesRemoved),
    confirmations: Number(r.confirmations),
  }));
  const totals = Object.fromEntries(COUNTERS.map((k) => [k, series.reduce((sum, d) => sum + d[k], 0)])) as VendorAnalytics['totals'];
  return { range, days: series, totals, favoritesNow: Number(fav?.n ?? 0) };
}
