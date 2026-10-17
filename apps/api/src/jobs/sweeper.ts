import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client';
import { safeError } from '../lib/logging';

/**
 * Deletes data whose time is up. Public queries already filter on expiry, so
 * nothing expired is ever *shown* even if a sweep is late; this makes sure it
 * is also *gone*.
 */
export async function runSweep(db: Db) {
  const count = async (q: ReturnType<typeof sql>) => (await db.execute(q)).count ?? 0;
  return {
    // Heartbeats stopped, or the auto-off / end-of-day time passed:
    // the row (and the only copy of the location) is deleted.
    liveSessions: await count(sql`DELETE FROM vendor_live_sessions WHERE expires_at <= now() OR ends_at <= now()`),
    // "Tomorrow" posts disappear shortly after their window ends.
    upcomingPosts: await count(sql`DELETE FROM upcoming_spot_posts WHERE ends_at <= now() - interval '1 hour'`),
    statusPosts: await count(sql`DELETE FROM vendor_status_posts WHERE expires_at <= now()`),
    uploads: await count(sql`DELETE FROM uploads WHERE expires_at <= now()`),
    tombstones: await count(sql`DELETE FROM deleted_entities WHERE deleted_at <= now() - interval '30 days'`),
    confirmations: await count(sql`DELETE FROM still_here_confirmations WHERE created_at <= now() - interval '30 days'`),
    // Keep the current and previous pepper (30-day epochs); older hashes become unlinkable.
    peppers: await count(sql`DELETE FROM hash_peppers WHERE created_at <= now() - interval '60 days'`),
    authSessions: await count(sql`DELETE FROM auth_sessions WHERE expires_at <= now()`),
  };
}

export function startSweeper(db: Db, log: FastifyBaseLogger, intervalMs = 30_000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runSweep(db);
      const removed = Object.entries(result).filter(([, n]) => n > 0);
      // Counts only: never which vendors or rows.
      if (removed.length > 0) log.info({ removed: Object.fromEntries(removed) }, 'sweep');
    } catch (err) {
      log.error({ err: safeError(err) }, 'sweep failed');
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
