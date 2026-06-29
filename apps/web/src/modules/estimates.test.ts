import { describe, it, expect } from 'vitest';
import { computeImpliedMultiples } from './estimates';

describe('computeImpliedMultiples', () => {
  it('computes P/E, P/S, and P/CF from valid inputs', () => {
    const m = computeImpliedMultiples({
      epsMean: 10,
      revMean: 1000,
      price: 200,
      shares: 100,
      operatingCashFlow: 4000,
    });
    expect(m.pe).toBe(20); // 200 / 10
    expect(m.ps).toBe(20); // 200 * 100 / 1000
    expect(m.pcf).toBe(5); // 200 * 100 / 4000
  });

  it('returns null for missing inputs rather than NaN', () => {
    const m = computeImpliedMultiples({ epsMean: null, revMean: null, price: null, shares: null, operatingCashFlow: null });
    expect(m).toEqual({ pe: null, ps: null, pcf: null });
  });

  it('guards non-positive divisors (no Infinity)', () => {
    const m = computeImpliedMultiples({ epsMean: 0, revMean: 0, price: 100, shares: 10, operatingCashFlow: 0 });
    expect(m).toEqual({ pe: null, ps: null, pcf: null });
  });

  it('computes P/E even when shares/cash-flow are absent', () => {
    const m = computeImpliedMultiples({ epsMean: 8, revMean: 500, price: 80, shares: null, operatingCashFlow: null });
    expect(m.pe).toBe(10);
    expect(m.ps).toBeNull();
    expect(m.pcf).toBeNull();
  });
});
