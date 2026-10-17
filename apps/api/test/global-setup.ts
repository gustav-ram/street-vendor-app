import { runMigrations } from '../scripts/migrate';
import { loadConfig } from '../src/config';

export default async function setup() {
  process.env.NODE_ENV = 'test';
  const config = loadConfig();
  if (!config.databaseUrl.includes('_test')) {
    throw new Error('Refusing to run tests against a non-test database. Set TEST_DATABASE_URL.');
  }
  await runMigrations(config.databaseUrl);
}
