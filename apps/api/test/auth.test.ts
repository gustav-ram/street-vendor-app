import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inviteCodes } from '../src/db/schema';
import { createTestContext, MOBILE, resetDb, uniqueEmail } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx.db));

const password = 'correct-horse-battery';

async function register(body: Record<string, unknown>, headers: Record<string, string> = MOBILE) {
  return ctx.app.inject({ method: 'POST', url: '/v1/auth/register', headers, payload: body });
}

async function login(body: Record<string, unknown>, headers: Record<string, string> = MOBILE) {
  return ctx.app.inject({ method: 'POST', url: '/v1/auth/login', headers, payload: body });
}

describe('register and login', () => {
  it('creates a customer and never returns the email or phone', async () => {
    const email = uniqueEmail();
    const res = await register({ email, role: 'customer', credential: { kind: 'password', secret: password }, displayName: 'Taco Fan' });
    expect(res.statusCode).toBe(201);
    expect(res.body).not.toContain(email);
    const body = res.json();
    expect(body.user).toMatchObject({ role: 'customer', displayName: 'Taco Fan', hasEmail: true, hasPhone: false, vendorId: null });
    expect(body.refreshToken).toEqual(expect.any(String));

    const me = await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${body.accessToken}` } });
    expect(me.statusCode).toBe(200);
    expect(me.body).not.toContain(email);
  });

  it('accepts a phone number instead of an email', async () => {
    const res = await register({ phone: '(323) 555-0199', role: 'vendor', credential: { kind: 'pin', secret: '482913' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ hasEmail: false, hasPhone: true });
    expect((await login({ phone: '323-555-0199', secret: '482913' })).statusCode).toBe(200);
  });

  it('rejects duplicate identifiers and missing ones', async () => {
    const email = uniqueEmail();
    await register({ email, role: 'customer', credential: { kind: 'password', secret: password } });
    const dup = await register({ email: email.toUpperCase(), role: 'customer', credential: { kind: 'password', secret: password } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('identifier_taken');

    const none = await register({ role: 'customer', credential: { kind: 'password', secret: password } });
    expect(none.statusCode).toBe(400);
    expect(none.json().error.code).toBe('validation_failed');
  });

  it('does not allow self-registering as an admin', async () => {
    const res = await register({ email: uniqueEmail(), role: 'admin', credential: { kind: 'password', secret: password } });
    expect(res.statusCode).toBe(400);
  });

  it('answers the same way for a wrong password and an unknown account', async () => {
    const email = uniqueEmail();
    await register({ email, role: 'customer', credential: { kind: 'password', secret: password } });
    const wrong = await login({ email, secret: 'not-the-password' });
    const unknown = await login({ email: uniqueEmail('nobody'), secret: 'not-the-password' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('locks a PIN account after 5 wrong tries, even for the right PIN', async () => {
    const email = uniqueEmail('pin');
    await register({ email, role: 'vendor', credential: { kind: 'pin', secret: '135790' } });
    for (let i = 0; i < 4; i++) expect((await login({ email, secret: '000000' })).statusCode).toBe(401);
    expect((await login({ email, secret: '000000' })).json().error.code).toBe('account_locked');
    const right = await login({ email, secret: '135790' });
    expect(right.statusCode).toBe(423);
  });
});

describe('refresh tokens', () => {
  it('rotates, and revokes the whole family when an old token is replayed', async () => {
    const email = uniqueEmail();
    const reg = (await register({ email, role: 'customer', credential: { kind: 'password', secret: password } })).json();
    const r1 = reg.refreshToken as string;

    const first = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: MOBILE, payload: { refreshToken: r1 } });
    expect(first.statusCode).toBe(200);
    const r2 = first.json().refreshToken as string;
    expect(r2).not.toBe(r1);

    // Replaying r1 (e.g. stolen) fails and kills r2 too.
    const replay = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: MOBILE, payload: { refreshToken: r1 } });
    expect(replay.statusCode).toBe(401);
    const afterReplay = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: MOBILE, payload: { refreshToken: r2 } });
    expect(afterReplay.statusCode).toBe(401);
  });

  it('uses an httpOnly cookie for browsers and requires the CSRF header to refresh', async () => {
    const email = uniqueEmail();
    const res = await register({ email, role: 'customer', credential: { kind: 'password', secret: password } }, {});
    expect(res.json().refreshToken).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'se_rt');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/v1/auth' });

    const noHeader = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', cookies: { se_rt: cookie!.value } });
    expect(noHeader.statusCode).toBe(403);

    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { se_rt: cookie!.value },
      headers: { 'x-requested-with': 'streeteats' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.cookies.find((c) => c.name === 'se_rt')?.value).not.toBe(cookie!.value);
  });

  it('logout revokes the refresh token', async () => {
    const reg = (await register({ email: uniqueEmail(), role: 'customer', credential: { kind: 'password', secret: password } })).json();
    const out = await ctx.app.inject({ method: 'POST', url: '/v1/auth/logout', headers: MOBILE, payload: { refreshToken: reg.refreshToken } });
    expect(out.statusCode).toBe(204);
    const again = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: MOBILE, payload: { refreshToken: reg.refreshToken } });
    expect(again.statusCode).toBe(401);
  });

  it('rejects requests with a bad access token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer not-a-jwt' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('invite codes', () => {
  it('counts redemptions without linking the code to the account', async () => {
    await ctx.db.insert(inviteCodes).values({ code: 'TACO-7K2M', label: 'Boyle Heights flyers', maxRedemptions: 1 });
    const ok = await register({ email: uniqueEmail(), role: 'vendor', credential: { kind: 'pin', secret: '246810' }, inviteCode: 'taco-7k2m' });
    expect(ok.statusCode).toBe(201);
    const [row] = await ctx.db.select().from(inviteCodes).where(eq(inviteCodes.code, 'TACO-7K2M'));
    expect(row!.redemptionCount).toBe(1);

    // Used up: rejected, and the failed signup doesn't create an account.
    const email = uniqueEmail();
    const full = await register({ email, role: 'vendor', credential: { kind: 'pin', secret: '246810' }, inviteCode: 'TACO-7K2M' });
    expect(full.json().error.code).toBe('invalid_invite');
    expect((await login({ email, secret: '246810' })).statusCode).toBe(401);
  });
});
