import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import { analyticsDaily, hashPeppers, reports, reviews, stillHereConfirmations, vendorLiveSessions, vendorStatusPosts } from '../src/db/schema';
import { runSweep } from '../src/jobs/sweeper';
import { epochOf } from '../src/modules/community/still-here';
import { clearSynonymCache } from '../src/modules/search/query';
import { ageAccount, createTestContext, onboardedVendor, resetDb, signUp, signUpAdmin } from './helpers';

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

const SPOT = { lat: 34.043112, lng: -118.266789 };
type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Headers = {}, payload?: unknown) =>
  ctx.app.inject({ method, url, headers, payload: payload as Record<string, unknown> });

async function liveVendor(precision: 'approximate' | 'exact' = 'approximate') {
  const v = await onboardedVendor(ctx);
  const res = await call('POST', '/v1/vendor/live', v.headers, { location: SPOT, precision });
  return { ...v, publicPoint: res.json().location as { lat: number; lng: number } };
}

/** A customer whose account is old enough to confirm vendors. */
async function customer(displayName?: string) {
  const c = await signUp(ctx, 'customer', displayName);
  await ageAccount(ctx, c.userId, 48);
  return { ...c, headers: { authorization: c.authorization } };
}

const confirm = (vendorId: string, headers: Headers, location = SPOT) => call('POST', `/v1/vendors/${vendorId}/still-here`, headers, { location });

describe('"Still here?" confirmations', () => {
  it('confirms a nearby live vendor and stores no location or identity', async () => {
    const v = await liveVendor();
    const c = await customer();
    const res = await confirm(v.vendorId, c.headers, { lat: SPOT.lat + 0.0005, lng: SPOT.lng });
    expect(res.json()).toEqual({ status: 'confirmed' });

    const rows = await ctx.db.execute(sql`SELECT * FROM still_here_confirmations`);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['confirmer_hash', 'counted', 'created_at', 'epoch', 'id', 'local_day', 'vendor_id']);
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(c.userId);
    expect(stored).not.toContain(c.email);
    expect(stored).not.toContain('34.04');
    expect(stored).not.toContain('-118.26');
    // Nor in the logs.
    expect(ctx.logs.join('\n')).not.toContain('34.0436');

    const profile = (await call('GET', `/v1/vendors/${v.vendorId}`)).json();
    expect(profile.live.customerConfirmedAt).not.toBeNull();
    const [counter] = await ctx.db.select().from(analyticsDaily).where(eq(analyticsDaily.vendorId, v.vendorId));
    expect(counter!.confirmations).toBe(1);
  });

  it('requires being near the public point: ~400 m in approximate mode, ~200 m in exact mode', async () => {
    const approx = await liveVendor('approximate');
    const exact = await liveVendor('exact');
    const c = await customer();
    // ~300 m north of each public point.
    const north = (p: { lat: number; lng: number }) => ({ lat: p.lat + 0.0027, lng: p.lng });
    expect((await confirm(approx.vendorId, c.headers, north(approx.publicPoint))).json().status).toBe('confirmed');
    const far = await confirm(exact.vendorId, c.headers, north(exact.publicPoint));
    expect(far.statusCode).toBe(422);
    expect(far.json().error.code).toBe('too_far');
  });

  it('only counts while the vendor is live', async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer();
    expect((await confirm(v.vendorId, c.headers)).json().error.code).toBe('not_live');
  });

  it('refuses brand-new accounts, vendor accounts, signed-out people and blocked people', async () => {
    const v = await liveVendor();
    const fresh = await signUp(ctx, 'customer');
    expect((await confirm(v.vendorId, { authorization: fresh.authorization })).json().error.code).toBe('account_too_new');

    // The vendor themselves, or any other vendor.
    expect((await confirm(v.vendorId, v.headers)).statusCode).toBe(403);
    const otherVendor = await onboardedVendor(ctx);
    await ageAccount(ctx, otherVendor.userId, 48);
    expect((await confirm(v.vendorId, otherVendor.headers)).statusCode).toBe(403);
    expect((await confirm(v.vendorId, {})).statusCode).toBe(401);

    const c = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 1, body: 'meh' });
    const [review] = await ctx.db.select().from(reviews);
    await call('POST', '/v1/vendor/blocks', v.headers, { reviewId: review!.id });
    expect((await confirm(v.vendorId, c.headers)).statusCode).toBe(403);
    expect(await ctx.db.$count(stillHereConfirmations)).toBe(0);
  });

  it('one per person per vendor per day, and only one per week counts toward the badge', async () => {
    const v = await liveVendor();
    const c = await customer();
    const ageRows = (hours: number) =>
      ctx.db.execute(sql`UPDATE still_here_confirmations SET created_at = created_at - make_interval(hours => ${hours})`);

    expect((await confirm(v.vendorId, c.headers)).json().status).toBe('confirmed');
    expect((await confirm(v.vendorId, c.headers)).json().status).toBe('already_confirmed');
    expect(await ctx.db.$count(stillHereConfirmations)).toBe(1);

    await ageRows(25); // next day: accepted, but doesn't count again this week
    expect((await confirm(v.vendorId, c.headers)).json().status).toBe('confirmed');
    await ageRows(24 * 8); // a week later: counts again
    expect((await confirm(v.vendorId, c.headers)).json().status).toBe('confirmed');

    const counted = await ctx.db
      .select({ counted: stillHereConfirmations.counted })
      .from(stillHereConfirmations)
      .orderBy(stillHereConfirmations.createdAt);
    expect(counted.map((r) => r.counted)).toEqual([true, false, true]);

    // A different person counts separately.
    const other = await customer();
    expect((await confirm(v.vendorId, other.headers)).json().status).toBe('confirmed');
    expect(await ctx.db.$count(stillHereConfirmations, eq(stillHereConfirmations.counted, true))).toBe(3);
  });

  it('caps how many vendors one account can confirm per day', async () => {
    const saved = ctx.config.stillHere.dailyLimit;
    ctx.config.stillHere.dailyLimit = 2;
    try {
      const c = await customer();
      const vendors = [await liveVendor(), await liveVendor(), await liveVendor()];
      expect((await confirm(vendors[0]!.vendorId, c.headers)).json().status).toBe('confirmed');
      expect((await confirm(vendors[1]!.vendorId, c.headers)).json().status).toBe('confirmed');
      expect((await confirm(vendors[2]!.vendorId, c.headers)).statusCode).toBe(429);
    } finally {
      ctx.config.stillHere.dailyLimit = saved;
    }
  });

  it('hashes change with each 30-day pepper, and old peppers and rows are deleted', async () => {
    const v = await liveVendor();
    const c = await customer();
    await confirm(v.vendorId, c.headers);
    const [first] = await ctx.db.select().from(stillHereConfirmations);
    const current = epochOf(new Date());
    expect(first!.epoch).toBe(current);

    // Rotate: pretend this pepper is from the previous epoch and a new one takes over.
    await ctx.db.update(hashPeppers).set({ epoch: current - 1 });
    await ctx.db.update(stillHereConfirmations).set({ epoch: current - 1, createdAt: sql`now() - interval '26 hours'` });
    // The previous epoch is still checked, so the rotation can't be used to double-count this week.
    await confirm(v.vendorId, c.headers);
    const rows = await ctx.db.select().from(stillHereConfirmations).orderBy(stillHereConfirmations.createdAt);
    expect(rows[1]!.confirmerHash).not.toBe(rows[0]!.confirmerHash);
    expect(rows[1]!.counted).toBe(false);

    // Two epochs on, the old pepper goes, and rows older than 30 days go too.
    await ctx.db.insert(hashPeppers).values({ epoch: current - 2, secret: 'old' });
    await ctx.db.update(stillHereConfirmations).set({ createdAt: sql`now() - interval '31 days'` }).where(eq(stillHereConfirmations.id, rows[0]!.id));
    await runSweep(ctx.db);
    const epochs = (await ctx.db.select({ epoch: hashPeppers.epoch }).from(hashPeppers)).map((p) => p.epoch).sort();
    expect(epochs).toEqual([current - 1, current]);
    expect(await ctx.db.$count(stillHereConfirmations)).toBe(1);
  });

  it('the viewer endpoint says whether you already confirmed today', async () => {
    const v = await liveVendor();
    const c = await customer();
    expect((await call('GET', `/v1/vendors/${v.vendorId}/viewer`, c.headers)).json().confirmedRecently).toBe(false);
    await confirm(v.vendorId, c.headers);
    expect((await call('GET', `/v1/vendors/${v.vendorId}/viewer`, c.headers)).json()).toMatchObject({ confirmedRecently: true, isOwner: false });
    expect((await call('GET', `/v1/vendors/${v.vendorId}/viewer`, v.headers)).json().isOwner).toBe(true);
  });
});

describe('reviews', () => {
  it('one review per customer per vendor; posting again edits it', async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer('Maya R.');
    expect((await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 4, body: 'Great dogs' })).json()).toMatchObject({
      rating: 4,
      moderation: 'approved',
    });
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 5, body: 'Even better the second time' });
    expect(await ctx.db.$count(reviews)).toBe(1);
    const profile = (await call('GET', `/v1/vendors/${v.vendorId}`)).json();
    expect(profile.rating).toEqual({ average: 5, count: 1 });
    expect(profile.reviews[0]).toMatchObject({ rating: 5, authorName: 'Maya R.' });
    expect(JSON.stringify(profile)).not.toContain(c.email);
    expect(JSON.stringify(profile)).not.toContain(c.userId);
  });

  it('holds reviews with links, phone numbers or slurs for a moderator, but not spicy salsa', async () => {
    const v = await onboardedVendor(ctx);
    const texts: Array<[string, string]> = [
      ['Best spicy salsa in Boyle Heights', 'approved'],
      ['Call him at (323) 555-0199 for catering', 'pending'],
      ['Order at www.example.com instead', 'pending'],
      ['Que pendejo el señor', 'pending'],
    ];
    for (const [body, expected] of texts) {
      const c = await customer();
      expect((await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 3, body })).json().moderation, body).toBe(expected);
    }
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().reviews).toHaveLength(1);

    const admin = await signUpAdmin(ctx);
    const queue = (await call('GET', '/v1/admin/moderation', admin.headers)).json();
    expect(queue.reviews).toHaveLength(3);
    await call('POST', `/v1/admin/moderation/review/${queue.reviews[0].id}`, admin.headers, { decision: 'approved' });
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().reviews).toHaveLength(2);
  });

  it('only customers review, never the vendor of the page', async () => {
    const v = await onboardedVendor(ctx);
    expect((await call('PUT', `/v1/vendors/${v.vendorId}/review`, v.headers, { rating: 5 })).statusCode).toBe(403);
    const rival = await onboardedVendor(ctx);
    expect((await call('PUT', `/v1/vendors/${v.vendorId}/review`, rival.headers, { rating: 1 })).statusCode).toBe(403);
    expect((await call('PUT', `/v1/vendors/${v.vendorId}/review`, {}, { rating: 1 })).statusCode).toBe(401);
  });

  it('vendors reply publicly', async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 2, body: 'Ran out of onions' });
    const mine = (await call('GET', '/v1/vendor/reviews', v.headers)).json().reviews;
    await call('PUT', `/v1/vendor/reviews/${mine[0].id}/reply`, v.headers, { body: 'Sorry! Restocked now.' });
    const profile = (await call('GET', `/v1/vendors/${v.vendorId}`)).json();
    expect(profile.reviews[0].vendorReply).toBe('Sorry! Restocked now.');
    // Only on their own page.
    const other = await onboardedVendor(ctx);
    expect((await call('PUT', `/v1/vendor/reviews/${mine[0].id}/reply`, other.headers, { body: 'hi' })).statusCode).toBe(404);
  });

  it("blocking stops new reviews but leaves the existing one up, and never reveals who it is", async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer('Kevin T.');
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 1, body: 'Cold food' });
    const [review] = (await call('GET', '/v1/vendor/reviews', v.headers)).json().reviews;
    expect((await call('POST', '/v1/vendor/blocks', v.headers, { reviewId: review.id })).statusCode).toBe(200);

    expect((await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 1, body: 'Again' })).statusCode).toBe(403);
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().reviews).toHaveLength(1);
    const blocks = (await call('GET', '/v1/vendor/blocks', v.headers)).json().blocks;
    expect(blocks).toEqual([expect.objectContaining({ name: 'Kevin T.' })]);
    expect(JSON.stringify(blocks)).not.toContain(c.userId);
    expect((await call('GET', '/v1/vendor/reviews', v.headers)).json().reviews[0].authorBlocked).toBe(true);

    await call('DELETE', `/v1/vendor/blocks/${blocks[0].id}`, v.headers);
    expect((await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 3, body: 'Better' })).statusCode).toBe(200);
  });
});

describe('favorites', () => {
  it('saves a vendor with an optional "notify when open" flag, and counts adds and removes', async () => {
    const v = await liveVendor();
    const c = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, c.headers, { notifyOnOpen: true });
    await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, c.headers, { notifyOnOpen: false });
    const list = (await call('GET', '/v1/me/favorites', c.headers)).json().favorites;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ notifyOnOpen: false, vendor: { id: v.vendorId } });
    expect(list[0].live).not.toBeNull();

    await call('DELETE', `/v1/vendors/${v.vendorId}/favorite`, c.headers);
    expect((await call('GET', '/v1/me/favorites', c.headers)).json().favorites).toEqual([]);
    const [counter] = await ctx.db.select().from(analyticsDaily).where(eq(analyticsDaily.vendorId, v.vendorId));
    expect(counter).toMatchObject({ favoritesAdded: 1, favoritesRemoved: 1 });
  });

  it('vendors in vacation mode drop out of favorites until they come back', async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer();
    expect((await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, c.headers)).statusCode).toBe(200);
    expect((await call('GET', '/v1/me/favorites', c.headers)).json().favorites).toHaveLength(1);
    await call('PATCH', '/v1/vendor/me', v.headers, { hidden: true });
    expect((await call('GET', '/v1/me/favorites', c.headers)).json().favorites).toEqual([]);
    await call('PATCH', '/v1/vendor/me', v.headers, { hidden: false });
    expect((await call('GET', '/v1/me/favorites', c.headers)).json().favorites).toHaveLength(1);
  });
});

describe('reports', () => {
  it('anyone signed in can report; moderators never see who reported', async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer();
    const res = await call('POST', '/v1/reports', c.headers, { targetType: 'vendor', targetId: v.vendorId, reason: 'wrong_info' });
    expect(res.json()).toEqual({ status: 'received' });
    // Reporting the same thing twice doesn't pile up.
    await call('POST', '/v1/reports', c.headers, { targetType: 'vendor', targetId: v.vendorId, reason: 'spam' });
    expect(await ctx.db.$count(reports)).toBe(1);
    expect((await call('POST', '/v1/reports', c.headers, { targetType: 'photo', targetId: crypto.randomUUID(), reason: 'spam' })).statusCode).toBe(404);

    const admin = await signUpAdmin(ctx);
    const list = (await call('GET', '/v1/admin/reports', admin.headers)).json().reports;
    expect(list[0]).toMatchObject({ targetType: 'vendor', reason: 'wrong_info', target: { vendorName: 'Test Dogs' } });
    expect(JSON.stringify(list)).not.toContain(c.userId);
  });

  it('upholding a report takes the review or post down', async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 1, body: 'They are a fraud' });
    const [review] = await ctx.db.select().from(reviews);
    await call('PUT', `/v1/vendor/status/${crypto.randomUUID()}`, v.headers, { body: 'Free tacos!!!', clientUpdatedAt: new Date().toISOString() });
    const [post] = await ctx.db.select().from(vendorStatusPosts);

    await call('POST', '/v1/reports', v.headers, { targetType: 'review', targetId: review!.id, reason: 'harassment' });
    await call('POST', '/v1/reports', c.headers, { targetType: 'status_post', targetId: post!.id, reason: 'spam' });
    const admin = await signUpAdmin(ctx);
    const list = (await call('GET', '/v1/admin/reports', admin.headers)).json().reports;
    for (const r of list) await call('POST', `/v1/admin/reports/${r.id}`, admin.headers, { status: 'upheld' });

    const profile = (await call('GET', `/v1/vendors/${v.vendorId}`)).json();
    expect(profile.reviews).toEqual([]);
    expect(profile.status).toBeNull();
    expect(await ctx.db.$count(vendorStatusPosts)).toBe(0);
    expect((await call('GET', '/v1/admin/reports', admin.headers)).json().reports).toEqual([]);
  });

  it('moderation endpoints are for admins only', async () => {
    const c = await customer();
    const v = await onboardedVendor(ctx);
    for (const headers of [c.headers, v.headers]) {
      expect((await call('GET', '/v1/admin/moderation', headers)).statusCode).toBe(403);
      expect((await call('GET', '/v1/admin/reports', headers)).statusCode).toBe(403);
    }
    expect((await call('GET', '/v1/admin/reports')).statusCode).toBe(401);
  });
});

describe('the live session row', () => {
  it('a confirmation only touches last_confirmed_at, never the location', async () => {
    const v = await liveVendor();
    const before = await ctx.db.execute(sql`SELECT ST_AsText(public_point) AS p FROM vendor_live_sessions`);
    const c = await customer();
    await confirm(v.vendorId, c.headers, { lat: SPOT.lat + 0.001, lng: SPOT.lng + 0.001 });
    const after = await ctx.db.execute(sql`SELECT ST_AsText(public_point) AS p FROM vendor_live_sessions`);
    expect(after).toEqual(before);
    const [s] = await ctx.db.select().from(vendorLiveSessions);
    expect(s!.lastConfirmedAt).not.toBeNull();
  });
});
