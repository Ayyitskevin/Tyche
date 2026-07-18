import { describe, it, expect } from 'vitest';
import type { Candle } from '@tyche/contracts';
import { performanceStats } from './performance';

const c = (t: string, close: number): Candle => ({ t: `${t}T00:00:00.000Z`, o: close, h: close, l: close, c: close });

describe('performanceStats', () => {
  it('is empty-safe', () => {
    const s = performanceStats([], 'AAPL');
    expect(s.observations).toBe(0);
    expect(s.lastPrice).toBeNull();
    expect(s.annualizedVolatility).toBeNull();
    expect(s.trailing.every((t) => t.return === null)).toBe(true);
  });

  it('computes date-anchored trailing returns and a null for out-of-range horizons', () => {
    const s = performanceStats(
      [
        c('2022-12-30', 80),
        c('2023-12-29', 100), // prior-year close → YTD & 1Y reference
        c('2024-06-28', 120),
        c('2024-09-30', 130),
        c('2024-11-29', 140),
        c('2024-12-24', 148),
        c('2024-12-31', 150), // anchor
      ],
      'AAPL',
    );
    const r = (key: string) => s.trailing.find((t) => t.key === key)!.return;
    expect(s.asOf).toBe('2024-12-31');
    expect(s.firstDate).toBe('2022-12-30');
    expect(s.lastPrice).toBe(150);
    expect(s.observations).toBe(7);
    expect(r('YTD')).toBeCloseTo(0.5, 6); // 150/100 − 1
    expect(r('1Y')).toBeCloseTo(0.5, 6); // 150/100 − 1
    expect(r('6M')).toBeCloseTo(0.25, 6); // 150/120 − 1
    expect(r('3M')).toBeCloseTo(150 / 130 - 1, 6);
    expect(r('1M')).toBeCloseTo(150 / 140 - 1, 6);
    expect(r('1W')).toBeCloseTo(150 / 148 - 1, 6);
    expect(r('3Y')).toBeNull(); // history starts 2022-12-30, cutoff 2021-12-31 → no candle
  });

  it('clamps month subtraction to the target month-end (1M before Mar 31 is Feb 29, not Mar 2)', () => {
    const s = performanceStats(
      [c('2024-02-29', 101), c('2024-03-01', 103), c('2024-03-31', 110)],
      'AAPL',
    );
    // Clamped cutoff = 2024-02-29 → reference 101 (NOT the Mar-01 103 a naive setUTCMonth would pick).
    expect(s.trailing.find((t) => t.key === '1M')!.return).toBeCloseTo(110 / 101 - 1, 6);
  });

  it('computes drawdown, best/worst day, and positive rate from the return series', () => {
    const s = performanceStats(
      [c('2024-01-02', 100), c('2024-01-03', 110), c('2024-01-04', 90), c('2024-01-05', 95)],
      'AAPL',
    );
    expect(s.maxDrawdown).toBeCloseTo((90 - 110) / 110, 6); // peak 110 → trough 90
    expect(s.currentDrawdown).toBeCloseTo((95 - 110) / 110, 6); // last vs peak
    expect(s.bestDay).toBeCloseTo(0.1, 6); // 110/100 − 1
    expect(s.worstDay).toBeCloseTo(90 / 110 - 1, 6);
    expect(s.positiveRate).toBeCloseTo(2 / 3, 6); // 2 of 3 returns positive
  });

  it('leaves return-derived stats null for a single candle', () => {
    const s = performanceStats([c('2024-05-01', 42)], 'AAPL');
    expect(s.observations).toBe(1);
    expect(s.lastPrice).toBe(42);
    expect(s.annualizedVolatility).toBeNull();
    expect(s.sharpe).toBeNull();
    expect(s.bestDay).toBeNull();
    expect(s.positiveRate).toBeNull();
  });
});
