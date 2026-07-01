import { describe, it, expect } from 'vitest';
import type { Candle } from '@tyche/contracts';
import { niceTicks, overlaySeries, priceRange, tickDecimals } from './chartScale';

function candle(o: number, h: number, l: number, c: number): Candle {
  return { t: '2024-01-01T00:00:00.000Z', o, h, l, c };
}

describe('overlaySeries', () => {
  const closes = [1, 2, 3, 4, 5];

  it('routes sma vs ema by kind', () => {
    const smaOut = overlaySeries(closes, { kind: 'sma', period: 2 });
    expect(smaOut[0]).toBeNull();
    expect(smaOut[1]).toBe(1.5);
    // EMA diverges from SMA on a non-linear series (it coincides on a ramp).
    const curved = [2, 4, 8, 16];
    const smaCurve = overlaySeries(curved, { kind: 'sma', period: 2 });
    const emaCurve = overlaySeries(curved, { kind: 'ema', period: 2 });
    expect(smaCurve[3]).toBe(12);
    expect(emaCurve[3]).not.toBe(smaCurve[3]);
  });

  it('is null until the window fills', () => {
    const out = overlaySeries(closes, { kind: 'sma', period: 3 });
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2);
  });
});

describe('niceTicks', () => {
  it('produces round steps strictly inside the range', () => {
    const ticks = niceTicks(96.3, 187.9, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks[0]).toBeGreaterThanOrEqual(96.3);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(187.9);
    // Every tick lands on the step grid (round numbers).
    const step = (ticks[1] ?? 0) - (ticks[0] ?? 0);
    for (const t of ticks) expect(Math.abs(t / step - Math.round(t / step))).toBeLessThan(1e-9);
  });

  it('handles sub-1 ranges with fractional steps', () => {
    const ticks = niceTicks(0.031, 0.094, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.every((t) => t >= 0.031 && t <= 0.094)).toBe(true);
  });

  it('returns empty on degenerate input', () => {
    expect(niceTicks(5, 5, 5)).toEqual([]);
    expect(niceTicks(10, 2, 5)).toEqual([]);
    expect(niceTicks(Number.NaN, 1, 5)).toEqual([]);
  });

  it('tickDecimals renders fractional steps without precision loss', () => {
    expect(tickDecimals([100, 120, 140])).toBe(0);
    expect(tickDecimals([1, 2, 3])).toBe(1);
    expect(tickDecimals([0.02, 0.04, 0.06])).toBeGreaterThanOrEqual(2);
    expect(tickDecimals([])).toBe(2);
  });
});

describe('priceRange', () => {
  const candles = [candle(10, 12, 9, 11), candle(11, 15, 10, 14)];

  it('uses high/low extents in candle mode', () => {
    expect(priceRange(candles, 'candles', [])).toEqual({ min: 9, max: 15 });
  });

  it('uses closes in line mode', () => {
    expect(priceRange(candles, 'line', [])).toEqual({ min: 11, max: 14 });
  });

  it('extends the range up to cover a finite overlay above the data', () => {
    const r = priceRange(candles, 'line', [[null, 20]]);
    expect(r.max).toBe(20);
    expect(r.min).toBe(11);
  });

  it('extends the range down to cover a finite overlay below the data', () => {
    const r = priceRange(candles, 'line', [[5]]);
    expect(r.min).toBe(5);
    expect(r.max).toBe(14);
  });

  it('ignores null overlay points', () => {
    expect(priceRange(candles, 'candles', [[null, null]])).toEqual({ min: 9, max: 15 });
  });

  it('falls back to a unit band on empty input', () => {
    expect(priceRange([], 'candles', [])).toEqual({ min: 0, max: 1 });
  });

  it('pads a degenerate flat series', () => {
    const flat = [candle(5, 5, 5, 5)];
    expect(priceRange(flat, 'candles', [])).toEqual({ min: 4, max: 6 });
  });
});
