import { describe, it, expect } from 'vitest';
import {
  adx,
  atr,
  bollingerBands,
  cci,
  ichimoku,
  macd,
  momentum,
  obv,
  roc,
  rollingMax,
  rollingMin,
  rollingStd,
  stochastic,
  trueRange,
  typicalPrice,
  vwap,
  williamsR,
} from './technicals';

/** Non-null entries of a warm-up-padded series. */
function defined(series: Array<number | null>): number[] {
  return series.filter((v): v is number => v !== null);
}

describe('rolling helpers', () => {
  it('rollingMax/Min slide a trailing window and are null until it fills', () => {
    expect(rollingMax([1, 3, 2, 5, 4], 3)).toEqual([null, null, 3, 5, 5]);
    expect(rollingMin([1, 3, 2, 5, 4], 3)).toEqual([null, null, 1, 2, 2]);
  });

  it('rollingStd is the population standard deviation over the window', () => {
    // [2,4,4,4,5,5,7,9] population std = 2.
    const s = rollingStd([2, 4, 4, 4, 5, 5, 7, 9], 8);
    expect(s[7]).toBeCloseTo(2, 10);
    expect(s.slice(0, 7).every((v) => v === null)).toBe(true);
  });
});

describe('MACD', () => {
  it('histogram equals macd minus signal wherever both are defined', () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
    const { macd: line, signal, histogram } = macd(values);
    for (let i = 0; i < values.length; i++) {
      if (line[i] !== null && signal[i] !== null) {
        expect(histogram[i]!).toBeCloseTo(line[i]! - signal[i]!, 10);
      } else {
        expect(histogram[i]).toBeNull();
      }
    }
    // Signal is defined strictly later than the MACD line (it's an EMA of it).
    expect(defined(signal).length).toBeLessThan(defined(line).length);
  });

  it('a steadily rising series has a positive MACD line once warmed up', () => {
    const rising = Array.from({ length: 50 }, (_, i) => 100 + i);
    const { macd: line } = macd(rising);
    expect(line[49]!).toBeGreaterThan(0);
  });
});

describe('Bollinger Bands', () => {
  it('brackets the middle SMA with symmetric ±mult·σ bands', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const { middle, upper, lower } = bollingerBands(values, 20, 2);
    const i = 19;
    expect(middle[i]!).toBeCloseTo(10.5, 10); // mean 1..20
    expect(upper[i]!).toBeGreaterThan(middle[i]!);
    expect(lower[i]!).toBeLessThan(middle[i]!);
    // Bands are symmetric about the middle.
    expect(upper[i]! - middle[i]!).toBeCloseTo(middle[i]! - lower[i]!, 10);
  });
});

describe('true range & ATR', () => {
  it('true range takes the largest of the three gaps, using the prior close', () => {
    const highs = [10, 12, 11];
    const lows = [8, 9, 7];
    const closes = [9, 11, 8];
    // bar0: 10-8=2; bar1: max(12-9, |12-9|, |9-9|)=3; bar2: max(11-7, |11-11|, |7-11|)=4
    expect(trueRange(highs, lows, closes)).toEqual([2, 3, 4]);
  });

  it('ATR is positive and defined from the period-th bar', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 100 + i + 1);
    const lows = Array.from({ length: n }, (_, i) => 100 + i - 1);
    const closes = Array.from({ length: n }, (_, i) => 100 + i);
    const a = atr(highs, lows, closes, 14);
    expect(a[12]).toBeNull();
    expect(a[13]).not.toBeNull();
    expect(a[29]!).toBeGreaterThan(0);
  });
});

describe('Stochastic & Williams %R', () => {
  const highs = [10, 11, 12, 13, 14, 15, 16, 17];
  const lows = [8, 9, 10, 11, 12, 13, 14, 15];
  const closes = [9, 11, 11, 13, 13, 15, 15, 17];

  it('%K stays within [0,100] and is 100 at a window high close', () => {
    const { k, d } = stochastic(highs, lows, closes, 5, 3);
    for (const v of defined(k)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
    // Last close (17) is the highest high of its window → %K = 100.
    expect(k[7]!).toBeCloseTo(100, 10);
    expect(defined(d).length).toBeGreaterThan(0);
  });

  it('Williams %R is within [-100, 0]', () => {
    const r = williamsR(highs, lows, closes, 5);
    for (const v of defined(r)) expect(v).toBeGreaterThanOrEqual(-100), expect(v).toBeLessThanOrEqual(0);
    expect(r[7]!).toBeCloseTo(0, 10); // close at the high → 0
  });

  it('a flat window yields the neutral midpoint, never NaN', () => {
    const flat = [5, 5, 5, 5, 5];
    const { k } = stochastic(flat, flat, flat, 3, 3);
    expect(k[4]).toBe(50);
    expect(williamsR(flat, flat, flat, 3)[4]).toBe(-50);
  });
});

describe('typical price, CCI, ROC & momentum', () => {
  it('typical price averages high/low/close', () => {
    expect(typicalPrice([12], [6], [9])).toEqual([9]);
  });

  it('CCI is 0 on a perfectly flat series and finite otherwise', () => {
    const flat = new Array(25).fill(50);
    expect(cci(flat, flat, flat, 20)[24]).toBe(0);
    const highs = Array.from({ length: 25 }, (_, i) => 50 + Math.sin(i));
    expect(Number.isFinite(cci(highs, highs, highs, 20)[24]!)).toBe(true);
  });

  it('ROC and momentum compare against the value `period` bars back', () => {
    const values = [10, 11, 12, 13, 14];
    expect(roc(values, 2)![4]).toBeCloseTo(((14 - 12) / 12) * 100, 10);
    expect(momentum(values, 2)![4]).toBe(2);
    expect(roc(values, 2)![1]).toBeNull();
  });
});

describe('OBV & VWAP', () => {
  it('OBV accumulates volume in the direction of the close', () => {
    const closes = [10, 11, 10, 10, 12];
    const volumes = [100, 200, 150, 300, 250];
    // +0, +200, -150, +0 (unchanged), +250 → [0,200,50,50,300]
    expect(obv(closes, volumes)).toEqual([0, 200, 50, 50, 300]);
  });

  it('VWAP stays within the range of typical prices and weights by volume', () => {
    const highs = [10, 20];
    const lows = [10, 20];
    const closes = [10, 20];
    const volumes = [1, 3];
    // typical prices 10 and 20; cumV-weighted: bar0=10, bar1=(10*1+20*3)/4=17.5
    const w = vwap(highs, lows, closes, volumes);
    expect(w[0]!).toBeCloseTo(10, 10);
    expect(w[1]!).toBeCloseTo(17.5, 10);
  });

  it('VWAP is null while cumulative volume is zero', () => {
    expect(vwap([10, 10], [10, 10], [10, 10], [0, 0])).toEqual([null, null]);
  });
});

describe('ADX / DMI', () => {
  it('reports +DI dominating in a clean uptrend, with all values in [0,100]', () => {
    const n = 40;
    const highs = Array.from({ length: n }, (_, i) => 100 + i * 2 + 1);
    const lows = Array.from({ length: n }, (_, i) => 100 + i * 2 - 1);
    const closes = Array.from({ length: n }, (_, i) => 100 + i * 2);
    const { plusDI, minusDI, adx: a } = adx(highs, lows, closes, 14);
    const last = n - 1;
    expect(plusDI[last]!).toBeGreaterThan(minusDI[last]!);
    for (const series of [plusDI, minusDI, a]) {
      for (const v of defined(series)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
    // ADX warms up later than DI (needs 2·period−1 bars).
    expect(a[13]).toBeNull();
    expect(a[27]).not.toBeNull();
  });

  it('is all-null when the series is shorter than the period', () => {
    const { plusDI, adx: a } = adx([1, 2, 3], [1, 2, 3], [1, 2, 3], 14);
    expect(defined(plusDI)).toEqual([]);
    expect(defined(a)).toEqual([]);
  });
});

describe('Ichimoku', () => {
  it('computes the conversion/base midpoints and projects the cloud forward', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => 100 + i + 1);
    const lows = Array.from({ length: n }, (_, i) => 100 + i - 1);
    const closes = Array.from({ length: n }, (_, i) => 100 + i);
    const { conversion, base, spanA, spanB, laggingSpan } = ichimoku(highs, lows, closes, {
      displacement: 26,
    });
    // Output arrays run `displacement` bars longer to hold the projected cloud.
    expect(conversion.length).toBe(n + 26);
    expect(spanA.length).toBe(n + 26);

    // Conversion at bar i (i>=8) = (HH9 + LL9)/2. For the linear ramp that is the
    // midpoint of the window: (high[i] + low[i-8]) / 2.
    const i = 30;
    expect(conversion[i]!).toBeCloseTo((highs[i]! + lows[i - 8]!) / 2, 10);
    expect(base[i]!).toBeCloseTo((highs[i]! + lows[i - 25]!) / 2, 10);

    // Span A is displaced forward: its value at i+26 is (conversion+base)/2 at i.
    expect(spanA[i + 26]!).toBeCloseTo((conversion[i]! + base[i]!) / 2, 10);
    // Lagging span is the close displaced backward.
    expect(laggingSpan[i - 26]!).toBeCloseTo(closes[i]!, 10);
    expect(defined(spanB).length).toBeGreaterThan(0);
  });
});
