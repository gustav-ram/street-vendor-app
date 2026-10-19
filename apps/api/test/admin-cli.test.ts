import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../scripts/admin';
import { seedTags } from '../scripts/seed';
import { createTestContext, MOBILE, onboardedVendor, resetDb, signUp } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.db);
  await seedTags(ctx.db);
});

async function admin(...args: string[]) {
  const lines: string[] = [];
  const code = await runAdmin(ctx.app.ctx, args, (l) => lines.push(l));
  return { code, out: lines.join('\n') };
}

const login = (email: string, secret: string) => ctx.app.inject({ method: 'POST', url: '/v1/auth/login', headers: MOBILE, payload: { email, secret } });

describe('npm run admin', () => {
  it('creates an admin with a one-time password that works', async () => {
    const r = await admin('create-admin', 'Boss@Example.test', '--name', 'Boss');
    expect(r.code).toBe(0);
    const password = /: (\S+)$/.exec(r.out)![1]!;
    const res = await login('boss@example.test', password);
    expect(res.json().user).toMatchObject({ role: 'admin', displayName: 'Boss' });
    expect((await admin('create-admin', 'boss@example.test')).code).toBe(1);
  });

  it('resets a password, unlocks the account and signs it out everywhere', async () => {
    const u = await signUp(ctx, 'customer');
    const old = await login(u.email, 'correct-horse-battery');
    await ctx.db.execute(sql`UPDATE users SET locked_until = now() + interval '1 hour' WHERE id = ${u.userId}`);
    const r = await admin('reset-password', u.email);
    const password = /: (\S+)$/.exec(r.out)![1]!;
    expect((await login(u.email, password)).statusCode).toBe(200);
    expect((await login(u.email, 'correct-horse-battery')).statusCode).toBe(401);
    const refresh = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: MOBILE, payload: { refreshToken: old.json().refreshToken } });
    expect(refresh.statusCode).toBe(401);
    expect((await admin('reset-password', 'nobody@example.test')).code).toBe(1);
  });

  it('makes, lists and disables invite codes', async () => {
    const made = await admin('invite', 'create', '--label', 'Flyers at the market', '--max', '20', '--days', '30');
    expect(made.code).toBe(0);
    const code = /Code (\S+)/.exec(made.out)![1]!;
    expect(made.out).toContain(`/join?code=${code}`);
    expect((await admin('invite', 'list')).out).toMatch(new RegExp(`${code}\\s+used 0/20\\s+Flyers at the market`));
    await admin('invite', 'disable', code.toLowerCase());
    expect((await admin('invite', 'list')).out).toContain('(disabled)');
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/invites/${code}` })).json()).toEqual({ valid: false });
  });

  it('revokes and restores a badge by vendor name', async () => {
    const v = await onboardedVendor(ctx, { displayName: 'Elotes Don Beto' });
    expect((await admin('badge', 'revoke', 'elotes don beto')).code).toBe(1); // needs a reason
    expect((await admin('badge', 'revoke', 'elotes don beto', '--reason', 'Fake taps')).code).toBe(0);
    const [vp] = await ctx.db.execute<{ status: string; revoked_reason: string }>(sql`SELECT status, revoked_reason FROM verification_progress WHERE vendor_id = ${v.vendorId}`);
    expect(vp).toEqual({ status: 'revoked', revoked_reason: 'Fake taps' });
    expect((await admin('badge', 'restore', v.vendorId)).out).toContain('criteria not met yet');
  });

  it('deletes an account only with --yes', async () => {
    const v = await onboardedVendor(ctx);
    const [u] = await ctx.db.execute<{ email: string }>(sql`SELECT email FROM users WHERE id = ${v.userId}`);
    expect((await admin('delete-account', u!.email)).code).toBe(1);
    expect((await admin('delete-account', u!.email, '--yes')).code).toBe(0);
    expect(await ctx.db.execute(sql`SELECT 1 FROM vendor_profiles WHERE id = ${v.vendorId}`)).toHaveLength(0);
  });

  it('prints totals only', async () => {
    await onboardedVendor(ctx);
    await signUp(ctx, 'customer');
    const r = await admin('stats');
    expect(r.out).toContain('Accounts: 1 customers, 1 vendors, 0 admins');
    expect(r.out).not.toMatch(/@/);
    expect((await admin('help')).code).toBe(0);
    expect((await admin('nonsense')).code).toBe(1);
  });
});
