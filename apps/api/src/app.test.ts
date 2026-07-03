import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { NO_CAPABILITIES, ProviderDescriptorSchema, QuoteSchema } from '@tyche/contracts';
import { StubProvider } from '@tyche/data-adapters';
import { buildApp } from './app';
import { FilePersistence } from './persistence/FilePersistence';
import type { UserPreferences } from '@tyche/contracts';
import type { ProviderPlugin } from './plugins/PluginHost';

function quotePlugin(name: string, broken = false): ProviderPlugin {
  const ts = '2026-06-29T00:00:00.000Z';
  class P extends StubProvider {
    readonly descriptor = ProviderDescriptorSchema.parse({
      name,
      mode: 'user_supplied',
      capabilities: { ...NO_CAPABILITIES, quotes: true },
    });
    override getQuote(symbol?: string) {
      if (broken) return Promise.resolve({ data: { bad: true }, provenance: null } as never);
      return Promise.resolve({
        data: QuoteSchema.parse({ symbol: symbol ?? 'X', price: 10, timestamp: ts }),
        provenance: { provider: name, providerMode: 'user_supplied' as const, capability: 'quotes', retrievedAt: ts, freshness: { asOf: ts, tier: 'live' as const } },
      });
    }
  }
  return {
    manifest: { id: name, name, version: '1.0.0', kind: 'provider', apiVersion: 1, capabilities: ['quotes'], commandIds: [] },
    createProvider: () => new P(),
  };
}

let app: FastifyInstance;
const dataDir = join(tmpdir(), `tyche-test-${randomUUID()}`);

beforeAll(async () => {
  app = await buildApp({ config: { dataDir, providers: ['mock'] } });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('health & providers', () => {
  it('GET /api/health reports mock mode, capabilities, version and uptime', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('mock');
    expect(body.capabilities.quotes).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptimeSec).toBe('number');
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/ready returns ready when persistence is reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ready');
  });

  it('GET /api/ready returns 503 when the persistence probe fails', async () => {
    // A store that boots fine but whose backend "goes away" at runtime.
    class FlakyStore extends FilePersistence {
      down = false;
      override getPreferences(): Promise<UserPreferences> {
        return this.down ? Promise.reject(new Error('persistence down')) : super.getPreferences();
      }
    }
    const store = new FlakyStore(join(tmpdir(), `tyche-ready-${randomUUID()}`));
    const flakyApp = await buildApp({ config: { dataDir, providers: ['mock'] }, persistence: store });
    expect((await flakyApp.inject({ method: 'GET', url: '/api/ready' })).statusCode).toBe(200);
    store.down = true;
    const res = await flakyApp.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('unavailable');
    await flakyApp.close();
  });

  it('returns a generic 500 for an unhandled error and logs it structured', async () => {
    const errApp = await buildApp({ config: { dataDir, providers: ['mock'] } });
    errApp.get('/__boom', async () => {
      throw new Error('kaboom-secret-internal');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await errApp.inject({ method: 'GET', url: '/__boom' });
    expect(res.statusCode).toBe(500);
    // Body is generic — never leaks the internal message.
    expect(res.json()).toEqual({ error: { kind: 'internal', message: 'Internal server error.' } });
    expect(JSON.stringify(res.json())).not.toContain('kaboom-secret-internal');
    // But it IS logged as one structured line for the operator.
    const logged = spy.mock.calls.map((c) => String(c[0])).find((line) => line.includes('/__boom'));
    expect(logged).toBeTruthy();
    expect(JSON.parse(logged!)).toMatchObject({ level: 'error', status: 500, url: '/__boom' });
    spy.mockRestore();
    await errApp.close();
  });
});

describe('persistence backend selection', () => {
  it('boots on the SQLite backend and serves user routes', async () => {
    const sqliteApp = await buildApp({
      config: { dataDir: join(tmpdir(), `tyche-sql-${randomUUID()}`), persistence: 'sqlite', sqlitePath: join(tmpdir(), `tyche-${randomUUID()}.db`), providers: ['mock'] },
    });
    await sqliteApp.ready();
    try {
      // Seeded default watchlist is served through the unchanged routes.
      const list = await sqliteApp.inject({ method: 'GET', url: '/api/watchlists' });
      expect(list.statusCode).toBe(200);
      expect(list.json().data.length).toBeGreaterThan(0);
      // A round-trip write persists.
      const created = await sqliteApp.inject({ method: 'POST', url: '/api/watchlists', payload: { name: 'SQL', symbols: ['NVDA'] } });
      expect(created.statusCode).toBe(200);
      expect(created.json().data.id).toMatch(/^wl_/);
    } finally {
      await sqliteApp.close();
    }
  });

  it('falls back to the file store when SQLite cannot initialize', async () => {
    // Point the SQLite path at a directory so opening it as a db file throws;
    // the app must fall back to FilePersistence and still boot + serve.
    const dataDir = mkdtempSync(join(tmpdir(), 'tyche-fallback-'));
    const fallbackApp = await buildApp({
      config: { dataDir, persistence: 'sqlite', sqlitePath: dataDir, providers: ['mock'] },
    });
    await fallbackApp.ready();
    try {
      const list = await fallbackApp.inject({ method: 'GET', url: '/api/watchlists' });
      expect(list.statusCode).toBe(200);
      expect(list.json().data.length).toBeGreaterThan(0);
    } finally {
      await fallbackApp.close();
    }
  });
});

describe('plugin host wiring', () => {
  it('activates a conformant provider plugin and quarantines a broken one', async () => {
    const pluginApp = await buildApp({
      config: { providers: ['mock'] },
      plugins: [quotePlugin('good-plugin'), quotePlugin('bad-plugin', true)],
    });
    await pluginApp.ready();
    try {
      const plugins = (await pluginApp.inject({ method: 'GET', url: '/api/plugins' })).json();
      expect(plugins.provenance.capability).toBe('plugins');
      const byId = Object.fromEntries(plugins.data.map((p: { manifest: { id: string }; status: string }) => [p.manifest.id, p.status]));
      expect(byId['good-plugin']).toBe('active');
      expect(byId['bad-plugin']).toBe('quarantined');

      // The active plugin's provider is now first-class; the quarantined one never registered.
      const providerNames = (await pluginApp.inject({ method: 'GET', url: '/api/providers' }))
        .json()
        .data.map((d: { name: string }) => d.name);
      expect(providerNames).toContain('good-plugin');
      expect(providerNames).not.toContain('bad-plugin');
    } finally {
      await pluginApp.close();
    }
  });

  it('honors preferences.disabledPlugins at boot (disabled, not registered)', async () => {
    const store = new FilePersistence(join(tmpdir(), `tyche-disabled-${randomUUID()}`));
    await store.init();
    const prefs = await store.getPreferences();
    await store.savePreferences({ ...prefs, disabledPlugins: ['good-plugin'] });

    const app2 = await buildApp({ persistence: store, plugins: [quotePlugin('good-plugin')] });
    await app2.ready();
    try {
      const plugins = (await app2.inject({ method: 'GET', url: '/api/plugins' })).json().data;
      expect(plugins.find((p: { manifest: { id: string }; status: string }) => p.manifest.id === 'good-plugin')?.status).toBe('disabled');
      const providerNames = (await app2.inject({ method: 'GET', url: '/api/providers' })).json().data.map((d: { name: string }) => d.name);
      expect(providerNames).not.toContain('good-plugin'); // disabled → never registered
    } finally {
      await app2.close();
    }
  });
});

describe('providers route', () => {
  it('GET /api/providers returns descriptors plus an additive aggregate union', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/providers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].name).toBe('mock');
    // Aggregate (union coverage) is additive and reflects mock's matrix.
    expect(body.aggregate.quotes).toBe(true);
    expect(body.aggregate.bonds).toBe(false);
  });

  it('GET /api/audit returns recent events including a just-recorded mutation', async () => {
    await app.inject({ method: 'POST', url: '/api/watchlists', payload: { name: 'Audit', symbols: ['AAPL'] } });
    const res = await app.inject({ method: 'GET', url: '/api/audit?limit=20' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((e: { action: string }) => e.action === 'watchlist.save')).toBe(true);
    expect(body.provenance.capability).toBe('audit');
  });
});

describe('market routes', () => {
  it('GET /api/quote/:symbol returns data + provenance', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/quote/AAPL' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.symbol).toBe('AAPL');
    expect(body.provenance.provider).toBe('mock');
    expect(body.provenance.freshness.asOf).toBeDefined();
  });

  it('GET /api/quotes returns a batch', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/quotes?symbols=AAPL,MSFT,NVDA' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
  });

  it('GET /api/history validates range and returns candles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/history/AAPL?range=1mo&interval=1d' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.candles.length).toBeGreaterThan(0);
  });

  it('rejects an invalid range', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/history/AAPL?range=banana' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/intraday returns intraday candles (delayed tier)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/intraday/AAPL?interval=5m&range=1d' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.candles.length).toBeGreaterThan(0);
    expect(body.data.interval).toBe('5m');
    expect(body.provenance.capability).toBe('intradayPrices');
  });

  it('rejects an invalid intraday interval', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/intraday/AAPL?interval=banana' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a daily interval on the intraday route (would mislabel provenance)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/intraday/AAPL?interval=1d' });
    expect(res.statusCode).toBe(400);
  });

  it('serves a built web app same-origin with an SPA fallback when TYCHE_SERVE_WEB is set', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'tyche-web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Tyche</title>');
    const webApp = await buildApp({
      config: { dataDir: mkdtempSync(join(tmpdir(), 'tyche-data-')), serveWeb: dir },
    });
    try {
      const root = await webApp.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain('<title>Tyche</title>');
      // SPA fallback for a client-side route; API routes keep priority.
      const deep = await webApp.inject({ method: 'GET', url: '/some/client/route' });
      expect(deep.statusCode).toBe(200);
      expect(deep.body).toContain('<title>Tyche</title>');
      const api = await webApp.inject({ method: 'GET', url: '/api/health' });
      expect(api.statusCode).toBe(200);
      expect(api.json().status).toBe('ok');
      const missingApi = await webApp.inject({ method: 'GET', url: '/api/nope' });
      expect(missingApi.statusCode).toBe(404);
    } finally {
      await webApp.close();
    }
  });

  it('GET /api/events returns a corporate-events calendar with provenance', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events?symbol=AAPL&days=90' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((e: { symbol: string }) => e.symbol === 'AAPL')).toBe(true);
    expect(body.provenance.capability).toBe('events');
  });

  it('rejects an invalid events window', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events?days=banana' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/economics/:seriesId returns a mock series with provenance', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/economics/GDP' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.seriesId).toBe('GDP');
    expect(body.data.observations.length).toBeGreaterThan(0);
    expect(body.provenance.capability).toBe('economicSeries');
  });

  it('GET /api/search finds a seeded instrument', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=apple' });
    expect(res.statusCode).toBe(200);
    const symbols = res.json().data.map((r: { identifier: { symbol: string } }) => r.identifier.symbol);
    expect(symbols).toContain('AAPL');
  });
});

describe('research routes', () => {
  it('GET /api/news returns items', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/news?symbol=AAPL' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('GET /api/news honors source and keyword filters with provenance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/news?source=Tyche%20Wire&keyword=guidance&limit=20',
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data as Array<{ source: string }>;
    expect(items.every((i) => i.source === 'Tyche Wire')).toBe(true);
    expect(res.json().provenance.provider).toBeDefined();
  });

  it('GET /api/news scopes to a watchlist', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/watchlists',
        payload: { name: 'News Scope', symbols: ['AAPL', 'MSFT'] },
      })
    ).json().data;
    const res = await app.inject({ method: 'GET', url: `/api/news?watchlistId=${created.id}` });
    expect(res.statusCode).toBe(200);
    const feedSymbols = new Set((res.json().data as Array<{ symbols: string[] }>).flatMap((i) => i.symbols));
    expect(feedSymbols.size).toBeGreaterThan(0);
    for (const s of feedSymbols) expect(['AAPL', 'MSFT']).toContain(s);
  });

  it('GET /api/news rejects an invalid since datetime', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/news?since=June' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/financials returns statements for an equity', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/financials/AAPL' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
  });

  it('GET /api/filings returns an array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/filings/AAPL' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('GET /api/estimates returns metrics with provenance', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/estimates/AAPL' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
    expect(res.json().provenance.capability).toBe('estimates');
  });

  it('GET /api/ratings returns rows with provenance', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ratings/AAPL' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
    expect(res.json().provenance.capability).toBe('analystRatings');
  });

  it('GET /api/ownership returns holders with provenance', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ownership/AAPL' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
    expect(res.json().provenance.capability).toBe('ownership');
  });

  it('POST /api/screen filters and sorts the universe with provenance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/screen',
      payload: { filters: [{ field: 'changePercent', op: 'gt', value: 0 }], sort: { field: 'marketCap', dir: 'desc' }, limit: 100 },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as Array<{ changePercent: number; marketCap: number }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.changePercent > 0)).toBe(true); // filter honored
    // Sorted by market cap, descending.
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.marketCap).toBeGreaterThanOrEqual(rows[i]!.marketCap);
    expect(res.json().provenance.capability).toBe('screener');
  });

  it('POST /api/screen with no filters returns the universe (capped by limit)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/screen', payload: { filters: [], limit: 3 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
  });

  it('POST /api/screen rejects an invalid query', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/screen', payload: { filters: [{ field: 'nope', op: 'gt', value: 1 }] } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/screen rejects a numeric field with a string value', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/screen', payload: { filters: [{ field: 'price', op: 'gt', value: '50' }] } });
    expect(res.statusCode).toBe(400); // type mismatch — must be numeric
  });
});

describe('user routes + persistence', () => {
  it('seeds a default watchlist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/watchlists' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
  });

  it('creates, updates, and deletes a named watchlist', async () => {
    const before = (await app.inject({ method: 'GET', url: '/api/watchlists' })).json().data.length;

    // Create (no id → server mints one), with explicit order.
    const create = await app.inject({
      method: 'POST',
      url: '/api/watchlists',
      payload: { name: 'Energy', symbols: ['XOM'], order: 1 },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.id).toMatch(/^wl_/);
    expect(created.order).toBe(1);
    expect(create.json().provenance.provider).toBeDefined();

    // Update by id (rename + reorder), id preserved.
    const update = await app.inject({
      method: 'POST',
      url: '/api/watchlists',
      payload: { ...created, name: 'Energy & Power', order: 0 },
    });
    expect(update.json().data.id).toBe(created.id);
    expect(update.json().data.name).toBe('Energy & Power');
    expect(update.json().data.order).toBe(0);

    // Delete by id.
    const del = await app.inject({ method: 'DELETE', url: `/api/watchlists/${created.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.removed).toBe(true);

    const after = (await app.inject({ method: 'GET', url: '/api/watchlists' })).json().data;
    expect(after.length).toBe(before);
    expect(after.map((w: { id: string }) => w.id)).not.toContain(created.id);
  });

  it('round-trips a workspace through persistence', async () => {
    const workspace = {
      id: 'ws_test',
      name: 'Test workspace',
      panels: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const post = await app.inject({ method: 'POST', url: '/api/workspaces', payload: workspace });
    expect(post.statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/api/workspaces' });
    const ids = list.json().data.map((w: { id: string }) => w.id);
    expect(ids).toContain('ws_test');
  });

  it('creates, lists, and deletes alert rules', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/alerts',
      payload: { symbol: 'AAPL', field: 'price', operator: 'gt', threshold: 200 },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.id).toMatch(/^alert_/);
    expect(created.active).toBe(true);
    expect(created.lastTriggeredAt).toBeNull();
    expect(create.json().provenance.provider).toBeDefined();

    const list = await app.inject({ method: 'GET', url: '/api/alerts' });
    expect(list.json().data.map((a: { id: string }) => a.id)).toContain(created.id);

    const del = await app.inject({ method: 'DELETE', url: `/api/alerts/${created.id}` });
    expect(del.json().data.removed).toBe(true);
  });

  it('rejects an invalid alert rule', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/alerts',
      payload: { symbol: 'AAPL', operator: 'nonsense', threshold: 'high' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('normalizes a lowercase alert symbol to uppercase', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/alerts',
      payload: { symbol: 'aapl', operator: 'gt', threshold: 200 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.symbol).toBe('AAPL');
  });

  it('rejects a blank alert symbol', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/alerts',
      payload: { symbol: '   ', operator: 'gt', threshold: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an alert stream with no symbols', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stream/alerts' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a trade stream with no symbol', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stream/trades' });
    expect(res.statusCode).toBe(400);
  });

  it('creates, lists, and deletes a saved screen', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/screens',
      payload: { name: 'Big caps', query: { filters: [{ field: 'marketCap', op: 'gt', value: 1000 }], sort: { field: 'marketCap', dir: 'desc' } } },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.id).toMatch(/^screen_/);
    expect(created.query.filters[0]).toEqual({ field: 'marketCap', op: 'gt', value: 1000 });
    expect(create.json().provenance.capability).toBe('savedScreens');

    const list = await app.inject({ method: 'GET', url: '/api/screens' });
    expect(list.json().data.map((s: { id: string }) => s.id)).toContain(created.id);

    const del = await app.inject({ method: 'DELETE', url: `/api/screens/${created.id}` });
    expect(del.json().data.removed).toBe(true);
  });

  it('rejects an invalid saved screen (bad query)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/screens',
      payload: { name: 'Bad', query: { filters: [{ field: 'price', op: 'gt', value: 'fifty' }] } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('saves and reads preferences', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/preferences',
      payload: { theme: 'midnight', density: 'dense' },
    });
    expect(post.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: '/api/preferences' });
    expect(get.json().data.theme).toBe('midnight');
  });
});

describe('portfolio routes', () => {
  it('creates a portfolio (server mints id) and never persists computed marks', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: {
        name: 'Core',
        cash: 1000,
        positions: [
          // Caller sends stale marks; the server must strip every one of them.
          {
            symbol: 'AAPL',
            quantity: 10,
            averageCost: 100,
            marketPrice: 999,
            marketValue: 9990,
            unrealizedPnl: 12345,
            realizedPnl: 678,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const pf = res.json().data;
    expect(pf.id).toMatch(/^pf_/);
    expect(pf.cash).toBe(1000);
    expect(pf.positions[0].symbol).toBe('AAPL');
    expect(pf.positions[0].quantity).toBe(10);
    expect(pf.positions[0].averageCost).toBe(100);
    // Marks are recomputed client-side; NONE of them may round-trip through persistence.
    expect(pf.positions[0].marketPrice).toBeUndefined();
    expect(pf.positions[0].marketValue).toBeUndefined();
    expect(pf.positions[0].unrealizedPnl).toBeUndefined();
    expect(pf.positions[0].realizedPnl).toBeUndefined();
    expect(res.json().provenance.capability).toBe('portfolios');
  });

  it('updates a portfolio by id and lists it', async () => {
    const created = (
      await app.inject({ method: 'POST', url: '/api/portfolios', payload: { name: 'Temp', positions: [] } })
    ).json().data;
    const updated = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { ...created, name: 'Renamed' },
    });
    expect(updated.json().data.id).toBe(created.id);
    expect(updated.json().data.name).toBe('Renamed');

    const list = await app.inject({ method: 'GET', url: '/api/portfolios' });
    expect(list.json().data.map((p: { id: string }) => p.id)).toContain(created.id);
  });

  it('rejects an invalid portfolio (non-array positions)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Bad', positions: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deletes a portfolio by id', async () => {
    const created = (
      await app.inject({ method: 'POST', url: '/api/portfolios', payload: { name: 'Doomed', positions: [] } })
    ).json().data;
    const del = await app.inject({ method: 'DELETE', url: `/api/portfolios/${created.id}` });
    expect(del.json().data.removed).toBe(true);
  });

  it('404s an unknown portfolio', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/portfolios/pf_missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('notes routes', () => {
  it('creates a note with defaulted tags/pinned and a local provenance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'Thesis', body: '**long** AAPL', symbol: 'AAPL', tags: ['earnings'] },
    });
    expect(res.statusCode).toBe(200);
    const note = res.json().data;
    expect(note.id).toMatch(/^note_/);
    expect(note.tags).toEqual(['earnings']);
    expect(note.pinned).toBe(false);
    expect(res.json().provenance.capability).toBe('notes');
  });

  it('rejects a note with a non-array tags field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'Bad', body: 'x', tags: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('exports notes in a versioned envelope', async () => {
    await app.inject({ method: 'POST', url: '/api/notes', payload: { title: 'Export me', body: 'b' } });
    const res = await app.inject({ method: 'GET', url: '/api/notes/export' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.version).toBe(1);
    expect(data.exportedAt).toBeDefined();
    expect(Array.isArray(data.notes)).toBe(true);
    expect(data.notes.length).toBeGreaterThan(0);
    expect(res.json().provenance.capability).toBe('notes');
  });

  it('imports an export idempotently (re-import does not duplicate by id)', async () => {
    const exported = (await app.inject({ method: 'GET', url: '/api/notes/export' })).json().data;
    const before = (await app.inject({ method: 'GET', url: '/api/notes' })).json().data.length;

    const imp = await app.inject({ method: 'POST', url: '/api/notes/import', payload: exported });
    expect(imp.statusCode).toBe(200);
    expect(imp.json().data.imported).toBe(exported.notes.length);

    const after = (await app.inject({ method: 'GET', url: '/api/notes' })).json().data.length;
    expect(after).toBe(before); // same ids → upsert, not append
  });

  it('rejects a malformed import envelope', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/notes/import', payload: { notes: 'oops' } });
    expect(res.statusCode).toBe(400);
  });

  it('deletes a note by id', async () => {
    const created = (
      await app.inject({ method: 'POST', url: '/api/notes', payload: { title: 'Temp', body: 'x' } })
    ).json().data;
    const del = await app.inject({ method: 'DELETE', url: `/api/notes/${created.id}` });
    expect(del.json().data.removed).toBe(true);
  });
});

describe('AI route', () => {
  it('returns a grounded, no-advice mock response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Summarize whats on screen' }],
        context: { activeSymbol: 'AAPL', provenance: [] },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('mock');
    expect(body.disclaimer).toMatch(/not personalized investment advice/i);
  });

  it('declines personalized advice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'Should I buy AAPL?' }],
        context: { activeSymbol: 'AAPL', provenance: [] },
      },
    });
    expect(res.json().message.content).toMatch(/can't provide personalized/i);
  });

  it('grounds and cites when a v2 context carries panel provenance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: {
        messages: [{ role: 'user', content: 'summarize what is on screen' }],
        context: {
          activeSymbol: 'AAPL',
          openPanels: [
            {
              moduleId: 'description',
              symbol: 'AAPL',
              title: 'AAPL · DES',
              summary: 'AAPL 187.40 (+1.2%)',
            },
          ],
          provenance: [
            {
              provider: 'mock',
              providerMode: 'mock',
              capability: 'quotes',
              retrievedAt: '2026-06-28T13:45:00.000Z',
              freshness: { asOf: '2026-06-28T13:45:00.000Z', tier: 'mock' },
            },
          ],
          notes: [{ id: 'n1', title: 'AAPL thesis', symbol: 'AAPL', excerpt: 'hold' }],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.grounded).toBe(true);
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.message.content).toContain('AAPL 187.40 (+1.2%)');
  });

  it('rejects a malformed AI chat body', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/ai/chat', payload: { messages: [] } });
    expect(res.statusCode).toBe(400);
  });
});

describe('CORS (WEB_ORIGIN governs REST)', () => {
  it('reflects the allowed origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow a disallowed origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.example');
  });
});
