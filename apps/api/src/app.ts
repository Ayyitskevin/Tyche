import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createProviderRegistry } from '@tyche/data-adapters';
import { loadConfig, type ApiConfig } from './env';
import type { AppContext } from './context';
import { FilePersistence } from './persistence/FilePersistence';
import type { PersistenceStore } from './persistence/types';
import { QuoteStreamHub } from './stream/hub';
import { ConsoleAuditSink } from './security/audit';
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
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config: ApiConfig = { ...loadConfig(), ...options.config };
  const registry = createProviderRegistry({ providers: config.providers });
  const persistence = options.persistence ?? new FilePersistence(config.dataDir);
  await persistence.init();

  const ctx: AppContext = {
    config,
    registry,
    persistence,
    hub: new QuoteStreamHub(registry),
    audit: new ConsoleAuditSink(true),
  };

  const app = Fastify({ logger: false });
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
