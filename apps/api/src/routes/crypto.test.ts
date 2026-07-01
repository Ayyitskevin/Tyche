import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

let app: FastifyInstance;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tyche-crypto-'));
  app = await buildApp({ config: { dataDir } });
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('order book route', () => {
  it('serves a mock book for any symbol with bids, asks, and depth control', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/book/BTC-USD?depth=5' });
    expect(res.statusCode).toBe(200);
    const { data, provenance } = res.json();
    expect(data.symbol).toBe('BTC-USD');
    expect(data.bids).toHaveLength(5);
    expect(data.asks).toHaveLength(5);
    expect(data.bids[0].price).toBeGreaterThan(0);
    expect(provenance.capability).toBe('orderBook');
  });
});

describe('funding route', () => {
  it('serves the default board and a filtered symbol set', async () => {
    const board = await app.inject({ method: 'GET', url: '/api/funding' });
    expect(board.statusCode).toBe(200);
    const symbols = (board.json().data as Array<{ symbol: string }>).map((r) => r.symbol).sort();
    expect(symbols).toEqual(['BTC-USD', 'ETH-USD']);

    const filtered = await app.inject({ method: 'GET', url: '/api/funding?symbols=ETH-USD' });
    expect(filtered.json().data).toHaveLength(1);
    expect(filtered.json().data[0].symbol).toBe('ETH-USD');
    expect(filtered.json().data[0].intervalHours).toBe(8);
  });
});

describe('aggregated search', () => {
  it('still returns mock results with a single provider registered', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=AAP' });
    expect(res.statusCode).toBe(200);
    const hits = res.json().data as Array<{ identifier: { symbol: string } }>;
    expect(hits.map((h) => h.identifier.symbol)).toContain('AAPL');
  });
});
