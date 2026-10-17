import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { isMain } from '../src/lib/is-main';

export const migrationsFolder = fileURLToPath(new URL('../src/db/migrations', import.meta.url));

export async function runMigrations(databaseUrl: string) {
  const { db, close } = createDb(databaseUrl);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}

if (isMain(import.meta.url)) {
  const config = loadConfig();
  await runMigrations(config.databaseUrl);
  console.log('Migrations applied.');
}
