import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { deleteExpiredOrders, processPendingOutbox } from './workers/outbox.js';

const config = loadConfig();
const pool = createPool(config);
pool.on('error', (error: Error) => {
  process.stderr.write(`Database pool error: ${error.name}\n`);
});
const app = await buildApp(config, pool);

const runOutbox = () => {
  void processPendingOutbox(pool, config).catch((error: unknown) => {
    app.log.error({ err: error }, 'outbox_worker_failed');
  });
};
runOutbox();
const outboxTimer = setInterval(runOutbox, 15_000);
outboxTimer.unref();

const runRetention = () => {
  void deleteExpiredOrders(pool).catch((error: unknown) => {
    app.log.error({ err: error }, 'retention_cleanup_failed');
  });
};
runRetention();
const retentionTimer = setInterval(runRetention, 60 * 60 * 1000);
retentionTimer.unref();

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutdown_started');
  clearInterval(outboxTimer);
  clearInterval(retentionTimer);
  await app.close();
  await pool.end();
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: config.PORT });
