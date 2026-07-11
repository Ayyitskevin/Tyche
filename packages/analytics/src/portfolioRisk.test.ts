import { describe, it, expect } from 'vitest';
import {
  activeReturns,
  annualizedReturn,
  beta,
  calmarRatio,
  correlation,
  correlationMatrix,
  covariance,
  downsideDeviation,
  equityCurve,
  informationRatio,
  portfolioReturns,
  portfolioRiskStats,
  sortinoRatio,
  trackingError,
} from './portfolioRisk';

describe('covariance & correlation', () => {
  it('correlates a series perfectly with itself and with a positive scaling', () => {
    const a = [0.01, -0.02, 0.03, 0.0, -0.01];
    expect(correlation(a, a)).toBeCloseTo(1, 10);
    expect(correlation(a, a.map((x) => 2 * x))).toBeCloseTo(1, 10);
  });

  it('finds -1 for a perfectly inverted series and ~0 for the flat case', () => {
    const a = [0.01, -0.02, 0.03, -0.01];
    expect(correlation(a, a.map((x) => -x))).toBeCloseTo(-1, 10);
    expect(correlation(a, [0, 0, 0, 0])).toBe(0); // flat benchmark → 0, not NaN
  });

  it('covariance matches the sample formula on a known pair', () => {
    // cov([1,2,3],[1,2,3]) sample = var = 1.
    expect(covariance([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(covariance([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
  });

  it('aligns unequal-length series at the most-recent end', () => {
    expect(correlation([9, 9, 0.01, -0.02, 0.03], [0.01, -0.02, 0.03])).toBeCloseTo(1, 10);
  });
});

describe('beta', () => {
  it('is 1 vs itself and 2 for a series that moves twice as much', () => {
    const bench = [0.01, -0.02, 0.03, -0.015, 0.005];
    expect(beta(bench, bench)).toBeCloseTo(1, 10);
    expect(beta(bench.map((x) => 2 * x), bench)).toBeCloseTo(2, 10);
    expect(beta(bench.map((x) => -x), bench)).toBeCloseTo(-1, 10);
  });

  it('is 0 against a flat benchmark (undefined sensitivity, not NaN)', () => {
    expect(beta([0.01, -0.02, 0.03], [0, 0, 0])).toBe(0);
  });
});

describe('correlationMatrix', () => {
  it('is symmetric with a unit diagonal', () => {
    const a = [0.01, -0.02, 0.03, -0.01];
    const b = a.map((x) => -x);
    const c = [0.02, 0.01, -0.03, 0.04];
    const m = correlationMatrix([a, b, c]);
    expect(m[0]![0]).toBeCloseTo(1, 10);
    expect(m[0]![1]).toBeCloseTo(-1, 10); // a vs -a
    expect(m[1]![0]).toBeCloseTo(m[0]![1]!, 10); // symmetric
    expect(m[2]![2]).toBeCloseTo(1, 10);
  });
});

describe('downside deviation & Sortino', () => {
  it('counts only shortfalls below the MAR', () => {
    // Only -0.02 and -0.01 are below MAR=0; RMS over N=4 = sqrt((0.0004+0.0001)/4).
    expect(downsideDeviation([0.03, -0.02, 0.01, -0.01], 0)).toBeCloseTo(Math.sqrt(0.0005 / 4), 12);
    // No downside → 0 → Sortino 0 (not Infinity).
    expect(downsideDeviation([0.01, 0.02, 0.0], 0)).toBe(0);
    expect(sortinoRatio([0.01, 0.02, 0.03], 0)).toBe(0);
  });

  it('is positive for a net-positive series with limited downside', () => {
    expect(sortinoRatio([0.02, -0.01, 0.03, -0.005, 0.01], 0)).toBeGreaterThan(0);
  });
});

describe('annualizedReturn, equityCurve & Calmar', () => {
  it('compounds returns geometrically and annualizes by period count', () => {
    // Two periods of +10% → growth 1.21; annualized over 252 with n=2 = 1.21^126 - 1 (huge).
    expect(annualizedReturn([0.1, 0.1], 2)).toBeCloseTo(1.21 - 1, 10); // ppy=n → just the total
    expect(equityCurve([0.1, -0.1])).toEqual([1.1, 1.1 * 0.9]);
  });

  it('Calmar divides annualized return by max drawdown, 0 when monotonic up', () => {
    expect(calmarRatio([0.01, 0.02, 0.01], 252)).toBe(0); // no drawdown
    const c = calmarRatio([0.05, -0.1, 0.03, 0.04], 4);
    expect(Number.isFinite(c)).toBe(true);
  });
});

describe('tracking error & information ratio', () => {
  it('are 0 when the asset tracks the benchmark exactly', () => {
    const b = [0.01, -0.02, 0.03, -0.01];
    expect(trackingError(b, b)).toBe(0);
    expect(informationRatio(b, b)).toBe(0);
    expect(activeReturns(b, b)).toEqual([0, 0, 0, 0]);
  });

  it('guard to 0 when active return has zero variance, finite otherwise', () => {
    // Exactly-constant active return (asset − 0 benchmark) → zero tracking error,
    // so IR guards to 0 rather than dividing by 0.
    const flatBench = [0, 0, 0, 0];
    const constActive = [0.005, 0.005, 0.005, 0.005];
    expect(trackingError(constActive, flatBench)).toBe(0);
    expect(informationRatio(constActive, flatBench)).toBe(0);
    // Noisy active return → positive variance → finite IR.
    const bench = [0.01, -0.02, 0.03, -0.01, 0.0];
    const noisy = [0.02, -0.01, 0.05, -0.02, 0.01];
    expect(Number.isFinite(informationRatio(noisy, bench))).toBe(true);
    expect(trackingError(noisy, bench)).toBeGreaterThan(0);
  });
});

describe('portfolioReturns', () => {
  it('weights per-asset returns per period and aligns to the shortest history', () => {
    const a = [0.02, -0.01, 0.03];
    const b = [-0.01, 0.02]; // shorter → window trims to 2 most-recent
    const combined = portfolioReturns([0.5, 0.5], [a, b]);
    expect(combined).toHaveLength(2);
    // aligned a = [-0.01, 0.03]; 0.5*-0.01 + 0.5*-0.01 = -0.01 ; 0.5*0.03 + 0.5*0.02 = 0.025
    expect(combined[0]).toBeCloseTo(-0.01, 12);
    expect(combined[1]).toBeCloseTo(0.025, 12);
  });

  it('returns [] for no assets', () => {
    expect(portfolioReturns([], [])).toEqual([]);
  });
});

describe('portfolioRiskStats bundle', () => {
  const port = [0.01, -0.02, 0.03, -0.01, 0.015, -0.005, 0.02];
  const bench = [0.008, -0.015, 0.02, -0.008, 0.012, -0.004, 0.018];

  it('fills benchmark-relative fields only when a benchmark is supplied', () => {
    const solo = portfolioRiskStats(port);
    expect(solo.beta).toBeNull();
    expect(solo.trackingError).toBeNull();
    expect(solo.informationRatio).toBeNull();
    expect(Number.isFinite(solo.sharpe)).toBe(true);
    expect(solo.maxDrawdown).toBeLessThanOrEqual(0);
    expect(solo.valueAtRisk).toBeLessThanOrEqual(0);

    const rel = portfolioRiskStats(port, bench);
    expect(rel.beta).not.toBeNull();
    expect(Number.isFinite(rel.beta!)).toBe(true);
    expect(rel.trackingError).toBeGreaterThanOrEqual(0);
  });

  it('is all-finite and safe on a degenerate (flat) series', () => {
    const flat = [0, 0, 0, 0];
    const s = portfolioRiskStats(flat, flat);
    for (const v of [s.annualizedReturn, s.annualizedVolatility, s.sharpe, s.sortino, s.calmar, s.maxDrawdown, s.valueAtRisk]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(s.beta).toBe(0); // flat vs flat benchmark
  });
});
