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
