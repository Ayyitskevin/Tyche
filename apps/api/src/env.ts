import { join } from 'node:path';

export interface ApiConfig {
  host: string;
  port: number;
  webOrigin: string;
  /** selfhost (default: single user, no accounts) or hosted (multi-user SaaS). */
  mode: 'selfhost' | 'hosted';
  /**
   * Read-only public demo: blocks every persistence write (workspaces, notes,
   * alerts, …) with a 403 so anyone can drive the terminal without an account
   * and without clobbering the shared demo. Reads, streams, market data, the
   * screener, and the AI copilot still work. Pair with mock providers.
   */
  demo: boolean;
  /** HMAC secret for session tokens; REQUIRED in hosted mode. */
  sessionSecret: string | null;
  /**
   * Number of trusted reverse-proxy hops in front of the API (hosted mode).
   * request.ip and X-Forwarded-* are resolved from exactly this many hops, so a
   * client cannot spoof its IP (and bypass rate limiting) by pre-seeding
   * X-Forwarded-For. Default 1 matches the shipped single-Caddy topology, whose
   * Caddyfile OVERWRITES X-Forwarded-For with the direct client. If you run an
   * additional proxy/CDN IN FRONT of Caddy, raising this alone is NOT enough —
   * the edge Caddy must also be changed to PRESERVE the upstream's forwarded
   * client instead of overwriting it (see deploy/Caddyfile), or every user
   * behind a CDN PoP collapses to one rate-limit bucket. Ignored in selfhost.
   */
  trustProxyHops: number;
  /** Whether new account registration is open (hosted mode). */
  signups: 'open' | 'closed';
  /** Email that is granted the admin (founder) flag on registration. */
  adminEmail: string | null;
  /** Max seats (accounts + outstanding invites) on a closed instance; null = unlimited. */
  seatLimit: number | null;
  /**
   * Billing driver (hosted mode): `stripe` (production), `mock` (dev/tests —
   * must be set EXPLICITLY: its checkout grants pro instantly with no payment),
   * or `none` (default: accounts without a paywall). Never a driver in
   * self-host mode.
   */
  billing: 'none' | 'mock' | 'stripe';
  stripeSecretKey: string | null;
  stripePriceId: string | null;
  /** Optional second (annual) Stripe price; when set, ACCOUNT offers a yearly plan. */
  stripePriceIdAnnual: string | null;
  stripeWebhookSecret: string | null;
  /** Public base URL of the deployment (billing redirects); defaults to webOrigin. */
  publicUrl: string;
  /** Monthly price in whole currency units — used for the admin MRR readout only. */
  priceMonthly: number;
  dataDir: string;
  /** Persistence backend: a single JSON file (default) or local SQLite. */
  persistence: 'file' | 'sqlite';
  /** SQLite database path (used only when persistence === 'sqlite'). */
  sqlitePath: string;
  providers: string[];
  /** Operator-installed provider plugin module specifiers (TYCHE_PLUGINS). */
  plugins: string[];
  secEdgarUserAgent: string | null;
  fredApiKey: string | null;
  /** Directory of a built web app to serve same-origin (single-process self-host). */
  serveWeb: string | null;
  /** Audit sink: stdout (default) or a durable JSON-lines file. */
  auditSink: 'console' | 'file';
  /** Path for the file audit sink (used only when auditSink === 'file'). */
  auditFile: string;
  /**
   * Transactional-email sink (hosted mode): `console` (default — logs the
   * message, keyless, so password reset is exercisable with no provider) or
   * `http` (POST each message to your provider's HTTP API or a relay). Tyche
   * bundles no email provider; bring your own.
   */
  emailSink: 'console' | 'http';
  /** URL the http email sink POSTs `{ to, subject, text }` to (BYO provider/relay). */
  emailWebhookUrl: string | null;
  /** Optional bearer token for the email webhook. */
  emailWebhookToken: string | null;
  /** Optional From address included in the webhook payload. */
  emailFrom: string | null;
  authEnabled: boolean;
  authToken: string | null;
  ai: {
    provider: string;
    apiKey: string | null;
    model: string | null;
  };
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function list(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const dataDir = env.TYCHE_DATA_DIR ?? './data';
  return {
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.API_PORT ?? 4010),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    mode: env.TYCHE_MODE === 'hosted' ? 'hosted' : 'selfhost',
    demo: bool(env.TYCHE_DEMO, false),
    sessionSecret: env.TYCHE_SESSION_SECRET ?? null,
    // At least one hop: a hosted deployment always sits behind the TLS proxy, so
    // a value < 1 (or non-numeric) falls back to trusting exactly the proxy.
    trustProxyHops: Math.max(1, Math.floor(Number(env.TYCHE_TRUST_PROXY_HOPS)) || 1),
    signups: env.TYCHE_SIGNUPS === 'closed' ? 'closed' : 'open',
    adminEmail: env.TYCHE_ADMIN_EMAIL ?? null,
    seatLimit: Number.isInteger(Number(env.TYCHE_SEATS)) && Number(env.TYCHE_SEATS) > 0 ? Number(env.TYCHE_SEATS) : null,
    // Fail closed: an unset TYCHE_BILLING means NO paywall rather than the
    // mock driver, whose checkout grants pro for free — a hosted deployment
    // must opt into mock billing explicitly (dev/demo only).
    billing: env.TYCHE_BILLING === 'stripe' ? 'stripe' : env.TYCHE_BILLING === 'mock' ? 'mock' : 'none',
    stripeSecretKey: env.STRIPE_SECRET_KEY ?? null,
    stripePriceId: env.STRIPE_PRICE_ID ?? null,
    stripePriceIdAnnual: env.STRIPE_PRICE_ID_ANNUAL ?? null,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? null,
    publicUrl: env.TYCHE_PUBLIC_URL ?? env.WEB_ORIGIN ?? 'http://localhost:5173',
    priceMonthly: Number.isFinite(Number(env.TYCHE_PRICE_MONTHLY)) ? Number(env.TYCHE_PRICE_MONTHLY) : 29,
    dataDir,
    persistence: env.TYCHE_PERSISTENCE === 'sqlite' ? 'sqlite' : 'file',
    sqlitePath: env.TYCHE_SQLITE_PATH ?? join(dataDir, 'tyche.db'),
    providers: list(env.TYCHE_PROVIDERS, ['mock']),
    plugins: list(env.TYCHE_PLUGINS, []),
    secEdgarUserAgent: env.SEC_EDGAR_USER_AGENT ?? null,
    fredApiKey: env.FRED_API_KEY ?? null,
    serveWeb: env.TYCHE_SERVE_WEB ?? null,
    auditSink: env.TYCHE_AUDIT_SINK === 'file' ? 'file' : 'console',
    auditFile: env.TYCHE_AUDIT_FILE ?? join(dataDir, 'audit.log'),
    emailSink: env.TYCHE_EMAIL_SINK === 'http' ? 'http' : 'console',
    emailWebhookUrl: env.TYCHE_EMAIL_WEBHOOK_URL ?? null,
    emailWebhookToken: env.TYCHE_EMAIL_WEBHOOK_TOKEN ?? null,
    emailFrom: env.TYCHE_EMAIL_FROM ?? null,
    authEnabled: bool(env.TYCHE_AUTH_ENABLED, false),
    authToken: env.TYCHE_AUTH_TOKEN ?? null,
    ai: {
      provider: env.AI_PROVIDER ?? 'mock',
      apiKey: env.AI_API_KEY ?? null,
      model: env.AI_MODEL ?? null,
    },
  };
}
