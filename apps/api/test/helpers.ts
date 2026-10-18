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
export async function signUp(ctx: Ctx, role: 'customer' | 'vendor') {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: MOBILE,
    payload: { email: uniqueEmail(role), role, credential: { kind: 'password', secret: 'correct-horse-battery' } },
  });
  const body = res.json();
  return { authorization: `Bearer ${body.accessToken}`, userId: body.user.id as string };
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
