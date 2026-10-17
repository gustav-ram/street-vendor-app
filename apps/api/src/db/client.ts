import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    // Keep NOTICE messages (e.g. "relation already exists") out of the logs.
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];
