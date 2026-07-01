import { join } from 'node:path';

export interface ApiConfig {
  host: string;
  port: number;
  webOrigin: string;
  /** selfhost (default: single user, no accounts) or hosted (multi-user SaaS). */
  mode: 'selfhost' | 'hosted';
  /** HMAC secret for session tokens; REQUIRED in hosted mode. */
  sessionSecret: string | null;
  /** Whether new account registration is open (hosted mode). */
  signups: 'open' | 'closed';
  /** Email that is granted the admin (founder) flag on registration. */
  adminEmail: string | null;
  /**
   * Billing driver (hosted mode): `stripe` (production), `mock` (dev/tests —
   * must be set EXPLICITLY: its checkout grants pro instantly with no payment),
   * or `none` (default: accounts without a paywall). Never a driver in
   * self-host mode.
   */
  billing: 'none' | 'mock' | 'stripe';
  stripeSecretKey: string | null;
  stripePriceId: string | null;
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
    sessionSecret: env.TYCHE_SESSION_SECRET ?? null,
    signups: env.TYCHE_SIGNUPS === 'closed' ? 'closed' : 'open',
    adminEmail: env.TYCHE_ADMIN_EMAIL ?? null,
    // Fail closed: an unset TYCHE_BILLING means NO paywall rather than the
    // mock driver, whose checkout grants pro for free — a hosted deployment
    // must opt into mock billing explicitly (dev/demo only).
    billing: env.TYCHE_BILLING === 'stripe' ? 'stripe' : env.TYCHE_BILLING === 'mock' ? 'mock' : 'none',
    stripeSecretKey: env.STRIPE_SECRET_KEY ?? null,
    stripePriceId: env.STRIPE_PRICE_ID ?? null,
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
    authEnabled: bool(env.TYCHE_AUTH_ENABLED, false),
    authToken: env.TYCHE_AUTH_TOKEN ?? null,
    ai: {
      provider: env.AI_PROVIDER ?? 'mock',
      apiKey: env.AI_API_KEY ?? null,
      model: env.AI_MODEL ?? null,
    },
  };
}
