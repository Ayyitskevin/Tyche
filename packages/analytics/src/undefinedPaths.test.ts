/**
 * Adversarial undefined-path tests: zero-first-price, flat series, one observation,
 * mixed-unit metadata honesty, and status/value agreement.
 * Drives shipped entry points only.
 */
import { describe, it, expect } from 'vitest';
import type { Candle } from '@tyche/contracts';
import { seriesStats, totalReturnOf, sharpeRatio } from './risk';
import { performanceStats } from './performance';
import { portfolioRiskStats, sortinoRatio, calmarRatio, informationRatio } from './portfolioRisk';
import { statusFromMetricAvailability } from './analyticalMeta';
import { unavailableNotZero } from './validation';

const c = (t: string, close: number): Candle => ({
  t: `${t}T00:00:00.000Z`,
  o: close,
  h: close,
  l: close,
  c: close,
});

describe('totalReturn / zero-first-price', () => {
  it('is null when the first price is zero — never a fabricated 0% return', () => {
    expect(totalReturnOf([0, 10, 20])).toBeNull();
    expect(unavailableNotZero(totalReturnOf([0, 10, 20]))).toBe(true);

    const s = seriesStats([c('2024-01-01', 0), c('2024-01-02', 10), c('2024-01-03', 20)]);
    expect(s.totalReturn).toBeNull();
    expect(s.totalReturn).not.toBe(0);
    expect(s.meta.notes).toMatch(/first price is zero/i);
  });

  it('computes a hand-checkable total return when the first price is positive', () => {
    expect(totalReturnOf([100, 150])).toBeCloseTo(0.5, 6);
    const s = seriesStats([c('2024-01-01', 100), c('2024-01-02', 150)]);
    expect(s.totalReturn).toBeCloseTo(0.5, 6);
  });

  it('is null on one observation or empty series', () => {
    expect(totalReturnOf([])).toBeNull();
    expect(totalReturnOf([42])).toBeNull();
    expect(seriesStats([c('2024-01-01', 42)]).totalReturn).toBeNull();
  });
});

describe('bundle status agrees with null skill metrics', () => {
  it('flat series: Sharpe null and status is not plain estimated', () => {
    const flat = [c('2024-01-01', 50), c('2024-01-02', 50), c('2024-01-03', 50)];
    const s = seriesStats(flat);
    expect(s.sharpe).toBeNull();
    expect(s.meta.status).not.toBe('estimated');
    expect(['partial', 'unavailable']).toContain(s.meta.status);

    const p = performanceStats(flat, 'FLAT');
    expect(p.sharpe).toBeNull();
    expect(p.meta.status).not.toBe('estimated');
    expect(['partial', 'unavailable']).toContain(p.meta.status);
  });

  it('one-observation performance is partial/unavailable, not estimated', () => {
    const p = performanceStats([c('2024-01-01', 100)], 'ONE');
    expect(p.sharpe).toBeNull();
    expect(p.annualizedVolatility).toBeNull();
    expect(p.meta.status).not.toBe('estimated');
  });

  it('statusFromMetricAvailability classifies complete/partial/unavailable', () => {
    expect(statusFromMetricAvailability([])).toBe('unavailable');
    expect(statusFromMetricAvailability([null, null])).toBe('unavailable');
    expect(statusFromMetricAvailability([1.2, null])).toBe('partial');
    expect(statusFromMetricAvailability([1.2, 0.3])).toBe('estimated');
    expect(statusFromMetricAvailability([Number.NaN, 1])).toBe('partial');
  });
});

describe('mixed-unit metadata (no false shared unit)', () => {
  it('seriesStats exposes fieldUnits and does not claim a single misleading units', () => {
    const s = seriesStats([c('2024-01-01', 100), c('2024-01-02', 110), c('2024-01-03', 105)]);
    expect(s.meta.fieldUnits).toBeDefined();
    expect(s.meta.fieldUnits!.totalReturn).toBe('ratio');
    expect(s.meta.fieldUnits!.sharpe).toBe('dimensionless');
    // Top-level units must not imply the whole mixed bundle shares one unit.
    expect(s.meta.units).toBeUndefined();
  });

  it('performanceStats fieldUnits distinguish currency vs ratio vs dimensionless', () => {
    const p = performanceStats(
      [c('2024-01-01', 100), c('2024-01-02', 110), c('2024-06-01', 120)],
      'TEST',
    );
    expect(p.meta.fieldUnits!.lastPrice).toBe('currency');
    expect(p.meta.fieldUnits!.annualizedVolatility).toBe('ratio');
    expect(p.meta.fieldUnits!.sharpe).toBe('dimensionless');
    expect(p.meta.units).toBeUndefined();
  });
});

describe('adversarial pure risk paths', () => {
  it('all-zero downside → Sortino null; perfect track → IR null; monotonic → Calmar null', () => {
    expect(sortinoRatio([0.01, 0.02, 0.03], 0)).toBeNull();
    expect(calmarRatio([0.01, 0.02, 0.01], 252)).toBeNull();
    const b = [0.01, -0.02, 0.03];
    expect(informationRatio(b, b)).toBeNull();
  });

  it('missing benchmark keeps beta/IR/TE null in portfolioRiskStats', () => {
    const s = portfolioRiskStats([0.01, -0.02, 0.03, 0.01]);
    expect(s.beta).toBeNull();
    expect(s.informationRatio).toBeNull();
    expect(s.trackingError).toBeNull();
    expect(s.sharpe === null || Number.isFinite(s.sharpe)).toBe(true);
  });

  it('flat portfolio returns: skill ratios null', () => {
    const s = portfolioRiskStats([0, 0, 0, 0], [0, 0, 0, 0]);
    expect(s.sharpe).toBeNull();
    expect(s.sortino).toBeNull();
    expect(s.calmar).toBeNull();
    expect(s.beta).toBeNull();
    expect(sharpeRatio([0, 0, 0])).toBeNull();
  });
});
