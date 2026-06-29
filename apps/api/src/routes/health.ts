import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { localProvenance } from './helpers';

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
    mode: ctx.registry.descriptors().every((d) => d.mode === 'mock') ? 'mock' : 'mixed',
    providers: ctx.registry.descriptors().map((d) => ({
      name: d.name,
      mode: d.mode,
      requiresConfiguration: d.requiresConfiguration,
    })),
    capabilities: ctx.registry.aggregateCapabilities(),
  }));

  app.get('/api/providers', async () => ({
    data: ctx.registry.descriptors(),
    // Union coverage across all enabled providers (additive; same set the
    // capability-gap logic uses). Lets a client show total terminal coverage.
    aggregate: ctx.registry.aggregateCapabilities(),
    provenance: null,
  }));

  // Installed plugins and their gate status (active / quarantined / disabled).
  app.get('/api/plugins', async () => ({
    data: ctx.plugins.list(),
    provenance: localProvenance('plugins'),
  }));

  // Recent audit events (newest first) for operator inspection. Read-only; the
  // durable trail itself lives in the configured sink (stdout or a file).
  app.get('/api/audit', async (request) => {
    const { limit } = request.query as { limit?: string };
    const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
    return { data: ctx.audit.recent(n), provenance: localProvenance('audit') };
  });
}
