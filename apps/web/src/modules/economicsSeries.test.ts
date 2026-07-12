import { describe, it, expect } from 'vitest';
import type { EconomicObservation } from '@tyche/contracts';
import {
  applyTransform,
  observationsToCandles,
  rangeStartIso,
  seriesStats,
  transformUnitsLabel,
} from './economicsSeries';

const obs: EconomicObservation[] = [
  { date: '2024-01-01', value: 100 },
  { date: '2024-02-01', value: null },
  { date: '2024-03-01', value: 110 },
];

/** 24 monthly points, 2022-01 (=100) … 2023-12 (=123). */
const monthly: EconomicObservation[] = Array.from({ length: 24 }, (_, m) => {
  const year = 2022 + Math.floor(m / 12);
  const month = String((m % 12) + 1).padStart(2, '0');
  return { date: `${year}-${month}-01`, value: 100 + m };
});

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

describe('applyTransform', () => {
  it('level is identity (same reference)', () => {
    expect(applyTransform(obs, 'level')).toBe(obs);
  });

  it('preserves length and dates for every transform', () => {
    for (const kind of ['level', 'yoy', 'pop', 'index100'] as const) {
      const out = applyTransform(monthly, kind);
      expect(out).toHaveLength(monthly.length);
      expect(out.map((o) => o.date)).toEqual(monthly.map((o) => o.date));
    }
  });

  describe('pop (period-over-period %)', () => {
    it('is null for the first point and any null value; % vs previous valued', () => {
      const out = applyTransform(obs, 'pop');
      expect(out[0]?.value).toBeNull();
      expect(out[1]?.value).toBeNull(); // source gap
      expect(out[2]?.value).toBeCloseTo(10); // 100 -> 110
    });
    it('is null when the previous value is zero', () => {
      const out = applyTransform(
        [
          { date: '2024-01-01', value: 0 },
          { date: '2024-02-01', value: 5 },
        ],
        'pop',
      );
      expect(out[1]?.value).toBeNull();
    });
  });

  describe('index100 (rebase to 100)', () => {
    it('rebases every value against the first valued point', () => {
      const out = applyTransform(obs, 'index100');
      expect(out[0]?.value).toBeCloseTo(100);
      expect(out[1]?.value).toBeNull();
      expect(out[2]?.value).toBeCloseTo(110); // 110/100 * 100
    });
    it('nulls everything when the base is zero', () => {
      const out = applyTransform(
        [
          { date: '2024-01-01', value: 0 },
          { date: '2024-02-01', value: 5 },
        ],
        'index100',
      );
      expect(out.every((o) => o.value === null)).toBe(true);
    });
  });

  describe('yoy (year-over-year %)', () => {
    it('leaves the first year null (no year-ago counterpart in window)', () => {
      const out = applyTransform(monthly, 'yoy');
      for (let i = 0; i < 12; i += 1) expect(out[i]?.value).toBeNull();
    });
    it('compares against the same month one year earlier', () => {
      const out = applyTransform(monthly, 'yoy');
      // 2023-01 (112) vs 2022-01 (100) = +12%
      expect(out[12]?.value).toBeCloseTo(12);
      // 2023-12 (123) vs 2022-12 (111) = +10.81%
      expect(out[23]?.value).toBeCloseTo(10.8108, 3);
    });
    it('returns all null with fewer than two valued points', () => {
      const out = applyTransform([{ date: '2024-01-01', value: 100 }], 'yoy');
      expect(out[0]?.value).toBeNull();
    });
  });
});

describe('transformUnitsLabel', () => {
  it('falls back to the series units for level', () => {
    expect(transformUnitsLabel('level', 'Percent')).toBe('Percent');
    expect(transformUnitsLabel('level', null)).toBe('');
  });
  it('describes the derived unit for each transform', () => {
    expect(transformUnitsLabel('yoy')).toMatch(/year/i);
    expect(transformUnitsLabel('pop')).toMatch(/period/i);
    expect(transformUnitsLabel('index100')).toMatch(/100/);
  });
});
