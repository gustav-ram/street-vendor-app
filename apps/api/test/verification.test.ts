import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import { clearSynonymCache } from '../src/modules/search/query';
import { ageAccount, createTestContext, onboardedVendor, resetDb, signUp, signUpAdmin } from './helpers';

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
type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, headers: Headers = {}, payload?: unknown) =>
  ctx.app.inject({ method, url, headers, payload: payload as Record<string, unknown> });

async function liveVendor(location = SPOT) {
  const v = await onboardedVendor(ctx);
  await call('POST', '/v1/vendor/live', v.headers, { location });
  return v;
}

async function customer() {
  const c = await signUp(ctx, 'customer');
  await ageAccount(ctx, c.userId, 48);
  return { ...c, headers: { authorization: c.authorization } };
}

const progress = async (headers: Headers) => (await call('GET', '/v1/vendor/verification', headers)).json();
const confirm = (vendorId: string, headers: Headers) => call('POST', `/v1/vendors/${vendorId}/still-here`, headers, { location: SPOT });

/** Moves this vendor's newest confirmation `days` into the past, as if it was tapped then. */
async function backdateLatest(vendorId: string, days: number) {
  await ctx.db.execute(sql`
    UPDATE still_here_confirmations
    SET created_at = now() - make_interval(days => ${days}), local_day = (now() - make_interval(days => ${days}))::date
    WHERE id = (SELECT id FROM still_here_confirmations WHERE vendor_id = ${vendorId} ORDER BY created_at DESC LIMIT 1)`);
}

const setLiveDays = (vendorId: string, n: number) => ctx.db.execute(sql`UPDATE verification_progress SET live_days = ${n} WHERE vendor_id = ${vendorId}`);

/** A vendor who has met every criterion, built quickly through the API. */
async function trustedVendor() {
  const v = await liveVendor();
  await setLiveDays(v.vendorId, 10);
  const people = [await customer(), await customer(), await customer()];
  // Five counted confirmations: three people, on different days, a week apart for the same person.
  for (const [who, days] of [
    [0, 20],
    [0, 10],
    [1, 5],
    [2, 1],
    [0, 0],
  ] as const) {
    expect((await confirm(v.vendorId, people[who].headers)).json().status).toBe('confirmed');
    if (days) await backdateLatest(v.vendorId, days);
  }
  for (const p of people) await call('PUT', `/v1/vendors/${v.vendorId}/review`, p.headers, { rating: 5, body: 'Great' });
  return { ...v, people };
}

describe('"Community Verified" badge', () => {
  it('is earned only when every criterion is met, and shows the vendor their progress', async () => {
    const v = await liveVendor();
    let p = await progress(v.headers);
    expect(p).toMatchObject({
      status: 'none',
      criteria: { liveDays: 10, confirmations: 5, confirmationAccounts: 3, confirmationDays: 3, reviews: 3, reviewAverage: 3.5, reportWindowDays: 90 },
      progress: {
        liveDays: { count: 1, met: false },
        confirmations: { count: 0, accounts: 0, days: 0, met: false },
        reviews: { count: 0, average: null, met: false },
        reports: { upheld: 0, met: true },
      },
    });

    // One loyal customer, three weeks running: three counted taps, but still one person.
    const a = await customer();
    for (const days of [15, 8, 0]) {
      await confirm(v.vendorId, a.headers);
      if (days) await backdateLatest(v.vendorId, days);
    }
    // A second tap the same day doesn't count again.
    expect((await confirm(v.vendorId, a.headers)).json().status).toBe('already_confirmed');
    p = await progress(v.headers);
    expect(p.progress.confirmations).toEqual({ count: 3, accounts: 1, days: 3, met: false });

    const b = await customer();
    const c = await customer();
    await confirm(v.vendorId, b.headers);
    await backdateLatest(v.vendorId, 2);
    await confirm(v.vendorId, c.headers);
    p = await progress(v.headers);
    expect(p.progress.confirmations).toEqual({ count: 5, accounts: 3, days: 4, met: true });
    expect(p.status).toBe('none');

    await setLiveDays(v.vendorId, 10);
    for (const who of [a, b]) await call('PUT', `/v1/vendors/${v.vendorId}/review`, who.headers, { rating: 4, body: 'Good' });
    expect((await progress(v.headers)).status).toBe('none');
    // The third approved review completes it; the badge is granted right away.
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 3, body: 'OK' });
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().verified).toBe(true);
    p = await progress(v.headers);
    expect(p).toMatchObject({ status: 'verified', progress: { reviews: { count: 3, average: 3.67, met: true } } });
    expect(p.verifiedAt).not.toBeNull();
  });

  it('needs a healthy review average', async () => {
    const v = await liveVendor();
    await setLiveDays(v.vendorId, 10);
    for (const rating of [1, 2, 5]) {
      const c = await customer();
      await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating, body: 'Hmm' });
    }
    expect((await progress(v.headers)).progress.reviews).toEqual({ count: 3, average: 2.67, met: false });
  });

  it('remembers that the confirmations step was reached after the old confirmations expire', async () => {
    const v = await trustedVendor();
    expect((await progress(v.headers)).status).toBe('verified');
    await ctx.db.execute(sql`DELETE FROM still_here_confirmations`);
    const p = await progress(v.headers);
    expect(p.progress.confirmations).toMatchObject({ count: 0, met: true });
    expect(p.status).toBe('verified');
  });

  it('ignores open reports, but an upheld report against the vendor takes the badge away', async () => {
    const v = await trustedVendor();
    const admin = await signUpAdmin(ctx);
    // A pile of open reports changes nothing: the badge can't be blocked by mass-reporting.
    for (const p of v.people) await call('POST', '/v1/reports', p.headers, { targetType: 'vendor', targetId: v.vendorId, reason: 'spam' });
    expect((await progress(v.headers)).status).toBe('verified');

    // Upholding a report about a customer's review on their page doesn't count against the vendor.
    const [review] = await ctx.db.execute<{ id: string }>(sql`SELECT id FROM reviews WHERE vendor_id = ${v.vendorId} LIMIT 1`);
    await call('POST', '/v1/reports', v.people[0].headers, { targetType: 'review', targetId: review!.id, reason: 'offensive' });
    const reviewReport = (await call('GET', '/v1/admin/reports', admin.headers)).json().reports.find((r: { targetType: string }) => r.targetType === 'review');
    await call('POST', `/v1/admin/reports/${reviewReport.id}`, admin.headers, { status: 'upheld' });
    expect((await progress(v.headers)).progress.reports).toEqual({ upheld: 0, met: true });

    // Upholding one about the vendor's own post does, even though the post itself is deleted.
    const postId = crypto.randomUUID();
    await call('PUT', `/v1/vendor/status/${postId}`, v.headers, { body: 'Cheap stuff, DM me', clientUpdatedAt: new Date().toISOString() });
    await call('POST', '/v1/reports', v.people[1].headers, { targetType: 'status_post', targetId: postId, reason: 'spam' });
    const postReport = (await call('GET', '/v1/admin/reports', admin.headers)).json().reports.find((r: { targetType: string }) => r.targetType === 'status_post');
    await call('POST', `/v1/admin/reports/${postReport.id}`, admin.headers, { status: 'upheld' });

    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().verified).toBe(false);
    expect(await progress(v.headers)).toMatchObject({ status: 'none', verifiedAt: null, progress: { reports: { upheld: 1, met: false } } });

    // After the 90-day window it can be earned again (with a third review, since one was taken down above).
    await ctx.db.execute(sql`UPDATE reports SET resolved_at = now() - interval '91 days' WHERE vendor_id = ${v.vendorId}`);
    expect((await progress(v.headers)).progress.reviews).toMatchObject({ count: 2, met: false });
    const another = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, another.headers, { rating: 5, body: 'Back to great' });
    expect((await progress(v.headers)).status).toBe('verified');
  });

  it('can be revoked by an admin, and stays off until an admin restores it', async () => {
    const v = await trustedVendor();
    const admin = await signUpAdmin(ctx);
    const listed = (await call('GET', '/v1/admin/vendors', admin.headers)).json().vendors;
    expect(listed).toMatchObject([{ id: v.vendorId, status: 'verified', liveDays: 10 }]);
    expect((await call('GET', '/v1/admin/vendors?q=test', admin.headers)).json().vendors).toHaveLength(1);

    // Only admins.
    expect((await call('POST', `/v1/admin/vendors/${v.vendorId}/verification`, v.headers, { action: 'revoke', reason: 'x' })).statusCode).toBe(403);
    expect((await call('POST', `/v1/admin/vendors/${v.vendorId}/verification`, admin.headers, { action: 'revoke' })).statusCode).toBe(400);

    const revoked = await call('POST', `/v1/admin/vendors/${v.vendorId}/verification`, admin.headers, { action: 'revoke', reason: 'Fake confirmations from one household' });
    expect(revoked.json()).toMatchObject({ status: 'revoked', verifiedAt: null });
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().verified).toBe(false);
    // Every criterion is still met, yet re-checking doesn't bring it back.
    const p = await progress(v.headers);
    expect(p).toMatchObject({ status: 'revoked', revokedReason: 'Fake confirmations from one household' });
    expect(Object.values(p.progress).every((s) => (s as { met: boolean }).met)).toBe(true);
    const c = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 5, body: 'Yum' });
    expect((await progress(v.headers)).status).toBe('revoked');
    expect((await call('GET', '/v1/admin/vendors?status=revoked', admin.headers)).json().vendors).toMatchObject([{ id: v.vendorId, revokedReason: 'Fake confirmations from one household' }]);

    // Restoring re-checks the criteria.
    expect((await call('POST', `/v1/admin/vendors/${v.vendorId}/verification`, admin.headers, { action: 'restore' })).json()).toMatchObject({
      status: 'verified',
      revokedReason: null,
    });
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().verified).toBe(true);
  });

  it('never changes search ranking', async () => {
    const far = await trustedVendor();
    const near = await liveVendor({ lat: SPOT.lat + 0.01, lng: SPOT.lng });
    const res = (await call('POST', '/v1/search', {}, { location: { lat: SPOT.lat + 0.012, lng: SPOT.lng } })).json();
    expect(res.live.map((r: { id: string; verified: boolean }) => [r.id, r.verified])).toEqual([
      [near.vendorId, false],
      [far.vendorId, true],
    ]);
  });

  it('publishes the criteria for "How do I earn this?"', async () => {
    expect((await call('GET', '/v1/meta')).json().badge).toEqual({
      liveDays: 10,
      confirmations: 5,
      confirmationAccounts: 3,
      confirmationDays: 3,
      confirmationWindowDays: 30,
      reviews: 3,
      reviewAverage: 3.5,
      reportWindowDays: 90,
    });
  });
});
