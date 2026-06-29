import { describe, it, expect } from 'vitest';
import type { EconomicObservation } from '@tyche/contracts';
import { observationsToCandles, rangeStartIso, seriesStats } from './economicsSeries';

const obs: EconomicObservation[] = [
  { date: '2024-01-01', value: 100 },
  { date: '2024-02-01', value: null },
  { date: '2024-03-01', value: 110 },
];

describe('rangeStartIso', () => {
  const from = new Date('2024-06-15T00:00:00.000Z');
  it('subtracts the window in years', () => {
    expect(rangeStartIso('5y', from)).toBe('2019-06-15');
    expect(rangeStartIso('10y', from)).toBe('2014-06-15');
  });
  it('returns undefined for max', () => {
    expect(rangeStartIso('max', from)).toBeUndefined();
  });
});

describe('observationsToCandles', () => {
  it('skips null observations and flattens value into OHLC', () => {
    const candles = observationsToCandles(obs);
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ o: 100, h: 100, l: 100, c: 100 });
    expect(candles[0]?.t).toBe('2024-01-01T00:00:00.000Z');
  });
  it('preserves an existing ISO datetime', () => {
    const candles = observationsToCandles([{ date: '2024-01-01T12:00:00.000Z', value: 5 }]);
    expect(candles[0]?.t).toBe('2024-01-01T12:00:00.000Z');
  });
});

describe('seriesStats', () => {
  it('computes latest and change over the previous valued point', () => {
    const stats = seriesStats(obs);
    expect(stats.latest?.value).toBe(110);
    expect(stats.previous?.value).toBe(100); // skips the null
    expect(stats.change).toBe(10);
    expect(stats.changePercent).toBeCloseTo(10);
  });
  it('returns nulls when there is no prior valued point', () => {
    const stats = seriesStats([{ date: '2024-01-01', value: 100 }]);
    expect(stats.latest?.value).toBe(100);
    expect(stats.change).toBeNull();
    expect(stats.changePercent).toBeNull();
  });
});
