import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import {
  menuItems,
  upcomingSpotPosts,
  users,
  vendorLiveSessions,
  vendorProfiles,
  vendorTags,
} from '../src/db/schema';
import { pointSql } from '../src/lib/geo/sql';
import { endLiveSession, startLiveSession } from '../src/modules/live/service';
import { clearSynonymCache } from '../src/modules/search/query';
import { createTestContext, resetDb, uniqueEmail } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let tagIds: Map<string, string>;

const DOWNTOWN = { lat: 34.0453, lng: -118.2509 };
const near = (dLat: number, dLng = 0) => ({ lat: DOWNTOWN.lat + dLat, lng: DOWNTOWN.lng + dLng });

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.db);
  clearSynonymCache();
  tagIds = await seedTags(ctx.db);
});

async function makeVendor(opts: {
  name: string;
  categories?: string[];
  tags?: string[];
  menu?: string[];
  payments?: string[];
  languages?: string[];
  hidden?: boolean;
}) {
  const [u] = await ctx.db.insert(users).values({ role: 'vendor', email: uniqueEmail('v'), passwordHash: 'x' }).returning();
  const [v] = await ctx.db
    .insert(vendorProfiles)
    .values({
      userId: u!.id,
      displayName: opts.name,
      categories: opts.categories ?? [],
      paymentMethods: opts.payments ?? ['cash'],
      languages: opts.languages ?? ['es'],
      hidden: opts.hidden ?? false,
    })
    .returning();
  for (const slug of opts.tags ?? []) await ctx.db.insert(vendorTags).values({ vendorId: v!.id, tagId: tagIds.get(slug)! });
  for (const [i, name] of (opts.menu ?? []).entries()) {
    await ctx.db.insert(menuItems).values({ vendorId: v!.id, name, priceCents: 500, sortOrder: i });
  }
  return v!.id;
}

// hidden: false even for vacation-mode vendors, to prove search filters them out
// on its own (the API refuses to start a session for them).
const goLive = (vendorId: string, at = near(0.005)) =>
  startLiveSession(ctx.app.ctx, { id: vendorId, timezone: 'America/Los_Angeles', hidden: false, defaultPrecision: 'approximate' }, at);

async function search(body: Record<string, unknown>) {
  const res = await ctx.app.inject({ method: 'POST', url: '/v1/search', payload: { location: DOWNTOWN, ...body } });
  expect(res.statusCode).toBe(200);
  return res.json() as {
    live: Array<{ id: string; displayName: string; distanceM: number; live: { location: { lat: number; lng: number } } }>;
    upcoming: Array<{ id: string; spot: { kind: string } }>;
    matchedTags: Array<{ slug: string }>;
  };
}

const names = (r: { live: Array<{ displayName: string }> }) => r.live.map((x) => x.displayName).sort();

describe('offline vendors never appear', () => {
  it('only vendors with a live session are returned', async () => {
    const live = await makeVendor({ name: 'Live Dogs', categories: ['hot_dogs'] });
    await makeVendor({ name: 'Offline Dogs', categories: ['hot_dogs'] });
    await goLive(live);
    expect(names(await search({}))).toEqual(['Live Dogs']);
    expect(names(await search({ q: 'dogs' }))).toEqual(['Live Dogs']);
  });

  it('a vendor disappears as soon as they go offline', async () => {
    const v = await makeVendor({ name: 'Quick Exit' });
    await goLive(v);
    expect(names(await search({}))).toEqual(['Quick Exit']);
    await endLiveSession(ctx.app.ctx, v);
    expect((await search({})).live).toEqual([]);
    expect(await ctx.db.$count(vendorLiveSessions)).toBe(0);
  });

  it('expired heartbeats and passed end times hide a vendor even before the sweeper runs', async () => {
    const lostSignal = await makeVendor({ name: 'Lost Signal' });
    const timerUp = await makeVendor({ name: 'Timer Up' });
    await goLive(lostSignal);
    await goLive(timerUp);
    await ctx.db.update(vendorLiveSessions).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(vendorLiveSessions.vendorId, lostSignal));
    await ctx.db.update(vendorLiveSessions).set({ endsAt: sql`now() - interval '1 second'` }).where(eq(vendorLiveSessions.vendorId, timerUp));
    expect((await search({})).live).toEqual([]);
    const profile = await ctx.app.inject({ method: 'GET', url: `/v1/vendors/${lostSignal}` });
    expect(profile.json().live).toBeNull();
  });

  it('vacation mode hides a vendor from search and their profile, even while live', async () => {
    const v = await makeVendor({ name: 'On Vacation', hidden: true });
    await goLive(v);
    expect((await search({})).live).toEqual([]);
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/vendors/${v}` })).statusCode).toBe(404);
  });

  it('upcoming results skip vendors who are live and posts whose window ended', async () => {
    const planner = await makeVendor({ name: 'Planner' });
    const liveNow = await makeVendor({ name: 'Live Now' });
    const post = (vendorId: string, startH: number, endH: number) => ({
      vendorId,
      publicPoint: pointSql(near(0.01)),
      precision: 'approximate' as const,
      startsAt: new Date(Date.now() + startH * 3_600_000),
      endsAt: new Date(Date.now() + endH * 3_600_000),
    });
    await ctx.db.insert(upcomingSpotPosts).values([post(planner, 20, 25), post(planner, -5, -1), post(liveNow, 20, 25)]);
    await goLive(liveNow);
    const r = await search({ include: ['upcoming'] });
    expect(r.live).toEqual([]);
    expect(r.upcoming.map((u) => u.id)).toEqual([planner]);
  });
});

describe('locations in results', () => {
  it('returns the fuzzed point (never the true spot) and a rounded distance', async () => {
    const v = await makeVendor({ name: 'Fuzzy' });
    const truth = near(0.0071, 0.0033);
    await goLive(v, truth);
    const [r] = (await search({})).live;
    expect(r!.live.location).not.toEqual(truth);
    expect(r!.distanceM % 50).toBe(0);
    // Same answer every time.
    const again = (await search({})).live[0]!;
    expect(again.live.location).toEqual(r!.live.location);
  });

  it('respects the radius', async () => {
    const close = await makeVendor({ name: 'Close' });
    const far = await makeVendor({ name: 'Far' });
    await goLive(close, near(0.01));
    await goLive(far, near(0.2));
    expect(names(await search({ radiusM: 5000 }))).toEqual(['Close']);
    expect(names(await search({ radiusM: 50000 }))).toEqual(['Close', 'Far']);
  });

  it('does not expose account data in results or profiles', async () => {
    const v = await makeVendor({ name: 'Private Person' });
    await goLive(v);
    const [owner] = await ctx.db.select({ id: users.id, email: users.email }).from(users).innerJoin(vendorProfiles, eq(vendorProfiles.userId, users.id)).where(eq(vendorProfiles.id, v));
    const body = JSON.stringify(await search({})) + (await ctx.app.inject({ method: 'GET', url: `/v1/vendors/${v}` })).body;
    expect(body).not.toContain(owner!.id);
    expect(body).not.toContain(owner!.email!);
  });
});

describe('search terms and filters', () => {
  beforeEach(async () => {
    const vendors = [
      { name: 'Bacon Wrapped Co', categories: ['hot_dogs'], tags: ['hot-dog', 'bacon-wrapped-hot-dog'] },
      { name: 'Hermosillo Dogs', categories: ['hot_dogs'], tags: ['sonoran-dog'], payments: ['cash', 'card'] },
      { name: 'Plain Franks', categories: ['hot_dogs'] },
      { name: 'Tacos El Primo', categories: ['tacos'], tags: ['tacos', 'al-pastor'], menu: ['Taco al pastor'], languages: ['es', 'zap'] },
      { name: 'Rosas de Maria', categories: ['flowers'], menu: ['Docena de rosas'] },
      { name: 'Hotteok House', categories: ['snacks'], tags: ['korean-street-food'], languages: ['ko', 'en'], payments: ['card'] },
    ];
    for (const [i, v] of vendors.entries()) await goLive(await makeVendor(v), near(0.002 * (i + 1)));
  });

  it('"LA style hot dog" finds bacon-wrapped and Sonoran dog vendors through synonyms', async () => {
    const r = await search({ q: 'LA style hot dog' });
    expect(r.matchedTags.map((t) => t.slug).sort()).toEqual(['bacon-wrapped-hot-dog', 'danger-dog', 'sonoran-dog']);
    expect(names(r)).toEqual(['Bacon Wrapped Co', 'Hermosillo Dogs']);
  });

  it('category words match vendors without tags, in English or Spanish', async () => {
    expect(names(await search({ q: 'hot dogs' }))).toEqual(['Bacon Wrapped Co', 'Hermosillo Dogs', 'Plain Franks']);
    expect(names(await search({ q: 'perros calientes' }))).toEqual(['Bacon Wrapped Co', 'Hermosillo Dogs', 'Plain Franks']);
    expect(names(await search({ q: 'flores' }))).toEqual(['Rosas de Maria']);
  });

  it('matches menu items, accents and typos', async () => {
    expect(names(await search({ q: 'pastor' }))).toEqual(['Tacos El Primo']);
    expect(names(await search({ q: 'ROSAS' }))).toEqual(['Rosas de Maria']);
    expect(names(await search({ q: 'hoteok' }))).toEqual(['Hotteok House']);
  });

  it('puts an exact name match first, otherwise sorts by distance', async () => {
    const r = await search({ q: 'plain franks hot dog' });
    expect(r.live[0]!.displayName).toBe('Plain Franks');
    const byDistance = (await search({ q: 'hot dog' })).live.map((x) => x.distanceM);
    expect(byDistance).toEqual([...byDistance].sort((a, b) => a - b));
  });

  it('filters by category, payment method and spoken language', async () => {
    expect(names(await search({ filters: { categories: ['tacos', 'flowers'] } }))).toEqual(['Rosas de Maria', 'Tacos El Primo']);
    expect(names(await search({ filters: { paymentMethods: ['card'] } }))).toEqual(['Hermosillo Dogs', 'Hotteok House']);
    expect(names(await search({ filters: { languages: ['zap'] } }))).toEqual(['Tacos El Primo']);
    expect(names(await search({ q: 'hot dog', filters: { paymentMethods: ['card'] } }))).toEqual(['Hermosillo Dogs']);
  });

  it('rejects invalid input', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/search', payload: { location: { lat: 200, lng: 0 } } });
    expect(res.statusCode).toBe(400);
  });
});
