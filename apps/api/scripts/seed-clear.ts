import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db/client';
import { inviteCodes, users } from '../src/db/schema';
import { isMain } from '../src/lib/is-main';

/**
 * Removes every demo row. Demo users are flagged is_demo and everything they
 * own cascades from them (profiles, menus, posts, live sessions, reviews...).
 * Tags and synonyms are reference data and stay.
 */
export async function clearDemoData(db: Db) {
  const deletedUsers = await db.delete(users).where(eq(users.isDemo, true)).returning({ id: users.id });
  const deletedInvites = await db.delete(inviteCodes).where(eq(inviteCodes.isDemo, true)).returning({ id: inviteCodes.id });
  // Reports about demo content point at ids that no longer exist.
  await db.execute(sql`
    DELETE FROM reports r
    WHERE (r.target_type = 'vendor' AND NOT EXISTS (SELECT 1 FROM vendor_profiles v WHERE v.id = r.target_id))
       OR (r.target_type = 'review' AND NOT EXISTS (SELECT 1 FROM reviews x WHERE x.id = r.target_id))
       OR (r.target_type = 'photo' AND NOT EXISTS (SELECT 1 FROM photos x WHERE x.id = r.target_id))`);
  return { users: deletedUsers.length, inviteCodes: deletedInvites.length };
}

if (isMain(import.meta.url)) {
  const { db, close } = createDb(loadConfig().databaseUrl);
  const result = await clearDemoData(db);
  await close();
  console.log(`Removed demo data: ${result.users} users (and everything they owned), ${result.inviteCodes} invite codes.`);
}
