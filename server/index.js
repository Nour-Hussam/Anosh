import http from 'node:http';

import { assertValidConfig, config } from './config.js';
import { closeDb, getDb } from './db/index.js';
import { createApp } from './app.js';
import { ensureAdminUser, ensureDefaultSettings, startMaintenance } from './bootstrap.js';
import logger from './utils/logger.js';

async function main() {
  assertValidConfig();

  getDb();
  ensureDefaultSettings();
  await ensureAdminUser();

  const app = createApp();
  const server = http.createServer(app);

  // Slow-loris / oversized-header protection.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 10_000;
  server.maxRequestsPerSocket = 200;

  server.listen(config.port, config.host, () => {
    logger.info('server.listening', {
      url: config.baseUrl,
      host: config.host,
      port: config.port,
      env: config.env,
      db: config.db.file,
      mail: config.mail.enabled ? `smtp://${config.mail.host}` : 'disabled (logs only)',
    });
    // eslint-disable-next-line no-console
    console.log(`\n  🐪  Kingdom Journeys is running at ${config.baseUrl}\n      Admin dashboard: ${config.baseUrl}/admin/\n`);
  });

  startMaintenance();

  const shutdown = (signal) => {
    logger.info('server.shutting_down', { signal });
    server.close(() => {
      try {
        closeDb();
      } finally {
        process.exit(0);
      }
    });
    // Never hang forever on stuck connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { message: String(reason?.message || reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('process.uncaught_exception', { message: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });

  return server;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`\n❌ Failed to start: ${err.message}\n`);
  process.exit(1);
});
