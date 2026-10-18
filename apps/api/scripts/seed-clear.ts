import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db/client';
import { inviteCodes, users } from '../src/db/schema';
import { isMain } from '../src/lib/is-main';
import { createStorage, type Storage } from '../src/lib/storage';

/**
 * Removes every demo row. Demo users are flagged is_demo and everything they
 * own cascades from them (profiles, menus, posts, live sessions, reviews...).
 * Tags and synonyms are reference data and stay.
 */
export async function clearDemoData(db: Db, storage?: Storage) {
  // Photo files go first: rows cascade away with their users, files don't.
  const files = await db.execute<{ storage_key: string; thumb_key: string }>(sql`
    SELECT p.storage_key, p.thumb_key FROM photos p
    WHERE p.vendor_id IN (SELECT v.id FROM vendor_profiles v JOIN users u ON u.id = v.user_id WHERE u.is_demo)
       OR p.uploader_user_id IN (SELECT id FROM users WHERE is_demo)`);
  if (storage) await Promise.all(files.flatMap((f) => [storage.removePhoto(f.storage_key), storage.removePhoto(f.thumb_key)]));
  const deletedUsers = await db.delete(users).where(eq(users.isDemo, true)).returning({ id: users.id });
  const deletedInvites = await db.delete(inviteCodes).where(eq(inviteCodes.isDemo, true)).returning({ id: inviteCodes.id });
  // Reports about demo content point at ids that no longer exist.
  await db.execute(sql`
    DELETE FROM reports r
    WHERE (r.target_type = 'vendor' AND NOT EXISTS (SELECT 1 FROM vendor_profiles v WHERE v.id = r.target_id))
       OR (r.target_type = 'review' AND NOT EXISTS (SELECT 1 FROM reviews x WHERE x.id = r.target_id))
       OR (r.target_type = 'photo' AND NOT EXISTS (SELECT 1 FROM photos x WHERE x.id = r.target_id))`);
  return { users: deletedUsers.length, inviteCodes: deletedInvites.length, photos: files.length };
}

if (isMain(import.meta.url)) {
  const config = loadConfig();
  const { db, close } = createDb(config.databaseUrl);
  const result = await clearDemoData(db, createStorage(config.uploadDir));
  await close();
  console.log(
    `Removed demo data: ${result.users} users (and everything they owned), ${result.photos} photos and ${result.inviteCodes} invite codes.`,
  );
}
