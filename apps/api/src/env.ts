import { join } from 'node:path';

export interface ApiConfig {
  host: string;
  port: number;
  webOrigin: string;
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
    dataDir,
    persistence: env.TYCHE_PERSISTENCE === 'sqlite' ? 'sqlite' : 'file',
    sqlitePath: env.TYCHE_SQLITE_PATH ?? join(dataDir, 'tyche.db'),
    providers: list(env.TYCHE_PROVIDERS, ['mock']),
    plugins: list(env.TYCHE_PLUGINS, []),
    secEdgarUserAgent: env.SEC_EDGAR_USER_AGENT ?? null,
    fredApiKey: env.FRED_API_KEY ?? null,
    authEnabled: bool(env.TYCHE_AUTH_ENABLED, false),
    authToken: env.TYCHE_AUTH_TOKEN ?? null,
    ai: {
      provider: env.AI_PROVIDER ?? 'mock',
      apiKey: env.AI_API_KEY ?? null,
      model: env.AI_MODEL ?? null,
    },
  };
}
