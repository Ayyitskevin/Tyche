import { describe, it, expect } from 'vitest';
import type { Candle } from '@tyche/contracts';
import {
  fitStudyPanes,
  niceTicks,
  overlaySeries,
  panWindow,
  priceMapper,
  priceRange,
  tickDecimals,
  zoomWindow,
} from './chartScale';

function candle(o: number, h: number, l: number, c: number): Candle {
  return { t: '2024-01-01T00:00:00.000Z', o, h, l, c };
}

describe('fitStudyPanes', () => {
  const GAP = 10;

  it('never lets the price pane collapse, across heights and pane counts', () => {
    // Regression: three stacked study panes on a short chart must not push priceH
    // negative (which broke the price/volume/study scale mapping).
    for (let innerH = 40; innerH <= 400; innerH += 4) {
      for (let requested = 0; requested <= 3; requested++) {
        for (const wantVolume of [true, false]) {
          const fit = fitStudyPanes(innerH, GAP, requested, wantVolume);
          expect(fit.priceH).toBeGreaterThanOrEqual(0);
          expect(fit.panes).toBeLessThanOrEqual(requested);
          // Everything allotted fits inside the inner height.
          const used = fit.priceH + fit.panes * (fit.studyH + GAP) + (fit.hasVolume ? fit.volH + GAP : 0);
          expect(used).toBeLessThanOrEqual(innerH + 1e-9);
          if (fit.panes > 0) expect(fit.studyH).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it('drops panes that cannot fit at the minimum fill height', () => {
    // 140px fill height → innerH ≈ 104; three panes cannot fit, so some are dropped.
    const fit = fitStudyPanes(104, GAP, 3, true);
    expect(fit.panes).toBeLessThan(3);
    expect(fit.priceH).toBeGreaterThanOrEqual(60);
  });

  it('keeps all three panes when there is ample height', () => {
    const fit = fitStudyPanes(400, GAP, 3, true);
    expect(fit.panes).toBe(3);
    expect(fit.priceH).toBeGreaterThanOrEqual(60);
  });
});

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

describe('zoomWindow / panWindow', () => {
  it('zooms in around the anchor and clamps to bounds', () => {
    const win = zoomWindow(null, 100, 0.5, 0.5);
    expect(win).toEqual({ start: 25, end: 74 });
    // Anchored at the right edge: the newest candle stays visible.
    const right = zoomWindow(null, 100, 1, 0.5);
    expect(right!.end).toBe(99);
    // Zooming out past the full series returns null (full view).
    expect(zoomWindow({ start: 25, end: 74 }, 100, 0.5, 3)).toBeNull();
  });

  it('never shrinks below the minimum bar count and ignores tiny series', () => {
    const win = zoomWindow({ start: 40, end: 60 }, 100, 0.5, 0.01);
    expect(win!.end - win!.start + 1).toBe(10);
    expect(zoomWindow(null, 8, 0.5, 0.5)).toBeNull();
  });

  it('pans within bounds and is a no-op on the full view', () => {
    expect(panWindow({ start: 10, end: 29 }, 100, 5)).toEqual({ start: 15, end: 34 });
    expect(panWindow({ start: 10, end: 29 }, 100, -50)).toEqual({ start: 0, end: 19 });
    expect(panWindow({ start: 70, end: 89 }, 100, 50)).toEqual({ start: 80, end: 99 });
    expect(panWindow(null, 100, 5)).toBeNull();
  });
});

describe('priceMapper', () => {
  it('maps linearly by default and round-trips', () => {
    const m = priceMapper(100, 200, false);
    expect(m.toFrac(150)).toBeCloseTo(0.5, 9);
    expect(m.fromFrac(m.toFrac(137))).toBeCloseTo(137, 9);
  });

  it('maps geometrically in log mode (midpoint = geometric mean)', () => {
    const m = priceMapper(100, 400, true);
    expect(m.toFrac(200)).toBeCloseTo(0.5, 9);
    expect(m.fromFrac(0.5)).toBeCloseTo(200, 6);
    expect(m.fromFrac(m.toFrac(316))).toBeCloseTo(316, 6);
  });

  it('falls back to linear when the range cannot support log', () => {
    const m = priceMapper(-10, 10, true);
    expect(m.toFrac(0)).toBeCloseTo(0.5, 9);
  });
});
