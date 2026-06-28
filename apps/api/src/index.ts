import { buildApp } from './app';
import { loadConfig } from './env';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });
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
