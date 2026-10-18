import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import { vendorLiveSessions, verificationProgress } from '../src/db/schema';
import { runSweep } from '../src/jobs/sweeper';
import { distanceMeters, fuzzLocation } from '../src/lib/geo/fuzz';
import { computeEndsAt } from '../src/modules/live/service';
import { clearSynonymCache } from '../src/modules/search/query';
import { createTestContext, onboardedVendor, resetDb, signUp } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.db);
  clearSynonymCache();
  await seedTags(ctx.db);
});

const SPOT = { lat: 34.043112, lng: -118.266789 };

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  return ctx.app.inject({ method, url, headers, payload: payload as Record<string, unknown> });
}

async function storedPoint(vendorId: string) {
  const [row] = await ctx.db.execute<{ lat: number; lng: number }>(sql`
    SELECT ST_Y(public_point::geometry) AS lat, ST_X(public_point::geometry) AS lng
    FROM vendor_live_sessions WHERE vendor_id = ${vendorId}`);
  return row ? { lat: Number(row.lat), lng: Number(row.lng) } : null;
}

async function searchIds() {
  const res = await ctx.app.inject({ method: 'POST', url: '/v1/search', payload: { location: { lat: 34.045, lng: -118.25 }, radiusM: 10_000 } });
  return (res.json().live as Array<{ id: string }>).map((v) => v.id);
}

describe('Go Live', () => {
  it('approximate mode stores and shows only the fuzzed point, never the exact one', async () => {
    const v = await onboardedVendor(ctx);
    const res = await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
    expect(res.statusCode).toBe(200);
    const status = res.json();
    expect(status.state).toBe('live');
    expect(status.location.precision).toBe('approximate');

    const stored = await storedPoint(v.vendorId);
    const expected = fuzzLocation(SPOT, v.vendorId, { secret: ctx.config.fuzzSecret, cellMeters: ctx.config.approxCellMeters });
    expect(stored).toEqual({ lat: expected.lat, lng: expected.lng });
    expect(stored).not.toEqual(SPOT);
    expect(distanceMeters(SPOT, stored!)).toBeLessThan(155);
    expect(status.location).toMatchObject({ lat: expected.lat, lng: expected.lng });
    expect(await searchIds()).toEqual([v.vendorId]);
  });

  it('exact mode stores the spot rounded to ~1 m', async () => {
    const v = await onboardedVendor(ctx);
    await call('POST', '/v1/vendor/live', v.headers, { location: SPOT, precision: 'exact' });
    expect(await storedPoint(v.vendorId)).toEqual({ lat: 34.04311, lng: -118.26679 });
  });

  it('heartbeats keep the same public point while the cart stays in its cell', async () => {
    const v = await onboardedVendor(ctx);
    const first = (await call('POST', '/v1/vendor/live', v.headers, { location: SPOT })).json();
    const hb = await call('POST', '/v1/vendor/live/heartbeat', v.headers, { location: { lat: SPOT.lat + 0.00003, lng: SPOT.lng - 0.00002 } });
    expect(hb.statusCode).toBe(200);
    expect(hb.json().location).toEqual(first.location);
    expect(new Date(hb.json().expiresAt) >= new Date(first.expiresAt)).toBe(true);
  });

  it('going offline deletes the location immediately', async () => {
    const v = await onboardedVendor(ctx);
    await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
    const off = await call('DELETE', '/v1/vendor/live', v.headers);
    expect(off.json()).toMatchObject({ state: 'offline', location: null });
    expect(await storedPoint(v.vendorId)).toBeNull();
    expect(await searchIds()).toEqual([]);
  });

  it('heartbeat loss: the vendor disappears when the grace period ends, and the row is swept', async () => {
    const v = await onboardedVendor(ctx);
    await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
    // Simulate the phone going quiet for longer than the grace period.
    await ctx.db.update(vendorLiveSessions).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(vendorLiveSessions.vendorId, v.vendorId));

    expect(await searchIds()).toEqual([]);
    expect((await call('GET', '/v1/vendor/live', v.headers)).json().state).toBe('offline');
    // A late heartbeat does not bring them back; the app must start again.
    const late = await call('POST', '/v1/vendor/live/heartbeat', v.headers, { location: SPOT });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('not_live');

    await runSweep(ctx.db);
    expect(await storedPoint(v.vendorId)).toBeNull();
  });

  it('the auto-off timer ends the session', async () => {
    const v = await onboardedVendor(ctx);
    const status = (await call('POST', '/v1/vendor/live', v.headers, { location: SPOT, autoOffHours: 2 })).json();
    const hours = (new Date(status.endsAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThanOrEqual(2.01);
    await ctx.db.update(vendorLiveSessions).set({ endsAt: sql`now() - interval '1 second'` }).where(eq(vendorLiveSessions.vendorId, v.vendorId));
    expect(await searchIds()).toEqual([]);
  });

  it('resuming after lost signal keeps the original end time instead of extending it', async () => {
    const v = await onboardedVendor(ctx);
    const first = (await call('POST', '/v1/vendor/live', v.headers, { location: SPOT, autoOffHours: 2 })).json();
    await call('DELETE', '/v1/vendor/live', v.headers);
    const resumed = (await call('POST', '/v1/vendor/live', v.headers, { location: SPOT, endsAt: first.endsAt })).json();
    expect(resumed.endsAt).toBe(first.endsAt);
  });

  it('vacation mode takes the vendor off the map and blocks going live', async () => {
    const v = await onboardedVendor(ctx);
    await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
    const patched = await call('PATCH', '/v1/vendor/me', v.headers, { hidden: true });
    expect(patched.json().live.state).toBe('offline');
    expect(await storedPoint(v.vendorId)).toBeNull();
    const again = await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
    expect(again.json().error.code).toBe('vacation_mode');
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/vendors/${v.vendorId}` })).statusCode).toBe(404);
  });

  it('counts each day live once, as a number only', async () => {
    const v = await onboardedVendor(ctx);
    await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
    await call('DELETE', '/v1/vendor/live', v.headers);
    await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
    const [p] = await ctx.db.select().from(verificationProgress).where(eq(verificationProgress.vendorId, v.vendorId));
    expect(p!.liveDays).toBe(1);
  });

  it('is only for vendors who finished the quick start', async () => {
    const customer = await signUp(ctx, 'customer');
    expect((await call('POST', '/v1/vendor/live', { authorization: customer.authorization }, { location: SPOT })).statusCode).toBe(403);
    const fresh = await signUp(ctx, 'vendor');
    const res = await call('POST', '/v1/vendor/live', { authorization: fresh.authorization }, { location: SPOT });
    expect(res.json().error.code).toBe('onboarding_required');
    expect((await call('GET', '/v1/vendor/live', {})).statusCode).toBe(401);
  });
});

describe('end of the street day', () => {
  const tz = 'America/Los_Angeles';
  const la = (iso: string) => new Date(iso);

  it('closes at 3:00 AM local by default', () => {
    // 10:00 PM PDT on Oct 17 -> 3:00 AM PDT on Oct 18 (10:00 UTC).
    expect(computeEndsAt(ctx.app.ctx, la('2026-10-18T05:00:00Z'), tz).toISOString()).toBe('2026-10-18T10:00:00.000Z');
    // 1:30 AM local is still the same street day -> 3:00 AM the same morning.
    expect(computeEndsAt(ctx.app.ctx, la('2026-10-18T08:30:00Z'), tz).toISOString()).toBe('2026-10-18T10:00:00.000Z');
  });

  it('uses the timer when it ends first, and never runs longer than the maximum', () => {
    expect(computeEndsAt(ctx.app.ctx, la('2026-10-18T05:00:00Z'), tz, 2).toISOString()).toBe('2026-10-18T07:00:00.000Z');
    // 4:00 AM local: next street-day end is ~23 h away, so the 16 h cap applies.
    const at4am = la('2026-10-18T11:00:00Z');
    expect(computeEndsAt(ctx.app.ctx, at4am, tz).getTime() - at4am.getTime()).toBe(ctx.config.live.maxHours * 3_600_000);
  });
});
