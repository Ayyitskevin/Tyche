import { describe, it, expect } from 'vitest';
import { blackScholes, normCdf } from './options';

describe('normCdf', () => {
  it('is 0.5 at 0 and stays within (0, 1)', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(-6)).toBeGreaterThan(0);
    expect(normCdf(6)).toBeLessThan(1);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 3);
  });
});

describe('blackScholes', () => {
  const base = { spot: 100, strike: 100, timeYears: 1, rate: 0.05, vol: 0.2, type: 'call' as const };

  it('matches the textbook ATM call value and delta', () => {
    const v = blackScholes(base);
    expect(v.price).toBeCloseTo(10.4506, 2);
    expect(v.delta).toBeCloseTo(0.6368, 3);
    expect(v.gamma).toBeGreaterThan(0);
    expect(v.vega).toBeGreaterThan(0);
    expect(v.theta).toBeLessThan(0);
  });

  it('satisfies put-call parity', () => {
    const c = blackScholes(base);
    const p = blackScholes({ ...base, type: 'put' });
    // c - p = S·e^(-qT) - K·e^(-rT)
    expect(c.price - p.price).toBeCloseTo(100 - 100 * Math.exp(-0.05), 4);
    expect(p.price).toBeCloseTo(5.5735, 2);
  });

  it('put delta is negative and bounded by -1', () => {
    const p = blackScholes({ ...base, type: 'put' });
    expect(p.delta).toBeLessThan(0);
    expect(p.delta).toBeGreaterThan(-1);
  });

  it('collapses to intrinsic at expiry without NaN', () => {
    const v = blackScholes({ ...base, timeYears: 0, spot: 110 });
    expect(v.price).toBe(10);
    expect(v.delta).toBe(1);
    expect(Number.isFinite(v.gamma)).toBe(true);
    expect(Number.isFinite(v.theta)).toBe(true);
  });

  it('a dividend yield lowers the call value', () => {
    const noDiv = blackScholes(base);
    const withDiv = blackScholes({ ...base, dividendYield: 0.03 });
    expect(withDiv.price).toBeLessThan(noDiv.price);
  });
});
