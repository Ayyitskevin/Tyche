import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createProviderRegistry } from '@tyche/data-adapters';
import { loadConfig, type ApiConfig } from './env';
import type { AppContext } from './context';
import { FilePersistence } from './persistence/FilePersistence';
import { SqlitePersistence } from './persistence/SqlitePersistence';
import type { PersistenceStore } from './persistence/types';
import { PluginHost, type ProviderPlugin } from './plugins/PluginHost';
import { loadConfiguredPlugins } from './plugins/loader';
import { QuoteStreamHub } from './stream/hub';
import { ConsoleAuditSink, FileAuditSink, type AuditSink } from './security/audit';
import { createAuthGuard } from './security/auth';
import { registerHealthRoutes } from './routes/health';
import { registerMarketRoutes } from './routes/market';
import { registerResearchRoutes } from './routes/research';
import { registerUserRoutes } from './routes/user';
import { registerAiRoutes } from './routes/ai';
import { registerStreamRoutes } from './routes/stream';

export interface BuildAppOptions {
  config?: Partial<ApiConfig>;
  persistence?: PersistenceStore;
  /** Provider plugins to register at boot (in addition to TYCHE_PLUGINS). */
  plugins?: ProviderPlugin[];
}

/**
 * Select a persistence backend from config, initializing it. SQLite is opt-in
 * (`TYCHE_PERSISTENCE=sqlite`); if it fails to initialize (e.g. `node:sqlite`
 * unavailable on an older runtime) we log and fall back to the file store, so a
 * deployment never fails to boot over its persistence choice.
 */
async function createPersistence(config: ApiConfig): Promise<PersistenceStore> {
  if (config.persistence === 'sqlite') {
    try {
      const sqlite = new SqlitePersistence(config.sqlitePath);
      await sqlite.init();
      return sqlite;
    } catch (err) {
      console.warn(
        `[persistence] SQLite init failed (${err instanceof Error ? err.message : String(err)}); falling back to file store.`,
      );
    }
  }
  const file = new FilePersistence(config.dataDir);
  await file.init();
  return file;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config: ApiConfig = { ...loadConfig(), ...options.config };
  const registry = createProviderRegistry({
    providers: config.providers,
    secEdgarUserAgent: config.secEdgarUserAgent,
    fredApiKey: config.fredApiKey,
  });
  let persistence = options.persistence;
  if (!persistence) {
    persistence = await createPersistence(config);
  } else {
    await persistence.init();
  }

  // Register operator-installed provider plugins before serving: each is
  // conformance-gated, so only passing adapters join the registry (and thus the
  // capability dashboard); the rest are quarantined and visible via /api/plugins.
  // Plugins the operator turned off (preferences.disabledPlugins) are recorded as
  // disabled and never instantiated.
  const plugins = new PluginHost(registry);
  const disabled = new Set((await persistence.getPreferences()).disabledPlugins);
  const providerPlugins = [...(options.plugins ?? []), ...(await loadConfiguredPlugins(config.plugins))];
  for (const plugin of providerPlugins) {
    await plugins.registerProvider(plugin, { enabled: !disabled.has(plugin.manifest?.id) });
  }

  // Select the audit sink: stdout by default, or a durable JSON-lines file when
  // configured (self-hosters who want an accountability trail). The file sink
  // seeds its recent-events buffer from the existing log on boot.
  let audit: AuditSink;
  if (config.auditSink === 'file') {
    const fileSink = new FileAuditSink(config.auditFile);
    await fileSink.init();
    audit = fileSink;
  } else {
    audit = new ConsoleAuditSink(true);
  }

  const ctx: AppContext = {
    config,
    registry,
    persistence,
    plugins,
    hub: new QuoteStreamHub(registry),
    audit,
  };

  const app = Fastify({ logger: false });
  // Release the persistence handle (e.g. close the SQLite db, checkpoint WAL) and
  // flush any pending audit writes on shutdown.
  app.addHook('onClose', async () => {
    ctx.persistence.close?.();
    if (ctx.audit instanceof FileAuditSink) await ctx.audit.flush();
  });
  // WEB_ORIGIN is the single CORS allow-list for both REST and the SSE stream.
  await app.register(cors, {
    origin: config.webOrigin,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
  });
  app.addHook('preHandler', createAuthGuard(config));

  app.get('/', async () => ({ name: 'tyche-api', status: 'ok', health: '/api/health' }));

  registerHealthRoutes(app, ctx);
  registerMarketRoutes(app, ctx);
  registerResearchRoutes(app, ctx);
  registerUserRoutes(app, ctx);
  registerAiRoutes(app, ctx);
  registerStreamRoutes(app, ctx);

  return app;
}
