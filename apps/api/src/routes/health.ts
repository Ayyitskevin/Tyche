import type { FastifyInstance } from 'fastify';
import type { PersistenceStore } from '../persistence/types';
import type { AppContext } from '../context';
import { currentUser } from '../saas/requestContext';
import { localProvenance } from './helpers';

/**
 * @param readyStore the UNSCOPED base persistence store — probed by /api/ready
 *   with a cheap read so readiness reflects the real backend, not a per-request
 *   scope (which doesn't exist for this shared route).
 */
export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext, readyStore: PersistenceStore): void {
  // Liveness: always cheap, no I/O. Answers "is the process up?" — the target
  // for the container HEALTHCHECK. uptimeSec surfaces crash-loops/restarts.
  app.get('/api/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
    version: process.env.TYCHE_VERSION ?? process.env.npm_package_version ?? 'unknown',
    uptimeSec: Math.round(process.uptime()),
    appMode: ctx.config.mode,
    demo: ctx.config.demo,
    billing: ctx.billing?.name ?? 'none',
    mode: ctx.registry.descriptors().every((d) => d.mode === 'mock') ? 'mock' : 'mixed',
    providers: ctx.registry.descriptors().map((d) => ({
      name: d.name,
      mode: d.mode,
      requiresConfiguration: d.requiresConfiguration,
    })),
    capabilities: ctx.registry.aggregateCapabilities(),
  }));

  // Readiness: "can the app actually serve?" — a cheap real read against the
  // persistence backend. 503 on failure so a load balancer / the deploy probe
  // can tell a booting-or-broken instance from a healthy one.
  app.get('/api/ready', async (_request, reply) => {
    try {
      await readyStore.getPreferences();
      return { status: 'ready' };
    } catch (error) {
      reply.code(503);
      return { status: 'unavailable', check: 'persistence', message: error instanceof Error ? error.message : 'error' };
    }
  });

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
  // durable trail itself lives in the configured sink (stdout or a file). The
  // ring buffer is a single GLOBAL trail spanning every tenant (emails, activity),
  // so in hosted mode it is admin-only — a non-admin tenant must never read other
  // accounts' events. In self-host mode the optional TYCHE_AUTH_ENABLED bearer
  // guard (createAuthGuard) is the gate; there is a single operator, no tenants.
  app.get('/api/audit', async (request, reply) => {
    if (ctx.config.mode === 'hosted' && !currentUser()?.admin) {
      reply.code(403).send({ error: { kind: 'forbidden', message: 'Admin accounts only.' } });
      return;
    }
    const { limit } = request.query as { limit?: string };
    const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
    return { data: ctx.audit.recent(n), provenance: localProvenance('audit') };
  });
}
