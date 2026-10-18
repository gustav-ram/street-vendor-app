import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { startSweeper } from './jobs/sweeper';

const config = loadConfig();
const { db, close } = createDb(config.databaseUrl);
const app = await buildApp({ config, db });
const stopSweeper = startSweeper(db, app.log, app.ctx.storage);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  stopSweeper();
  await app.close();
  await close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
