import { describe, it, expect } from 'vitest';
import type { Candle } from '@tyche/contracts';
import { marketSensitivity } from './marketBeta';

const c = (t: string, close: number): Candle => ({ t: `${t}T00:00:00.000Z`, o: close, h: close, l: close, c: close });

describe('marketSensitivity', () => {
  it('recovers beta=2 / correlation=1 when the asset moves exactly twice the benchmark', () => {
    // Benchmark returns [+0.1, −0.05, +0.02]; asset returns are exactly 2× those.
    const bench = [c('2024-01-02', 100), c('2024-01-03', 110), c('2024-01-04', 104.5), c('2024-01-05', 106.59)];
    const asset = [c('2024-01-02', 100), c('2024-01-03', 120), c('2024-01-04', 108), c('2024-01-05', 112.32)];
    const s = marketSensitivity(asset, bench, 'AAPL', 'SPY');
    expect(s.observations).toBe(3);
    expect(s.firstDate).toBe('2024-01-02');
    expect(s.lastDate).toBe('2024-01-05');
    expect(s.beta).toBeCloseTo(2, 6);
    expect(s.correlation).toBeCloseTo(1, 6);
    expect(s.rSquared).toBeCloseTo(1, 6);
    expect(s.alpha).toBeCloseTo(0, 6); // asset return = 2×benchmark exactly → zero alpha
    expect(s.upCapture).toBeCloseTo(2, 6);
    expect(s.downCapture).toBeCloseTo(2, 6);
  });

  it('aligns on common trading dates, not by trimming to equal length', () => {
    const asset = [c('2024-01-02', 100), c('2024-01-03', 110), c('2024-01-04', 105), c('2024-01-05', 108)];
    const bench = [c('2024-01-03', 200), c('2024-01-04', 190), c('2024-01-05', 196), c('2024-01-08', 198)];
    const s = marketSensitivity(asset, bench, 'AAPL', 'SPY');
    // Common dates are 01-03/01-04/01-05 → 3 aligned closes → 2 return observations.
    expect(s.observations).toBe(2);
    expect(s.firstDate).toBe('2024-01-03');
    expect(s.lastDate).toBe('2024-01-05');
  });

  it('returns null stats for a flat benchmark (zero variance), never a fabricated 0-beta', () => {
    const asset = [c('2024-01-02', 100), c('2024-01-03', 110), c('2024-01-04', 105)];
    const bench = [c('2024-01-02', 50), c('2024-01-03', 50), c('2024-01-04', 50)];
    const s = marketSensitivity(asset, bench, 'AAPL', 'SPY');
    expect(s.observations).toBe(2);
    expect(s.beta).toBeNull();
    expect(s.correlation).toBeNull();
    expect(s.upCapture).toBeNull();
  });

  it('returns null stats for a flat ASSET too (correlation undefined), never a fabricated 0', () => {
    const asset = [c('2024-01-02', 50), c('2024-01-03', 50), c('2024-01-04', 50)];
    const bench = [c('2024-01-02', 100), c('2024-01-03', 110), c('2024-01-04', 105)];
    const s = marketSensitivity(asset, bench, 'AAPL', 'SPY');
    expect(s.beta).toBeNull();
    expect(s.correlation).toBeNull();
  });

  it('is empty-safe', () => {
    const s = marketSensitivity([], [], 'AAPL', 'SPY');
    expect(s.observations).toBe(0);
    expect(s.beta).toBeNull();
    expect(s.firstDate).toBeNull();
  });
});
