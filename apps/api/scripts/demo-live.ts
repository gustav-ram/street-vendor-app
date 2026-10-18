import { eq, inArray } from 'drizzle-orm';
import type { AppContext } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { users, vendorProfiles } from '../src/db/schema';
import { createTokenService } from '../src/lib/tokens';
import { ApiError } from '../src/lib/errors';
import { endLiveSession, heartbeatLiveSession, startLiveSession } from '../src/modules/live/service';
import { DEMO_ACCOUNTS } from './seed-data/accounts';
import { VENDORS } from './seed-data/vendors';

/**
 * Keeps most demo vendors live by sending heartbeats on their behalf, exactly
 * like the vendor app does. Stop it (Ctrl+C) and they go offline at once;
 * kill it hard and they expire on their own after the grace period.
 *
 * Usage: npm run demo:live [-- --all]
 */

// A few stay offline so the "Upcoming" results (tomorrow posts, schedules) show up.
const OFFLINE = new Set(['perros-la-guera', 'fruteria-paraiso', 'paletas-el-oso', 'churro-loco', 'girasoles-del-parque', 'esquites-michoacana']);

const config = loadConfig();
const { db, close } = createDb(config.databaseUrl);
const ctx: AppContext = { config, db, tokens: createTokenService(config) };

const emailFor = (key: string) => (key === DEMO_ACCOUNTS.vendor.vendorKey ? DEMO_ACCOUNTS.vendor.email : `vendor-${key}@demo.test`);
const chosen = VENDORS.filter((v) => process.argv.includes('--all') || !OFFLINE.has(v.key));

const rows = await db
  .select({
    id: vendorProfiles.id,
    email: users.email,
    timezone: vendorProfiles.timezone,
    hidden: vendorProfiles.hidden,
    defaultPrecision: vendorProfiles.defaultPrecision,
  })
  .from(vendorProfiles)
  .innerJoin(users, eq(users.id, vendorProfiles.userId))
  .where(inArray(users.email, chosen.map((v) => emailFor(v.key))));
const byEmail = new Map(rows.map((r) => [r.email, r]));
const live = chosen.flatMap((v) => {
  const row = byEmail.get(emailFor(v.key));
  return row ? [{ ...row, spot: v.spot, name: v.name }] : [];
});

if (live.length === 0) {
  console.error('No demo vendors found. Run `npm run seed` first.');
  await close();
  process.exit(1);
}

async function heartbeat() {
  for (const v of live) {
    try {
      await heartbeatLiveSession(ctx, v.id, v.spot);
    } catch (err) {
      // Not live yet (first run) or expired: start a session, like the app does.
      if (err instanceof ApiError && err.code === 'not_live') await startLiveSession(ctx, v, v.spot).catch(() => {});
      else throw err;
    }
  }
}

async function stop() {
  clearInterval(timer);
  for (const v of live) await endLiveSession(ctx, v.id);
  await close();
  console.log(`\n${live.length} demo vendors went offline.`);
  process.exit(0);
}

await heartbeat();
const timer = setInterval(() => void heartbeat().catch((e) => console.error('heartbeat failed:', e.message)), config.live.heartbeatIntervalSec * 1000);
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
console.log(
  `${live.length} demo vendors are live (heartbeat every ${config.live.heartbeatIntervalSec}s). ` +
    'Press Ctrl+C to take them offline.',
);
