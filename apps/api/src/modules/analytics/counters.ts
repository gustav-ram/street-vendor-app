import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client';

// Aggregate counters only: which vendor, which (vendor-local) day, how many.
// Nothing about who looked.
const COLUMNS = {
  profileViews: sql.raw('profile_views'),
  mapImpressions: sql.raw('map_impressions'),
  directionsTaps: sql.raw('directions_taps'),
  favoritesAdded: sql.raw('favorites_added'),
  favoritesRemoved: sql.raw('favorites_removed'),
  confirmations: sql.raw('confirmations'),
} as const;

export type Counter = keyof typeof COLUMNS;

export async function bumpCounter(db: Db, vendorIds: readonly string[], counter: Counter) {
  if (vendorIds.length === 0) return;
  const col = COLUMNS[counter];
  await db.execute(sql`
    INSERT INTO analytics_daily (vendor_id, day, ${col})
    SELECT v.id, (now() AT TIME ZONE v.timezone)::date, 1
    FROM vendor_profiles v
    WHERE v.id IN ${[...new Set(vendorIds)]}
    ON CONFLICT (vendor_id, day) DO UPDATE SET ${col} = analytics_daily.${col} + 1`);
}
