import { Writable } from 'node:stream';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db/client';

export async function createTestContext(opts: { rateLimit?: boolean; captureLogs?: boolean } = {}) {
  const config = loadConfig();
  const { db, close } = createDb(config.databaseUrl);
  const logs: string[] = [];
  const logStream = opts.captureLogs
    ? new Writable({
        write(chunk, _enc, cb) {
          logs.push(String(chunk));
          cb();
        },
      })
    : undefined;
  const app = await buildApp({ config, db, rateLimit: opts.rateLimit ?? false, logStream });
  await app.ready();
  return {
    app,
    db,
    config,
    logs,
    close: async () => {
      await app.close();
      await close();
    },
  };
}

/** Empties every app table. Truncating users cascades to everything they own. */
export async function resetDb(db: Db) {
  await db.execute(sql`TRUNCATE users, tags, invite_codes, hash_peppers RESTART IDENTITY CASCADE`);
}

export const MOBILE = { 'x-client': 'mobile' } as const;

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.test`;
}

type Ctx = Awaited<ReturnType<typeof createTestContext>>;

/** Registers an account through the API and returns its bearer header. */
export async function signUp(ctx: Ctx, role: 'customer' | 'vendor', displayName?: string) {
  const email = uniqueEmail(role);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: MOBILE,
    payload: { email, role, displayName, credential: { kind: 'password', secret: 'correct-horse-battery' } },
  });
  const body = res.json();
  return { authorization: `Bearer ${body.accessToken}`, userId: body.user.id as string, email };
}

/** Admins can't sign up: make a customer an admin in the database, then sign in again. */
export async function signUpAdmin(ctx: Ctx) {
  const { email, userId } = await signUp(ctx, 'customer');
  await ctx.db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${userId}`);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: MOBILE,
    payload: { email, secret: 'correct-horse-battery' },
  });
  return { headers: { authorization: `Bearer ${res.json().accessToken}` }, userId };
}

/** Pretends the account was made `hours` ago (for the "Still here?" account-age rule). */
export async function ageAccount(ctx: Ctx, userId: string, hours: number) {
  await ctx.db.execute(sql`UPDATE users SET created_at = now() - make_interval(hours => ${hours}) WHERE id = ${userId}`);
}

/** Sends bytes through the resumable upload API in small chunks and returns the upload id. */
export async function uploadBytes(ctx: Ctx, headers: Record<string, string>, data: Buffer, contentType = 'image/jpeg', chunk = 64 * 1024) {
  const created = await ctx.app.inject({ method: 'POST', url: '/v1/uploads', headers, payload: { contentType, totalBytes: data.length } });
  if (created.statusCode !== 201) throw new Error(`create upload failed: ${created.body}`);
  const id = created.json().id as string;
  for (let offset = 0; offset < data.length; offset += chunk) {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/v1/uploads/${id}`,
      headers: { ...headers, 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
      payload: data.subarray(offset, offset + chunk),
    });
    if (res.statusCode !== 200) throw Object.assign(new Error(`chunk failed: ${res.body}`), { res });
  }
  return id;
}

/** A vendor account that finished the quick start. */
export async function onboardedVendor(ctx: Ctx, overrides: Record<string, unknown> = {}) {
  const auth = await signUp(ctx, 'vendor');
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/vendor/quick-start',
    headers: { authorization: auth.authorization },
    payload: {
      displayName: 'Test Dogs',
      categories: ['hot_dogs'],
      menu: [{ id: crypto.randomUUID(), name: 'Bacon dog', priceCents: 700 }],
      paymentMethods: ['cash'],
      ...overrides,
    },
  });
  if (res.statusCode !== 201) throw new Error(`quick start failed: ${res.body}`);
  return { headers: { authorization: auth.authorization }, vendorId: res.json().id as string, userId: auth.userId };
}
