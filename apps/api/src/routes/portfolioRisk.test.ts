import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortfolioRiskSchema } from '@tyche/contracts';
import { buildApp } from '../app';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'tyche-risk-'));
}

/** Skill ratios that must stay null when undefined — never a fabricated 0. */
const SKILL_RATIO_KEYS = ['sharpe', 'sortino', 'calmar', 'informationRatio', 'beta'] as const;

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

      // Path-defined aggregates stay finite on a priced mock portfolio.
      for (const k of ['annualizedReturn', 'annualizedVolatility', 'maxDrawdown', 'valueAtRisk']) {
        expect(Number.isFinite(data.stats[k] as number)).toBe(true);
      }
      // Skill ratios may be finite or null, but never NaN/Infinity and never silently non-numeric.
      for (const k of ['sharpe', 'sortino', 'calmar', 'informationRatio', 'beta', 'trackingError']) {
        const v = data.stats[k];
        expect(v === null || Number.isFinite(v as number)).toBe(true);
      }
      // A benchmark was supplied and priced → beta/tracking are real numbers on mock history.
      expect(typeof data.stats.beta).toBe('number');
      expect(typeof data.stats.trackingError).toBe('number');
      // Gross-normalized weights sum in magnitude to ~1.
      const gross = data.holdings.reduce((s, h) => s + Math.abs(h.weight), 0);
      expect(gross).toBeCloseTo(1, 6);
      expect(body.provenance).toBeTruthy();
      // Response validates the contract schema (nullable skill ratios allowed).
      expect(PortfolioRiskSchema.safeParse(data).success).toBe(true);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps skill ratios null (not zero) when the portfolio has no priced history', async () => {
    const dir = tempDir();
    const app = await buildApp({ config: { dataDir: dir, providers: ['mock'] } });
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/portfolios',
        payload: { name: 'Empty', positions: [] },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().data.id as string;

      const res = await app.inject({ method: 'GET', url: `/api/portfolios/${id}/risk?benchmark=SPY` });
      expect(res.statusCode).toBe(200);
      const data = res.json().data as {
        observations: number;
        coverage: { priced: number; total: number };
        stats: Record<string, number | null>;
      };
      expect(data.observations).toBe(0);
      expect(data.coverage).toEqual({ priced: 0, total: 0 });
      for (const k of SKILL_RATIO_KEYS) {
        expect(data.stats[k], k).toBeNull();
        // Explicit: null must not have been coerced to a valid-looking zero.
        expect(data.stats[k]).not.toBe(0);
      }
      expect(PortfolioRiskSchema.safeParse(data).success).toBe(true);
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

import { sanitizePortfolioRiskStats } from './portfolioRiskSanitize';

describe('sanitizePortfolioRiskStats (shipped API helper)', () => {
  it('maps NaN/Infinity path stats to null rather than zero', () => {
    const out = sanitizePortfolioRiskStats({
      annualizedReturn: Number.NaN,
      annualizedVolatility: Number.POSITIVE_INFINITY,
      sharpe: Number.NaN,
      sortino: null,
      calmar: Number.NEGATIVE_INFINITY,
      maxDrawdown: Number.NaN,
      valueAtRisk: Number.NaN,
      beta: null,
      trackingError: Number.NaN,
      informationRatio: null,
    });
    for (const k of [
      'annualizedReturn',
      'annualizedVolatility',
      'sharpe',
      'calmar',
      'maxDrawdown',
      'valueAtRisk',
      'trackingError',
    ] as const) {
      expect(out[k], k).toBeNull();
      expect(out[k], k).not.toBe(0);
    }
  });

  it('preserves legitimate finite zeros (defined empty aggregates)', () => {
    const out = sanitizePortfolioRiskStats({
      annualizedReturn: 0,
      annualizedVolatility: 0,
      sharpe: null,
      sortino: null,
      calmar: null,
      maxDrawdown: 0,
      valueAtRisk: 0,
      beta: null,
      trackingError: null,
      informationRatio: null,
    });
    expect(out.annualizedReturn).toBe(0);
    expect(out.maxDrawdown).toBe(0);
    expect(out.valueAtRisk).toBe(0);
    expect(out.sharpe).toBeNull();
  });
});
