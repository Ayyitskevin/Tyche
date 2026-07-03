import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { loadConfig } from './env';

/**
 * Close the app on SIGTERM/SIGINT (docker stop, redeploy, Ctrl-C) so its
 * onClose hooks run — checkpoint the SQLite WAL and flush pending audit writes —
 * instead of the 10s-timeout SIGKILL that would strand them mid-write. Makes
 * `scripts/backup.sh`'s stop quick and its snapshot clean. Idempotent.
 */
function installGracefulShutdown(app: FastifyInstance): void {
  let closing = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (closing) return;
    closing = true;
    console.info(`[tyche-api] ${signal} received — shutting down`);
    app.close().then(
      () => process.exit(0),
      (err) => {
        console.error('[tyche-api] error during shutdown', err);
        process.exit(1);
      },
    );
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, shutdown);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });
  installGracefulShutdown(app);
  try {
    await app.listen({ host: config.host, port: config.port });
    console.info(
      `[tyche-api] listening on http://${config.host}:${config.port} (providers: ${config.providers.join(', ')})`,
    );
  } catch (err) {
    console.error('[tyche-api] failed to start', err);
    process.exit(1);
  }
}

void main();
