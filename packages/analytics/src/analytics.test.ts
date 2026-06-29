import { describe, it, expect } from 'vitest';
import { simpleReturns, cumulativeReturn, normalizeToBase } from './returns';
import { sma, ema, rsi, stddev } from './indicators';
import { volatility, maxDrawdown, sharpeRatio, historicalVar } from './risk';

describe('returns', () => {
  it('computes simple returns', () => {
    expect(simpleReturns([100, 110, 99])).toEqual([0.1, expect.closeTo(-0.1, 5)]);
  });
  it('computes cumulative return', () => {
    expect(cumulativeReturn([100, 150])).toBeCloseTo(0.5, 5);
  });
  it('normalizes to a base of 100', () => {
    expect(normalizeToBase([50, 75, 100])).toEqual([100, 150, 200]);
  });
  it('always rebases the first point to the base and preserves ratios', () => {
    const out = normalizeToBase([200, 220, 180]);
    expect(out[0]).toBe(100);
    expect(out[1]).toBeCloseTo(110, 5);
    expect(out[2]).toBeCloseTo(90, 5);
  });
  it('guards empty and zero-first series', () => {
    expect(normalizeToBase([])).toEqual([]);
    expect(normalizeToBase([0, 0, 0])).toEqual([100, 100, 100]);
  });
});

describe('indicators', () => {
  it('sma is null until the window fills, then averages', () => {
    const out = sma([1, 2, 3, 4], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(1.5);
    expect(out[3]).toBe(3.5);
  });
  it('ema produces a value once seeded', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[2]).not.toBeNull();
    expect(out[4]).not.toBeNull();
  });
  it('rsi stays within [0, 100]', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 2) * 5);
    for (const v of rsi(prices, 14)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it('stddev of a constant series is zero', () => {
    expect(stddev([5, 5, 5, 5])).toBe(0);
  });
});

describe('risk', () => {
  it('volatility is non-negative', () => {
    expect(volatility(simpleReturns([100, 101, 99, 102, 98]))).toBeGreaterThanOrEqual(0);
  });
  it('max drawdown is negative when price falls from a peak', () => {
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(-0.5, 5);
  });
  it('sharpe is finite', () => {
    const s = sharpeRatio(simpleReturns([100, 101, 102, 101, 103]));
    expect(Number.isFinite(s)).toBe(true);
  });
  it('historical VaR returns a left-tail return', () => {
    const v = historicalVar([-0.05, -0.02, 0.01, 0.03, 0.04], 0.8);
    expect(v).toBeLessThanOrEqual(0);
  });
});
