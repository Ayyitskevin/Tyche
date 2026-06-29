import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

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
  it('GET /api/health reports mock mode and capabilities', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('mock');
    expect(body.capabilities.quotes).toBe(true);
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
