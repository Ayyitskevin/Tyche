import { describe, expect, it } from 'vitest';
import type { FundingRate } from '@tyche/contracts';
import { fundingAnalytics } from './fundingAnalytics';

function fr(partial: Partial<FundingRate> & Pick<FundingRate, 'symbol' | 'rate' | 'annualizedPct'>): FundingRate {
  return {
    venue: 'test',
    intervalHours: 8,
    asOf: '2026-07-19T00:00:00.000Z',
    ...partial,
  };
}

describe('fundingAnalytics', () => {
  // Board: A rich + premium 100bps, B elevated + no mark/index, C negative + discount 100bps.
  const board: FundingRate[] = [
    fr({ symbol: 'AAA', rate: 0.0004, annualizedPct: 43.8, markPrice: 101, indexPrice: 100 }),
    fr({ symbol: 'BBB', rate: 0.0001, annualizedPct: 10.95 }),
    fr({ symbol: 'CCC', rate: -0.0002, annualizedPct: -21.9, markPrice: 99, indexPrice: 100 }),
  ];

  it('sorts by annualized carry descending and labels regimes', () => {
    const a = fundingAnalytics(board);
    expect(a.count).toBe(3);
    expect(a.rows.map((r) => r.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(a.rows.map((r) => r.regime)).toEqual(['rich', 'elevated', 'negative']);
  });

  it('computes daily carry, premium bps, deviation, and percentile', () => {
    const rows = fundingAnalytics(board).rows;
    const [a, b, c] = rows;
    // daily = rate × (24/8) × 100
    expect(a!.dailyPct).toBeCloseTo(0.12, 6);
    expect(b!.dailyPct).toBeCloseTo(0.03, 6);
    expect(c!.dailyPct).toBeCloseTo(-0.06, 6);
    // premium = (mark − index)/index × 10000
    expect(a!.premiumBps).toBeCloseTo(100, 6);
    expect(b!.premiumBps).toBeNull(); // no mark/index → never fabricated
    expect(c!.premiumBps).toBeCloseTo(-100, 6);
    // median of [−21.9, 10.95, 43.8] = 10.95
    expect(a!.deviationPct).toBeCloseTo(32.85, 6);
    expect(b!.deviationPct).toBeCloseTo(0, 6);
    expect(c!.deviationPct).toBeCloseTo(-32.85, 6);
    // percentile: max→100, median→50, min→0
    expect(a!.percentile).toBeCloseTo(100, 6);
    expect(b!.percentile).toBeCloseTo(50, 6);
    expect(c!.percentile).toBeCloseTo(0, 6);
  });

  it('computes cross-sectional stats', () => {
    const a = fundingAnalytics(board);
    expect(a.medianAnnualizedPct).toBeCloseTo(10.95, 6);
    expect(a.meanAnnualizedPct).toBeCloseTo(10.95, 6);
    expect(a.dispersionPct).toBeCloseTo(26.82191, 4); // sqrt((32.85² + 0 + 32.85²)/3)
    expect(a.positiveShare).toBeCloseTo(2 / 3, 6); // AAA, BBB positive; CCC negative
  });

  it('returns all-null cross-section on empty input', () => {
    const a = fundingAnalytics([]);
    expect(a).toEqual({
      rows: [],
      count: 0,
      medianAnnualizedPct: null,
      meanAnnualizedPct: null,
      dispersionPct: null,
      positiveShare: null,
    });
  });

  it('handles a single row without fabricating dispersion or skew', () => {
    const a = fundingAnalytics([fr({ symbol: 'BBB', rate: 0.0001, annualizedPct: 10.95 })]);
    expect(a.count).toBe(1);
    expect(a.dispersionPct).toBeNull();
    expect(a.medianAnnualizedPct).toBeCloseTo(10.95, 6);
    expect(a.positiveShare).toBe(1);
    const only = a.rows[0]!;
    expect(only.deviationPct).toBeCloseTo(0, 6);
    expect(only.percentile).toBe(50);
    expect(only.premiumBps).toBeNull();
  });

  it('drops rows with non-finite funding fields', () => {
    const a = fundingAnalytics([
      fr({ symbol: 'OK', rate: 0.0001, annualizedPct: 10.95 }),
      fr({ symbol: 'NAN', rate: 0.0001, annualizedPct: Number.NaN }),
      fr({ symbol: 'BADINT', rate: 0.0001, annualizedPct: 10.95, intervalHours: 0 }),
    ]);
    expect(a.count).toBe(1);
    expect(a.rows[0]!.symbol).toBe('OK');
  });
});
