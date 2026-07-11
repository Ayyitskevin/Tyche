import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'tyche-risk-'));
}

describe('GET /api/portfolios/:id/risk', () => {
  it('computes risk analytics for a saved portfolio over mock history', async () => {
    const dir = tempDir();
    const app = await buildApp({ config: { dataDir: dir, providers: ['mock'] } });
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/portfolios',
        payload: { name: 'P', positions: [{ symbol: 'AAPL', quantity: 10 }, { symbol: 'MSFT', quantity: 5 }] },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().data.id as string;

      const res = await app.inject({ method: 'GET', url: `/api/portfolios/${id}/risk?benchmark=SPY` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: {
          benchmark: string;
          observations: number;
          coverage: { priced: number; total: number };
          stats: Record<string, number | null>;
          holdings: Array<{ symbol: string; weight: number; beta: number | null }>;
        };
        provenance: unknown;
      };
      const { data } = body;
      expect(data.benchmark).toBe('SPY');
      expect(data.observations).toBeGreaterThan(1);
      expect(data.coverage).toEqual({ priced: 2, total: 2 });
      expect(data.holdings.map((h) => h.symbol).sort()).toEqual(['AAPL', 'MSFT']);

      for (const k of ['annualizedReturn', 'annualizedVolatility', 'sharpe', 'sortino', 'calmar', 'maxDrawdown', 'valueAtRisk']) {
        expect(Number.isFinite(data.stats[k] as number)).toBe(true);
      }
      // A benchmark was supplied and priced → beta/tracking are real numbers.
      expect(typeof data.stats.beta).toBe('number');
      expect(typeof data.stats.trackingError).toBe('number');
      // Gross-normalized weights sum in magnitude to ~1.
      const gross = data.holdings.reduce((s, h) => s + Math.abs(h.weight), 0);
      expect(gross).toBeCloseTo(1, 6);
      expect(body.provenance).toBeTruthy();
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('404s for an unknown portfolio', async () => {
    const dir = tempDir();
    const app = await buildApp({ config: { dataDir: dir, providers: ['mock'] } });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/portfolios/nope/risk' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
