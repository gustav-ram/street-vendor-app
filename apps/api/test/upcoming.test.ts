import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import { runSweep } from '../src/jobs/sweeper';
import { distanceMeters } from '../src/lib/geo/fuzz';
import { clearSynonymCache } from '../src/modules/search/query';
import { createTestContext, onboardedVendor, resetDb, signUp } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext({ captureLogs: true });
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.db);
  clearSynonymCache();
  await seedTags(ctx.db);
});

// A real-looking corner, with more decimals than anything we publish.
const SPOT = { lat: 34.0431127, lng: -118.2667893 };
type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, headers: Headers = {}, payload?: unknown) =>
  ctx.app.inject({ method, url, headers, payload: payload as Record<string, unknown> });

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const now = () => new Date().toISOString();

function post(over: Record<string, unknown> = {}) {
  return { location: SPOT, placeLabel: 'Near 5th & Main', note: 'Bacon dogs till late', startsAt: hours(20), endsAt: hours(25), clientUpdatedAt: now(), ...over };
}

const putPost = (headers: Headers, id: string, body: Record<string, unknown>) => call('PUT', `/v1/vendor/upcoming/${id}`, headers, body);
const search = async (include: Array<'live' | 'upcoming'> = ['live', 'upcoming']) =>
  (await call('POST', '/v1/search', {}, { location: { lat: 34.045, lng: -118.26 }, include })).json() as {
    upcoming: Array<{ id: string; spot: { id: string; kind: string; location: { lat: number; lng: number; precision: string } } }>;
  };

describe('"where I\'ll be tomorrow" posts', () => {
  it('publishes an approximate area by default, and the exact spot is never stored', async () => {
    const v = await onboardedVendor(ctx);
    const id = crypto.randomUUID();
    expect((await putPost(v.headers, id, post())).json()).toEqual({ result: 'applied' });

    // What's in the database is the snapped point, about 150 m at most from the real one, never the real one.
    const [row] = await ctx.db.execute<{ lat: number; lng: number; precision: string; cell_key: string }>(sql`
      SELECT ST_Y(public_point::geometry) AS lat, ST_X(public_point::geometry) AS lng, precision, cell_key FROM upcoming_spot_posts`);
    expect(row!.precision).toBe('approximate');
    expect(row!.cell_key).toMatch(/^-?\d+:-?\d+$/);
    const stored = { lat: Number(row!.lat), lng: Number(row!.lng) };
    expect(distanceMeters(stored, SPOT)).toBeGreaterThan(1);
    expect(distanceMeters(stored, SPOT)).toBeLessThan(160);
    const dump = JSON.stringify(await ctx.db.execute(sql`SELECT * FROM upcoming_spot_posts`));
    expect(dump).not.toContain('34.04311');
    expect(dump).not.toContain('-118.26678');
    expect(ctx.logs.join('\n')).not.toContain('34.04311');

    // Customers, and the vendor's own dashboard, see only that point.
    const profile = (await call('GET', `/v1/vendors/${v.vendorId}`)).json();
    expect(profile.upcoming).toMatchObject([{ id, kind: 'post', placeLabel: 'Near 5th & Main', location: { ...stored, precision: 'approximate' } }]);
    const mine = (await call('GET', '/v1/vendor/me', v.headers)).json();
    expect(mine.upcoming).toMatchObject([{ id, location: { ...stored, precision: 'approximate' } }]);
    expect((await search()).upcoming).toMatchObject([{ id: v.vendorId, spot: { id, location: { ...stored, precision: 'approximate' } } }]);
  });

  it('gives the same point for the same spot every time, so posts can\'t be averaged to find the corner', async () => {
    const v = await onboardedVendor(ctx);
    const points = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const id = crypto.randomUUID();
      // Each time from a few meters away, like a phone's GPS would.
      await putPost(v.headers, id, post({ location: { lat: SPOT.lat + i * 0.00002, lng: SPOT.lng - i * 0.00002 } }));
    }
    const rows = await ctx.db.execute<{ p: string }>(sql`SELECT ST_AsText(public_point) AS p FROM upcoming_spot_posts`);
    rows.forEach((r) => points.add(r.p));
    expect(points.size).toBe(1);

    // Editing a post and sending back the point it shows doesn't move it.
    const [first] = (await call('GET', '/v1/vendor/me', v.headers)).json().upcoming;
    await putPost(v.headers, first.id, post({ location: { lat: first.location.lat, lng: first.location.lng }, note: 'edited', clientUpdatedAt: hours(0.01) }));
    const [again] = (await call('GET', '/v1/vendor/me', v.headers)).json().upcoming.filter((u: { id: string }) => u.id === first.id);
    expect(again.location).toEqual(first.location);
    expect(again.note).toBe('edited');
  });

  it('in exact mode publishes the spot rounded to ~1 m', async () => {
    const v = await onboardedVendor(ctx);
    await putPost(v.headers, crypto.randomUUID(), post({ precision: 'exact' }));
    const [u] = (await call('GET', `/v1/vendors/${v.vendorId}`)).json().upcoming;
    expect(u.location).toEqual({ lat: 34.04311, lng: -118.26679, precision: 'exact' });
  });

  it('disappears once its window ends, and is deleted an hour later', async () => {
    const v = await onboardedVendor(ctx);
    const id = crypto.randomUUID();
    await putPost(v.headers, id, post({ startsAt: hours(1), endsAt: hours(3) }));
    expect((await search()).upcoming).toHaveLength(1);

    // The window ended 30 minutes ago: hidden everywhere right away, sweeper or not.
    await ctx.db.execute(sql`UPDATE upcoming_spot_posts SET starts_at = now() - interval '3 hours', ends_at = now() - interval '30 minutes'`);
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().upcoming).toEqual([]);
    expect((await call('GET', '/v1/vendor/me', v.headers)).json().upcoming).toEqual([]);
    expect((await search()).upcoming).toEqual([]);
    expect((await runSweep(ctx.db)).upcomingPosts).toBe(0);

    // An hour after the window: gone from the database.
    await ctx.db.execute(sql`UPDATE upcoming_spot_posts SET ends_at = now() - interval '61 minutes'`);
    expect((await runSweep(ctx.db)).upcomingPosts).toBe(1);
    expect((await ctx.db.execute(sql`SELECT count(*)::int AS n FROM upcoming_spot_posts`))[0]!.n).toBe(0);
  });

  it('shows only in the next 48 hours of search, but on the profile and to favorites further out', async () => {
    const v = await onboardedVendor(ctx);
    await putPost(v.headers, crypto.randomUUID(), post({ startsAt: hours(24 * 5), endsAt: hours(24 * 5 + 4) }));
    expect((await search()).upcoming).toEqual([]);
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().upcoming).toHaveLength(1);
    const c = await signUp(ctx, 'customer');
    await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, { authorization: c.authorization });
    const favs = (await call('GET', '/v1/me/favorites', { authorization: c.authorization })).json();
    expect(favs.favorites[0].upcoming).toHaveLength(1);
  });

  it('applies offline edits by last-write-wins, and retries are harmless', async () => {
    const v = await onboardedVendor(ctx);
    const id = crypto.randomUUID();
    const t1 = hours(-0.1);
    const t2 = hours(-0.05);
    expect((await putPost(v.headers, id, post({ note: 'first', clientUpdatedAt: t1 }))).json().result).toBe('applied');
    // The outbox retrying the very same request.
    expect((await putPost(v.headers, id, post({ note: 'first', clientUpdatedAt: t1 }))).json().result).toBe('applied');
    expect((await putPost(v.headers, id, post({ note: 'newer', clientUpdatedAt: t2 }))).json().result).toBe('applied');
    // A queued change made before the newer one arrives late: superseded, nothing written.
    expect((await putPost(v.headers, id, post({ note: 'stale', clientUpdatedAt: t1 }))).json().result).toBe('superseded');
    expect((await call('GET', '/v1/vendor/me', v.headers)).json().upcoming).toMatchObject([{ id, note: 'newer' }]);
    expect((await ctx.db.execute(sql`SELECT count(*)::int AS n FROM upcoming_spot_posts`))[0]!.n).toBe(1);

    // A delete beats older edits, so a late offline edit can't bring the post back.
    expect((await call('DELETE', `/v1/vendor/upcoming/${id}`, v.headers, { clientUpdatedAt: now() })).json().result).toBe('applied');
    expect((await putPost(v.headers, id, post({ note: 'late', clientUpdatedAt: t2 }))).json().result).toBe('superseded');
    expect((await call('GET', '/v1/vendor/me', v.headers)).json().upcoming).toEqual([]);
  });

  it('refuses posts whose time has passed, windows that are too long or too far ahead, and too many posts', async () => {
    const v = await onboardedVendor(ctx);
    const res = await putPost(v.headers, crypto.randomUUID(), post({ startsAt: hours(-5), endsAt: hours(-1) }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('window_ended');
    expect((await putPost(v.headers, crypto.randomUUID(), post({ startsAt: hours(1), endsAt: hours(20) }))).statusCode).toBe(400);
    expect((await putPost(v.headers, crypto.randomUUID(), post({ startsAt: hours(24 * 15), endsAt: hours(24 * 15 + 2) }))).statusCode).toBe(400);
    expect((await putPost(v.headers, crypto.randomUUID(), post({ startsAt: hours(5), endsAt: hours(4) }))).statusCode).toBe(400);

    for (let i = 0; i < 10; i++) expect((await putPost(v.headers, crypto.randomUUID(), post())).statusCode).toBe(200);
    expect((await putPost(v.headers, crypto.randomUUID(), post())).statusCode).toBe(400);
  });

  it('can\'t touch another vendor\'s post', async () => {
    const a = await onboardedVendor(ctx);
    const b = await onboardedVendor(ctx);
    const id = crypto.randomUUID();
    await putPost(a.headers, id, post());
    expect((await putPost(b.headers, id, post({ clientUpdatedAt: hours(0.01) }))).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/vendor/upcoming/${id}`, b.headers, { clientUpdatedAt: hours(0.01) })).statusCode).toBe(404);
    const c = await signUp(ctx, 'customer');
    expect((await putPost({ authorization: c.authorization }, crypto.randomUUID(), post())).statusCode).toBe(403);
  });
});

describe('weekly schedule', () => {
  // Tomorrow in the vendor's timezone, so the slot is always inside the 48-hour Upcoming window.
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const tomorrow = (days.indexOf(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).format(new Date())) + 1) % 7;
  const entry = (over: Record<string, unknown> = {}) => ({ weekday: tomorrow, startTime: '00:00', endTime: '23:59', location: SPOT, placeLabel: 'Fridays near the park', ...over });

  it('only shows when published, with the spot fuzzed like everything else', async () => {
    const v = await onboardedVendor(ctx);
    const saved = (await call('PUT', '/v1/vendor/schedule', v.headers, { published: false, entries: [entry(), entry({ weekday: (tomorrow + 3) % 7, location: null })] })).json();
    expect(saved.schedule.published).toBe(false);
    expect(saved.schedule.entries).toHaveLength(2);
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().schedule).toEqual([]);
    expect((await search()).upcoming).toEqual([]);

    const pub = (await call('PUT', '/v1/vendor/schedule', v.headers, { published: true, entries: [entry()] })).json();
    const spot = pub.schedule.entries[0].location;
    expect(spot.precision).toBe('approximate');
    expect(distanceMeters(spot, SPOT)).toBeGreaterThan(1);
    expect(distanceMeters(spot, SPOT)).toBeLessThan(160);
    const profile = (await call('GET', `/v1/vendors/${v.vendorId}`)).json();
    expect(profile.schedule).toMatchObject([{ placeLabel: 'Fridays near the park', location: spot }]);
    expect((await search()).upcoming).toMatchObject([{ id: v.vendorId, spot: { kind: 'schedule', location: spot } }]);
    const dump = JSON.stringify(await ctx.db.execute(sql`SELECT * FROM schedule_entries`));
    expect(dump).not.toContain('34.04311');

    // Saving again with the spot it shows doesn't move it.
    const again = (await call('PUT', '/v1/vendor/schedule', v.headers, { published: true, entries: [entry({ location: { lat: spot.lat, lng: spot.lng } })] })).json();
    expect(again.schedule.entries[0].location).toEqual(spot);

    // Clearing it removes every entry.
    expect((await call('PUT', '/v1/vendor/schedule', v.headers, { published: true, entries: [] })).json().schedule.entries).toEqual([]);
  });

  it('rejects slots that start and end at the same time or bad times', async () => {
    const v = await onboardedVendor(ctx);
    expect((await call('PUT', '/v1/vendor/schedule', v.headers, { published: true, entries: [entry({ startTime: '10:00', endTime: '10:00' })] })).statusCode).toBe(400);
    expect((await call('PUT', '/v1/vendor/schedule', v.headers, { published: true, entries: [entry({ startTime: '25:00' })] })).statusCode).toBe(400);
  });
});
