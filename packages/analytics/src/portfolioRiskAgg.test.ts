import { describe, it, expect } from 'vitest';
import type { Candle } from '@tyche/contracts';
import { computePortfolioRisk } from './portfolioRiskAgg';

/** Build daily candles from a list of closes starting at a fixed date. */
function series(closes: number[], startDay = 1): Candle[] {
  return closes.map((c, i) => ({
    t: `2026-01-${String(startDay + i).padStart(2, '0')}T00:00:00.000Z`,
    o: c,
    h: c,
    l: c,
    c,
    v: 1000,
  }));
}

describe('computePortfolioRisk', () => {
  it('produces finite stats and per-holding beta/weight over aligned candles', () => {
    const a = series([100, 102, 101, 104, 103, 106]);
    const b = series([50, 49, 51, 50, 52, 51]);
    const bench = series([200, 202, 201, 205, 204, 208]);
    const res = computePortfolioRisk(
      [
        { symbol: 'AAA', quantity: 10, candles: a },
        { symbol: 'BBB', quantity: 20, candles: b },
      ],
      bench,
      { periodsPerYear: 252 },
    );
    expect(res.observations).toBe(5); // 6 aligned closes → 5 returns
    expect(res.coverage).toEqual({ priced: 2, total: 2 });
    // Weights are gross-normalized signed and sum in magnitude to 1.
    const grossW = res.holdings.reduce((s, h) => s + Math.abs(h.weight), 0);
    expect(grossW).toBeCloseTo(1, 10);
    for (const h of res.holdings) expect(typeof h.beta).toBe('number');
    for (const v of Object.values(res.stats)) {
      if (v !== null) expect(Number.isFinite(v)).toBe(true);
    }
    expect(res.stats.beta).not.toBeNull();
    expect(res.stats.trackingError).not.toBeNull();
  });

  it('aligns on the dates common to every holding and the benchmark', () => {
    // BBB starts a day later, so only the overlapping 5 dates are used.
    const a = series([100, 101, 102, 103, 104, 105], 1);
    const b = series([50, 51, 52, 53, 54], 2);
    const bench = series([10, 11, 12, 13, 14, 15], 1);
    const res = computePortfolioRisk(
      [
        { symbol: 'AAA', quantity: 1, candles: a },
        { symbol: 'BBB', quantity: 1, candles: b },
      ],
      bench,
    );
    // Common dates = Jan 2..5 (BBB has 2..6? b starts day2 len5 → 2..6; a is 1..6; bench 1..6)
    // intersection = 2..6 = 5 dates → 4 observations.
    expect(res.observations).toBe(4);
    expect(res.coverage.priced).toBe(2);
  });

  it('excludes holdings without usable history and reports coverage', () => {
    const a = series([100, 101, 102, 103]);
    const res = computePortfolioRisk(
      [
        { symbol: 'AAA', quantity: 1, candles: a },
        { symbol: 'NOHIST', quantity: 1, candles: [] },
      ],
      null,
    );
    expect(res.coverage).toEqual({ priced: 1, total: 2 });
    expect(res.holdings.map((h) => h.symbol)).toEqual(['AAA']);
    // No benchmark → beta/tracking fields are null but return/vol are finite.
    expect(res.stats.beta).toBeNull();
    expect(Number.isFinite(res.stats.annualizedVolatility)).toBe(true);
  });

  it('is safe when nothing has enough history — skill ratios stay null, not zero', () => {
    const res = computePortfolioRisk([{ symbol: 'X', quantity: 1, candles: [] }], null);
    expect(res.observations).toBe(0);
    expect(res.coverage).toEqual({ priced: 0, total: 1 });
    // Undefined skill / sensitivity ratios must never serialize as a valid-looking 0.
    expect(res.stats.sharpe).toBeNull();
    expect(res.stats.sortino).toBeNull();
    expect(res.stats.calmar).toBeNull();
    expect(res.stats.beta).toBeNull();
    expect(res.stats.informationRatio).toBeNull();
    expect(res.stats.trackingError).toBeNull();
    for (const k of ['sharpe', 'sortino', 'calmar', 'beta', 'informationRatio'] as const) {
      expect(res.stats[k]).not.toBe(0);
    }
  });
});
