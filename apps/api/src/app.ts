import { resolve } from 'node:path';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createProviderRegistry } from '@tyche/data-adapters';
import { loadConfig, type ApiConfig } from './env';
import type { AppContext } from './context';
import { FilePersistence } from './persistence/FilePersistence';
import { SqlitePersistence } from './persistence/SqlitePersistence';
import type { PersistenceStore } from './persistence/types';
import { PluginHost, type ProviderPlugin } from './plugins/PluginHost';
import { loadConfiguredPlugins } from './plugins/loader';
import { QuoteStreamHub } from './stream/hub';
import { ConsoleAuditSink, FileAuditSink, HttpAuditSink, type AuditSink } from './security/audit';
import { createAuthGuard } from './security/auth';
import { MockBillingDriver, StripeBillingDriver, entitlement, type BillingDriver } from './saas/billing';
import { requestScope, scopedAudit, scopedPersistence } from './saas/requestContext';
import { SESSION_COOKIE, verifySession } from './saas/sessions';
import { type EmailSender, createEmailSender } from './saas/email';
import { InviteRegistry } from './saas/invites';
import { DEFAULT_RETENTION_OPTIONS, runRetentionTick } from './saas/retention';
import { UserRegistry } from './saas/users';
import { UserStores } from './saas/userStores';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthRoutes } from './routes/auth';
import { registerBillingRoutes } from './routes/billing';
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

/** Let `listen()` settle before the first retention scan; then scan every 6h. */
const RETENTION_BOOT_DELAY_MS = 60_000;
const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

  // Select the audit sink: stdout by default, a durable JSON-lines file, or an
  // HTTP webhook that streams events to an external SIEM/collector. The file sink
  // seeds its recent-events buffer from the existing log on boot; the http sink
  // degrades to console (with a loud warning) if no webhook URL is configured.
  let audit: AuditSink;
  if (config.auditSink === 'file') {
    const fileSink = new FileAuditSink(config.auditFile);
    await fileSink.init();
    audit = fileSink;
  } else if (config.auditSink === 'http' && config.auditWebhookUrl) {
    audit = new HttpAuditSink(config.auditWebhookUrl, config.auditWebhookToken);
  } else {
    if (config.auditSink === 'http') {
      console.warn('[audit] TYCHE_AUDIT_SINK=http but TYCHE_AUDIT_WEBHOOK_URL is unset — falling back to the console sink. Audit events are NOT delivered off-box.');
    }
    audit = new ConsoleAuditSink(true);
  }

  // Hosted mode: a user registry + per-user data stores, surfaced to the
  // existing routes through request-scoped persistence (no route changes).
  const hosted = config.mode === 'hosted';
  let users: UserRegistry | undefined;
  let userStores: UserStores | undefined;
  let invites: InviteRegistry | undefined;
  let billing: BillingDriver | undefined;
  let email: EmailSender | undefined;
  if (hosted) {
    if (!config.sessionSecret || config.sessionSecret.length < 16) {
      throw new Error('TYCHE_MODE=hosted requires TYCHE_SESSION_SECRET (>= 16 chars).');
    }
    users = new UserRegistry(config.dataDir, config.adminEmail);
    await users.init();
    invites = new InviteRegistry(config.dataDir);
    await invites.init();
    userStores = new UserStores(config);
    // Transactional email (password reset, …): console by default (logs, keyless),
    // or an HTTP webhook to your provider. Never bundled — bring your own.
    email = createEmailSender(config);
    // Loud, once, at boot: if reset mail is being LOGGED rather than delivered,
    // an operator must know — otherwise password resets silently never arrive
    // (and the redacted console line means the user is simply stuck). Mirrors
    // the mock-billing boot warning.
    if (email.name === 'console') {
      if (config.emailSink === 'http') {
        console.warn('[email] TYCHE_EMAIL_SINK=http but TYCHE_EMAIL_WEBHOOK_URL is unset — falling back to the console sink. Password-reset mail is NOT delivered. Set the webhook URL.');
      } else {
        console.warn('[email] CONSOLE email sink active in hosted mode: password-reset mail is logged, not delivered. Set TYCHE_EMAIL_SINK=http + TYCHE_EMAIL_WEBHOOK_URL in production.');
      }
    }
    // Billing is a driver behind BillingState: mock for the full local loop,
    // Stripe for production, none for accounts-without-paywall deployments.
    if (config.billing === 'stripe') {
      if (!config.stripeSecretKey || !config.stripePriceId || !config.stripeWebhookSecret) {
        throw new Error('TYCHE_BILLING=stripe requires STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET.');
      }
      billing = new StripeBillingDriver({
        secretKey: config.stripeSecretKey,
        priceId: config.stripePriceId,
        annualPriceId: config.stripePriceIdAnnual,
        webhookSecret: config.stripeWebhookSecret,
      });
    } else if (config.billing === 'mock') {
      billing = new MockBillingDriver(config.sessionSecret);
      // Mock checkout upgrades to pro WITHOUT payment — never leave this on in
      // production. Loud, once, at boot.
      console.warn('[billing] MOCK billing driver active: checkout is free. Use TYCHE_BILLING=stripe in production.');
    }
  }

  const ctx: AppContext = {
    config,
    registry,
    persistence: hosted ? scopedPersistence(persistence) : persistence,
    plugins,
    hub: new QuoteStreamHub(registry),
    audit: hosted ? scopedAudit(audit) : audit,
    ...(users ? { users } : {}),
    ...(userStores ? { userStores } : {}),
    ...(invites ? { invites } : {}),
    ...(billing ? { billing } : {}),
    ...(email ? { email } : {}),
  };

  // Hosted deployments sit behind a TLS-terminating reverse proxy (Caddy). Trust
  // EXACTLY `trustProxyHops` proxy hops — not the whole X-Forwarded-For chain —
  // so `secure: 'auto'` cookies see the forwarded https AND request.ip (the
  // rate-limit key) is the real client the proxy appended, which a client cannot
  // spoof by pre-seeding X-Forwarded-For. Selfhost trusts no proxy (direct peer).
  const app = Fastify({ logger: false, trustProxy: hosted ? config.trustProxyHops : false });
  // Release the persistence handle (e.g. close the SQLite db, checkpoint WAL) and
  // flush any pending writes on shutdown: the audit log, and the user registry's
  // queue (an off-response-path verification/reset email enqueues a persist that
  // must settle before exit).
  app.addHook('onClose', async () => {
    ctx.persistence.close?.();
    if (ctx.users) await ctx.users.flush();
    if (ctx.invites) await ctx.invites.flush();
    // Flush the RAW sink, not ctx.audit — in hosted mode ctx.audit is the
    // request-scoping wrapper, so an `instanceof` check on it would never match.
    if (audit instanceof FileAuditSink || audit instanceof HttpAuditSink) await audit.flush();
  });

  // Retention email campaigns (hosted): a day-11 "trial ending" nudge and a
  // day-2 "welcome back" re-engagement mail, each sent at most once per account
  // (persisted markers → no double-send across restarts). Gated on a REAL email
  // sender: with the console sink these would only spam the logs, so the
  // campaign is disabled with a one-time warning rather than run — never a crash.
  // Uses the unscoped `audit` sink (no request context in a background tick).
  // Single-process by design (like rate-limiting/sessions): the persisted marker
  // dedups across restarts, not across nodes — a multi-node fleet would need a
  // shared lock (see SECURITY.md / backlog #15).
  if (hosted && users && email) {
    if (email.name === 'console') {
      console.warn(
        '[retention] email campaigns disabled: console sink (mail is logged, not delivered). Set TYCHE_EMAIL_SINK=http + TYCHE_EMAIL_WEBHOOK_URL to enable trial-ending / welcome-back mail.',
      );
    } else {
      const deps = {
        users,
        email,
        audit,
        options: { ...DEFAULT_RETENTION_OPTIONS, appBaseUrl: config.publicUrl.replace(/\/$/, '') },
      };
      const tick = (): void => {
        void runRetentionTick(deps).catch((err) => console.error('[retention] tick failed', err));
      };
      const bootTimer = setTimeout(tick, RETENTION_BOOT_DELAY_MS);
      const interval = setInterval(tick, RETENTION_INTERVAL_MS);
      // Never keep the event loop (or a test's app) alive just for these timers.
      bootTimer.unref?.();
      interval.unref?.();
      app.addHook('onClose', async () => {
        clearTimeout(bootTimer);
        clearInterval(interval);
      });
    }
  }

  // Observability: with `logger: false`, an unhandled error would otherwise
  // vanish. Log every 5xx as one structured JSON line to stdout (reqId, method,
  // url, status, message, stack) so a solo operator can actually see failures,
  // and return a generic body that never leaks internals. 4xx keep their intent.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) {
      console.error(
        JSON.stringify({
          level: 'error',
          at: new Date().toISOString(),
          reqId: request.id,
          method: request.method,
          url: request.url.split('?')[0],
          status,
          msg: error.message,
          stack: error.stack,
        }),
      );
      void reply.code(status).send({ error: { kind: 'internal', message: 'Internal server error.' } });
      return;
    }
    void reply.code(status).send({ error: { kind: 'bad_request', message: error.message } });
  });

  // One structured access line per request (no headers/body logged, so nothing
  // sensitive to redact; the path is query-stripped). Quiet under Vitest to keep
  // unit-test output clean; on in real runs where the json-file log cap bounds it.
  if (!process.env.VITEST) {
    app.addHook('onResponse', (request, reply, done) => {
      console.info(
        JSON.stringify({
          level: 'info',
          at: new Date().toISOString(),
          reqId: request.id,
          method: request.method,
          path: request.url.split('?')[0],
          status: reply.statusCode,
          ms: Math.round(reply.elapsedTime),
        }),
      );
      done();
    });
  }
  // WEB_ORIGIN is the single CORS allow-list for both REST and the SSE stream.
  await app.register(cors, {
    origin: config.webOrigin,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
    credentials: true,
  });
  await app.register(cookie);
  app.addHook('preHandler', createAuthGuard(config));

  // Read-only public demo: reject every persistence write so a shared, no-signup
  // instance can't be clobbered or vandalized. GET/stream/market data all work;
  // the screener and AI copilot are POSTs that don't persist, so they're allowed.
  if (config.demo) {
    const READ_ONLY_POSTS = new Set(['/api/screen', '/api/ai/chat']);
    const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
    app.addHook('onRequest', (request, reply, done) => {
      const path = request.url.split('?')[0] ?? request.url;
      if (path.startsWith('/api/') && WRITE_METHODS.has(request.method) && !READ_ONLY_POSTS.has(path)) {
        void reply.code(403).send({
          error: {
            kind: 'read_only_demo',
            message: 'This is a read-only public demo — self-host or sign up to save your work.',
          },
        });
        return;
      }
      done();
    });
  }

  if (hosted && users && userStores) {
    const accounts = users;
    const stores = userStores;
    app.addHook('onClose', async () => {
      await stores.closeAll();
    });
    // Session resolution + per-request data scoping. Callback-style hook with
    // AsyncLocalStorage.run() so the remaining lifecycle (hooks + handler) runs
    // INSIDE the scope and it can never leak across requests (enterWith would).
    const paywalled = Boolean(billing);
    app.addHook('onRequest', (request, reply, done) => {
      const path = request.url.split('?')[0] ?? request.url;
      const shared =
        !path.startsWith('/api/') ||
        path === '/api/health' ||
        path === '/api/ready' ||
        path.startsWith('/api/auth/') ||
        request.method === 'OPTIONS';
      // An expired trial can still sign in, read its status, pay, and EXPORT
      // its data ("cancel anytime — export everything" must survive the
      // paywall). The billing endpoints themselves (except the provider-called,
      // signature-verified webhook) still require a session.
      const paywallExempt = shared || path.startsWith('/api/billing') || path === '/api/account/export';
      const anonOpen = shared || path === '/api/billing/webhook';
      const header = request.headers.authorization ?? '';
      const token =
        request.cookies[SESSION_COOKIE] ?? (header.startsWith('Bearer ') ? header.slice(7) : undefined);
      const claims = token ? verifySession(config.sessionSecret!, token) : null;
      const user = claims ? accounts.get(claims.userId) : undefined;
      if (user && claims && user.tokenEpoch === claims.tokenEpoch) {
        // Admins (the operators) are never paywalled out of their own service.
        if (paywalled && !paywallExempt && !user.admin && entitlement(user.billing) === 'expired') {
          void reply
            .code(402)
            .send({ error: { kind: 'payment_required', message: 'Your free trial has ended. Upgrade to keep using the terminal.' } });
          return;
        }
        accounts.touch(user.id, new Date().toISOString());
        stores
          .forUser(user.id)
          .then((store) => requestScope.run({ user, store }, done))
          .catch((err: unknown) => done(err instanceof Error ? err : new Error(String(err))));
        return;
      }
      if (anonOpen) {
        done();
        return;
      }
      void reply.code(401).send({ error: { kind: 'unauthorized', message: 'Sign in to continue.' } });
    });
  }

  if (config.serveWeb) {
    // Single-process self-host: serve the built web app same-origin, with an
    // SPA fallback for every non-API GET. API routes keep priority.
    const root = resolve(config.serveWeb);
    await app.register(fastifyStatic, { root, wildcard: true, index: ['index.html'] });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        void reply.sendFile('index.html');
        return;
      }
      void reply.code(404).send({ error: { kind: 'not_found', message: 'Route not found.' } });
    });
  } else {
    app.get('/', async () => ({ name: 'tyche-api', status: 'ok', health: '/api/health' }));
  }

  registerAuthRoutes(app, ctx);
  registerBillingRoutes(app, ctx);
  registerAdminRoutes(app, ctx);
  registerHealthRoutes(app, ctx, persistence);
  registerMarketRoutes(app, ctx);
  registerResearchRoutes(app, ctx);
  registerUserRoutes(app, ctx);
  registerAiRoutes(app, ctx);
  registerStreamRoutes(app, ctx);

  return app;
}
