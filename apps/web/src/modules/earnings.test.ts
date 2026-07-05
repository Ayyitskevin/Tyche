import { describe, it, expect } from 'vitest';
import { earningsSurprise } from './earnings';

describe('earningsSurprise', () => {
  it('returns absolute and percentage beat/miss vs the estimate', () => {
    expect(earningsSurprise(1.1, 1.0)).toEqual({ abs: expect.closeTo(0.1, 6), pct: expect.closeTo(10, 6) });
    const miss = earningsSurprise(0.9, 1.0)!;
    expect(miss.abs).toBeCloseTo(-0.1, 6);
    expect(miss.pct).toBeCloseTo(-10, 6);
  });

  it('measures the percentage against the magnitude of the estimate (negative estimate)', () => {
    // A loss that came in less bad than expected is a positive surprise.
    const s = earningsSurprise(-0.8, -1.0)!;
    expect(s.abs).toBeCloseTo(0.2, 6);
    expect(s.pct).toBeCloseTo(20, 6);
  });

  it('returns null when there is nothing to compare or the estimate is zero', () => {
    expect(earningsSurprise(null, 1.0)).toBeNull();
    expect(earningsSurprise(undefined, 1.0)).toBeNull();
    expect(earningsSurprise(1.0, null)).toBeNull();
    expect(earningsSurprise(1.0, 0)).toBeNull(); // no divide-by-zero
    expect(earningsSurprise(Infinity, 1.0)).toBeNull();
  });
});
