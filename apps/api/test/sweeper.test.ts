import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { upcomingSpotPosts, users, vendorLiveSessions, vendorProfiles } from '../src/db/schema';
import { pointSql } from '../src/lib/geo/sql';
import { runSweep } from '../src/jobs/sweeper';
import { createTestContext, resetDb, uniqueEmail } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx.db));

const minutes = (n: number) => new Date(Date.now() + n * 60_000);

async function makeVendor(name: string) {
  const [u] = await ctx.db.insert(users).values({ role: 'vendor', email: uniqueEmail(), passwordHash: 'x' }).returning();
  const [v] = await ctx.db.insert(vendorProfiles).values({ userId: u!.id, displayName: name }).returning();
  return v!.id;
}

async function goLive(vendorId: string, expiresAt: Date, endsAt: Date) {
  await ctx.db.insert(vendorLiveSessions).values({
    vendorId,
    publicPoint: pointSql({ lat: 34.05, lng: -118.25 }),
    precision: 'approximate',
    expiresAt,
    endsAt,
  });
}

describe('sweeper', () => {
  it('deletes live sessions whose heartbeats stopped or whose end time passed, with their location', async () => {
    const lostSignal = await makeVendor('Lost signal');
    const timerUp = await makeVendor('Timer up');
    const stillLive = await makeVendor('Still live');
    await goLive(lostSignal, minutes(-1), minutes(120));
    await goLive(timerUp, minutes(4), minutes(-1));
    await goLive(stillLive, minutes(4), minutes(120));

    const result = await runSweep(ctx.db);
    expect(result.liveSessions).toBe(2);
    const remaining = await ctx.db.select({ vendorId: vendorLiveSessions.vendorId }).from(vendorLiveSessions);
    expect(remaining.map((r) => r.vendorId)).toEqual([stillLive]);
    // No other table holds a copy of the deleted coordinates.
    const geoColumns = await ctx.db.execute(sql`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND udt_name IN ('geography', 'geometry') AND table_name <> 'spatial_ref_sys'
      ORDER BY table_name`);
    expect(geoColumns.map((r) => r.table_name)).toEqual(['schedule_entries', 'upcoming_spot_posts', 'vendor_live_sessions']);
  });

  it('deletes "tomorrow" posts an hour after their window ends', async () => {
    const v = await makeVendor('Planner');
    const post = (startsAt: Date, endsAt: Date) => ({
      vendorId: v,
      publicPoint: pointSql({ lat: 34.05, lng: -118.25 }),
      precision: 'approximate' as const,
      startsAt,
      endsAt,
    });
    await ctx.db.insert(upcomingSpotPosts).values([
      post(minutes(-300), minutes(-90)), // ended 1.5 h ago: deleted
      post(minutes(-120), minutes(-30)), // ended 30 min ago: kept for now
      post(minutes(60), minutes(300)), // upcoming: kept
    ]);
    const result = await runSweep(ctx.db);
    expect(result.upcomingPosts).toBe(1);
    expect(await ctx.db.$count(upcomingSpotPosts)).toBe(2);
  });
});
