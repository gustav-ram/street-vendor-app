import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import { inviteCodes } from '../src/db/schema';
import { purgeUser } from '../src/modules/account/service';
import { clearSynonymCache } from '../src/modules/search/query';
import { ageAccount, createTestContext, MOBILE, onboardedVendor, resetDb, signUp, signUpAdmin, uploadBytes } from './helpers';

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

const PASSWORD = 'correct-horse-battery';
const SPOT = { lat: 34.043112, lng: -118.266789 };
type Headers = Record<string, string>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Headers = {}, payload?: unknown) =>
  ctx.app.inject({ method, url, headers, payload: payload as Record<string, unknown> });
const now = () => new Date().toISOString();
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const photo = () => sharp({ create: { width: 120, height: 80, channels: 3, background: '#2b7fd9' } }).jpeg().toBuffer();

async function customer(name = 'Maya R.') {
  const c = await signUp(ctx, 'customer', name);
  await ageAccount(ctx, c.userId, 48);
  return { ...c, headers: { authorization: c.authorization } };
}

/** Every uuid column, and every text column, that still mentions any of `ids` / `texts`. */
async function leftovers(ids: string[], texts: string[]) {
  const columns = await ctx.db.execute<{ table_name: string; column_name: string; data_type: string }>(sql`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type IN ('uuid', 'text', 'USER-DEFINED', 'character varying')`);
  const found: string[] = [];
  for (const c of columns) {
    const col = sql.raw(`"${c.table_name}"."${c.column_name}"`);
    const table = sql.raw(`"${c.table_name}"`);
    if (c.data_type === 'uuid') {
      const [row] = await ctx.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${table} WHERE ${col} IN ${ids}`);
      if (Number(row!.n) > 0) found.push(`${c.table_name}.${c.column_name}`);
    } else {
      for (const t of texts) {
        const [row] = await ctx.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${table} WHERE ${col}::text ILIKE ${`%${t}%`}`);
        if (Number(row!.n) > 0) found.push(`${c.table_name}.${c.column_name} ~ ${t}`);
      }
    }
  }
  return found;
}

/** A vendor with something in every corner of the database. */
async function busyVendor() {
  const v = await onboardedVendor(ctx, { displayName: 'Tacos Zzyzx' });
  await call('PATCH', '/v1/vendor/me', v.headers, { description: 'Al pastor', contactText: 'ask for Zzyzx' });
  await call('POST', '/v1/vendor/live', v.headers, { location: SPOT });
  await call('PUT', `/v1/vendor/status/${crypto.randomUUID()}`, v.headers, { body: 'Zzyzx specials', clientUpdatedAt: now() });
  const upcoming = crypto.randomUUID();
  await call('PUT', `/v1/vendor/upcoming/${upcoming}`, v.headers, { location: SPOT, startsAt: hours(20), endsAt: hours(24), clientUpdatedAt: now() });
  await call('DELETE', `/v1/vendor/upcoming/${crypto.randomUUID()}`, v.headers, { clientUpdatedAt: now() }); // a tombstone
  await call('PUT', '/v1/vendor/schedule', v.headers, { published: true, entries: [{ weekday: 5, startTime: '17:00', endTime: '22:00', location: SPOT }] });
  const gallery = await uploadBytes(ctx, v.headers, await photo());
  await call('POST', '/v1/vendor/photos', v.headers, { uploadId: gallery, kind: 'gallery' });
  // An upload left unfinished, with bytes staged on disk.
  await call('POST', '/v1/uploads', v.headers, { contentType: 'image/jpeg', totalBytes: 5000 });
  await call('POST', `/v1/vendors/${v.vendorId}/events`, {}, { type: 'profile_view' });
  return v;
}

describe('account export', () => {
  it('gives a person everything about them, and the photos they uploaded, in a zip', async () => {
    const v = await busyVendor();
    const c = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 5, body: 'Best al pastor' });
    await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, c.headers, { notifyOnOpen: true });
    await call('POST', '/v1/reports', c.headers, { targetType: 'vendor', targetId: v.vendorId, reason: 'wrong_info' });
    const mine = await uploadBytes(ctx, c.headers, await photo());
    await call('POST', `/v1/vendors/${v.vendorId}/photos`, c.headers, { uploadId: mine, caption: 'My tacos' });

    const res = await call('GET', '/v1/me/export', c.headers);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/streeteats-export-\d{4}-\d{2}-\d{2}\.zip/);
    const files = unzipSync(new Uint8Array(res.rawPayload));
    const data = JSON.parse(strFromU8(files['account.json']!));
    expect(files['README.txt']).toBeDefined();
    expect(data.account).toMatchObject({ role: 'customer', email: c.email, displayName: 'Maya R.' });
    expect(data.business).toBeNull();
    expect(data.reviewsYouWrote).toMatchObject([{ vendor: 'Tacos Zzyzx', rating: 5, body: 'Best al pastor' }]);
    expect(data.favorites).toMatchObject([{ vendor: 'Tacos Zzyzx', notify_on_open: true }]);
    expect(data.reportsYouFiled).toMatchObject([{ target_type: 'vendor', reason: 'wrong_info' }]);
    expect(data.photosYouUploaded).toMatchObject([{ vendor: 'Tacos Zzyzx', caption: 'My tacos', moderation: 'pending' }]);
    const file = files[data.photosYouUploaded[0].file]!;
    expect((await sharp(file).metadata()).format).toBe('webp');

    // The vendor's export has the business, but never who reviewed or favorited it.
    const vres = await call('GET', '/v1/me/export', v.headers);
    const vfiles = unzipSync(new Uint8Array(vres.rawPayload));
    const vdata = JSON.parse(strFromU8(vfiles['account.json']!));
    expect(vdata.business).toMatchObject({ displayName: 'Tacos Zzyzx', description: 'Al pastor', contactText: 'ask for Zzyzx' });
    expect(vdata.business.menu).toHaveLength(1);
    expect(vdata.business.upcoming).toHaveLength(1);
    expect(vdata.business.schedule.entries).toHaveLength(1);
    expect(vdata.business.dailyTotals[0]).toMatchObject({ profile_views: 1 });
    expect(vdata.photosYouUploaded).toHaveLength(1);
    expect(Object.keys(vfiles).filter((f) => f.startsWith('photos/'))).toHaveLength(1);
    const text = strFromU8(vfiles['account.json']!);
    expect(text).not.toContain(c.email);
    expect(text).not.toContain(c.userId);
    expect(text).not.toContain('Maya');

    expect((await call('GET', '/v1/me/export')).statusCode).toBe(401);
  });
});

describe('account deletion', () => {
  it('asks for the password again', async () => {
    const c = await customer();
    expect((await call('DELETE', '/v1/me', c.headers, { secret: 'not-my-password' })).statusCode).toBe(401);
    expect((await call('DELETE', '/v1/me', {}, { secret: PASSWORD })).statusCode).toBe(401);
    expect((await call('GET', '/v1/me', c.headers)).statusCode).toBe(200);
  });

  it('removes every row and file about a vendor and their business', async () => {
    const v = await busyVendor();
    const [vendorUser] = await ctx.db.execute<{ email: string }>(sql`SELECT email FROM users WHERE id = ${v.userId}`);
    const c = await customer();
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 4, body: 'Good' });
    await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, c.headers, { notifyOnOpen: false });
    await call('POST', `/v1/vendors/${v.vendorId}/still-here`, c.headers, { location: SPOT });
    const customerPhoto = await uploadBytes(ctx, c.headers, await photo());
    await call('POST', `/v1/vendors/${v.vendorId}/photos`, c.headers, { uploadId: customerPhoto });
    await call('POST', '/v1/reports', c.headers, { targetType: 'vendor', targetId: v.vendorId, reason: 'spam' });
    const reviews = (await call('GET', '/v1/vendor/reviews', v.headers)).json().reviews;
    await call('POST', '/v1/vendor/blocks', v.headers, { reviewId: reviews[0].id });

    const files = await ctx.db.execute<{ storage_key: string; thumb_key: string }>(sql`SELECT storage_key, thumb_key FROM photos`);
    const staged = await ctx.db.execute<{ tmp_key: string }>(sql`SELECT tmp_key FROM uploads WHERE user_id = ${v.userId}`);
    expect(files.length).toBe(2);
    expect(staged.length).toBe(1);

    const res = await call('DELETE', '/v1/me', v.headers, { secret: PASSWORD });
    expect(res.statusCode).toBe(204);

    expect(await leftovers([v.userId, v.vendorId], [vendorUser!.email, 'Zzyzx'])).toEqual([]);
    const root = ctx.config.uploadDir;
    for (const f of files) {
      expect(existsSync(join(root, 'photos', `${f.storage_key}.webp`))).toBe(false);
      expect(existsSync(join(root, 'photos', `${f.thumb_key}.webp`))).toBe(false);
    }
    expect(existsSync(join(root, 'tmp', staged[0]!.tmp_key))).toBe(false);
    // Gone from the map and from search at once.
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).statusCode).toBe(404);
    expect((await call('GET', '/v1/vendor/me', v.headers)).statusCode).toBe(401);
    // The customer's own account is untouched.
    expect((await call('GET', '/v1/me', c.headers)).statusCode).toBe(200);
  });

  it('removes a customer and what they wrote, but keeps their reports without linking them', async () => {
    const v = await busyVendor();
    const c = await customer('Zzyzx Fan');
    const login = await call('POST', '/v1/auth/login', MOBILE, { email: c.email, secret: PASSWORD });
    const refreshToken = login.json().refreshToken;
    await call('PUT', `/v1/vendors/${v.vendorId}/review`, c.headers, { rating: 2, body: 'Cold' });
    await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, c.headers, { notifyOnOpen: true });
    const up = await uploadBytes(ctx, c.headers, await photo());
    await call('POST', `/v1/vendors/${v.vendorId}/photos`, c.headers, { uploadId: up });
    await call('POST', '/v1/reports', c.headers, { targetType: 'vendor', targetId: v.vendorId, reason: 'unsafe', details: 'Grill too close' });
    const [file] = await ctx.db.execute<{ storage_key: string }>(sql`SELECT storage_key FROM photos WHERE uploader_user_id = ${c.userId}`);

    expect((await call('DELETE', '/v1/me', c.headers, { secret: PASSWORD })).statusCode).toBe(204);

    expect(await leftovers([c.userId], [c.email, 'Zzyzx Fan'])).toEqual([]);
    expect(existsSync(join(ctx.config.uploadDir, 'photos', `${file!.storage_key}.webp`))).toBe(false);
    // The report about the vendor stays for moderators, with no reporter.
    const [report] = await ctx.db.execute<{ reporter_user_id: string | null; details: string }>(sql`SELECT reporter_user_id, details FROM reports`);
    expect(report).toEqual({ reporter_user_id: null, details: 'Grill too close' });
    // Signed out everywhere.
    expect((await call('POST', '/v1/auth/refresh', MOBILE, { refreshToken })).statusCode).toBe(401);
    // The vendor's page no longer shows the review.
    expect((await call('GET', `/v1/vendors/${v.vendorId}`)).json().rating.count).toBe(0);
  });

  it('the admin tool uses the same purge', async () => {
    const v = await busyVendor();
    await purgeUser(ctx.app.ctx, v.userId);
    expect(await leftovers([v.userId, v.vendorId], ['Zzyzx'])).toEqual([]);
  });
});

describe('vendor stats', () => {
  it('shows daily totals for the last 7 or 30 days, zeros included', async () => {
    const v = await onboardedVendor(ctx);
    const c = await customer();
    for (const type of ['profile_view', 'profile_view', 'directions'] as const) await call('POST', `/v1/vendors/${v.vendorId}/events`, {}, { type });
    await call('PUT', `/v1/vendors/${v.vendorId}/favorite`, c.headers, { notifyOnOpen: false });

    const week = (await call('GET', '/v1/vendor/analytics?range=7d', v.headers)).json();
    expect(week.days).toHaveLength(7);
    expect(week.days.slice(0, 6).every((d: { profileViews: number }) => d.profileViews === 0)).toBe(true);
    expect(week.days[6]).toMatchObject({ profileViews: 2, directionsTaps: 1, favoritesAdded: 1 });
    expect(week.totals).toMatchObject({ profileViews: 2, directionsTaps: 1, favoritesAdded: 1, mapImpressions: 0 });
    expect(week.favoritesNow).toBe(1);
    expect((await call('GET', '/v1/vendor/analytics?range=30d', v.headers)).json().days).toHaveLength(30);
    expect((await call('GET', '/v1/vendor/analytics', c.headers)).statusCode).toBe(403);
    // Counters only: the table has no column that could say who.
    const cols = await ctx.db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'analytics_daily' ORDER BY column_name`);
    expect(cols.map((c) => c.column_name)).toEqual([
      'confirmations',
      'day',
      'directions_taps',
      'favorites_added',
      'favorites_removed',
      'map_impressions',
      'profile_views',
      'vendor_id',
    ]);
  });
});

describe('invite codes', () => {
  const register = (inviteCode?: string) =>
    call('POST', '/v1/auth/register', MOBILE, {
      email: `v-${crypto.randomUUID()}@example.test`,
      role: 'vendor',
      credential: { kind: 'password', secret: PASSWORD },
      inviteCode,
    });

  it('admins make codes for flyers; using one only bumps a count', async () => {
    const admin = await signUpAdmin(ctx);
    const created = await call('POST', '/v1/admin/invites', admin.headers, { label: 'Boyle Heights flyers', maxRedemptions: 2 });
    expect(created.statusCode).toBe(201);
    const invite = created.json();
    expect(invite.code).toMatch(/^[A-Z]+-[2-9A-HJKMNP-Z]{4}$/);

    expect((await call('GET', `/v1/invites/${invite.code.toLowerCase()}`)).json()).toEqual({ valid: true });
    expect((await register(invite.code.toLowerCase())).statusCode).toBe(201);
    expect((await register(invite.code)).statusCode).toBe(201);
    // Used up.
    expect((await call('GET', `/v1/invites/${invite.code}`)).json()).toEqual({ valid: false });
    expect((await register(invite.code)).json().error.code).toBe('invalid_invite');

    const list = (await call('GET', '/v1/admin/invites', admin.headers)).json();
    expect(list.invites).toMatchObject([{ code: invite.code, label: 'Boyle Heights flyers', redemptionCount: 2 }]);
    expect(list.stats).toEqual({ codes: 1, redemptions: 2 });
    // Nothing links the code to the accounts that used it.
    const userCols = await ctx.db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name IN ('users', 'vendor_profiles') AND column_name ILIKE '%invite%'`);
    expect(userCols).toEqual([]);
    const inviteCols = await ctx.db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'invite_codes' AND column_name ILIKE '%user%'`);
    expect(inviteCols).toEqual([]);
  });

  it('disabled or expired codes stop working; only admins manage codes', async () => {
    const admin = await signUpAdmin(ctx);
    const a = (await call('POST', '/v1/admin/invites', admin.headers, { label: 'A' })).json();
    await call('PATCH', `/v1/admin/invites/${a.id}`, admin.headers, { disabled: true });
    expect((await call('GET', `/v1/invites/${a.code}`)).json()).toEqual({ valid: false });

    const b = (await call('POST', '/v1/admin/invites', admin.headers, { label: 'B', expiresInDays: 1 })).json();
    expect((await call('GET', `/v1/invites/${b.code}`)).json()).toEqual({ valid: true });
    await ctx.db.update(inviteCodes).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await call('GET', `/v1/invites/${b.code}`)).json()).toEqual({ valid: false });
    expect((await call('GET', '/v1/invites/NOPE-2222')).json()).toEqual({ valid: false });

    const v = await onboardedVendor(ctx);
    expect((await call('GET', '/v1/admin/invites', v.headers)).statusCode).toBe(403);
    expect((await call('POST', '/v1/admin/invites', v.headers, { label: 'x' })).statusCode).toBe(403);
  });
});
