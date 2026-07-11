import { ema, mean, sma } from './indicators';

/**
 * Technical-indicator library — momentum, trend, volatility and volume studies
 * computed over aligned OHLCV arrays. Pure and dependency-free; every function
 * returns an array the same length as its input, with `null` during the warm-up
 * window (matching the `sma`/`ema`/`rsi` convention in ./indicators). Educational
 * analytics only — nothing here is investment advice or a trade signal.
 *
 * OHLC-based studies take parallel numeric arrays (`highs`, `lows`, `closes`, …)
 * rather than a candle type, so they stay trivially testable and never divide by
 * zero: a flat window (highestHigh === lowestLow) yields a neutral value, not NaN.
 */

/** Rolling maximum over the trailing `period` values; null until the window fills. */
export function rollingMax(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || period <= 0) {
      out.push(null);
      continue;
    }
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, values[j]!);
    out.push(m);
  }
  return out;
}

/** Rolling minimum over the trailing `period` values; null until the window fills. */
export function rollingMin(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || period <= 0) {
      out.push(null);
      continue;
    }
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, values[j]!);
    out.push(m);
  }
  return out;
}

/** Rolling population standard deviation (÷N, the Bollinger convention). */
export function rollingStd(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || period <= 0) {
      out.push(null);
      continue;
    }
    const window = values.slice(i - period + 1, i + 1);
    const m = mean(window);
    const variance = window.reduce((acc, v) => acc + (v - m) ** 2, 0) / period;
    out.push(Math.sqrt(variance));
  }
  return out;
}

export interface MacdResult {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}

/**
 * MACD: the (fast − slow) EMA spread, its `signal`-period EMA, and the histogram
 * between them. The signal EMA is seeded from the first defined MACD value so it
 * doesn't inherit the leading warm-up nulls.
 */
export function macd(values: number[], fast = 12, slow = 26, signal = 9): MacdResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: Array<number | null> = values.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i]! - emaSlow[i]! : null,
  );

  // Run the signal EMA over the contiguous defined tail, then scatter it back.
  const firstDefined = macdLine.findIndex((v) => v !== null);
  const signalLine: Array<number | null> = new Array<number | null>(values.length).fill(null);
  if (firstDefined !== -1) {
    const compact = macdLine.slice(firstDefined).map((v) => v as number);
    const compactSignal = ema(compact, signal);
    for (let i = 0; i < compactSignal.length; i++) signalLine[firstDefined + i] = compactSignal[i]!;
  }

  const histogram: Array<number | null> = values.map((_, i) =>
    macdLine[i] !== null && signalLine[i] !== null ? macdLine[i]! - signalLine[i]! : null,
  );
  return { macd: macdLine, signal: signalLine, histogram };
}

export interface BollingerResult {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
}

/** Bollinger Bands: `period` SMA ± `mult` population standard deviations. */
export function bollingerBands(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period);
  const std = rollingStd(values, period);
  const upper = middle.map((m, i) => (m !== null && std[i] !== null ? m + mult * std[i]! : null));
  const lower = middle.map((m, i) => (m !== null && std[i] !== null ? m - mult * std[i]! : null));
  return { middle, upper, lower };
}

/** True range per bar: max(h−l, |h−prevClose|, |l−prevClose|). Bar 0 is h−l. */
export function trueRange(highs: number[], lows: number[], closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < highs.length; i++) {
    const hl = highs[i]! - lows[i]!;
    if (i === 0) {
      out.push(hl);
      continue;
    }
    const prevClose = closes[i - 1]!;
    out.push(Math.max(hl, Math.abs(highs[i]! - prevClose), Math.abs(lows[i]! - prevClose)));
  }
  return out;
}

/** Average True Range (Wilder's smoothing), seeded with the SMA of the first `period` TRs. */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): Array<number | null> {
  const tr = trueRange(highs, lows, closes);
  const out: Array<number | null> = new Array<number | null>(tr.length).fill(null);
  if (tr.length < period || period <= 0) return out;
  let prev = mean(tr.slice(0, period));
  out[period - 1] = prev;
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]!) / period;
    out[i] = prev;
  }
  return out;
}

export interface StochasticResult {
  k: Array<number | null>;
  d: Array<number | null>;
}

/**
 * Stochastic oscillator: %K = 100·(close − lowestLow)/(highestHigh − lowestLow)
 * over `kPeriod`, and %D = SMA(%K, dPeriod). A flat window yields %K = 50.
 */
export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3,
): StochasticResult {
  const hh = rollingMax(highs, kPeriod);
  const ll = rollingMin(lows, kPeriod);
  const k: Array<number | null> = closes.map((c, i) => {
    if (hh[i] === null || ll[i] === null) return null;
    const range = hh[i]! - ll[i]!;
    return range === 0 ? 50 : ((c - ll[i]!) / range) * 100;
  });
  // %D smooths the defined tail of %K.
  const firstDefined = k.findIndex((v) => v !== null);
  const d: Array<number | null> = new Array<number | null>(closes.length).fill(null);
  if (firstDefined !== -1) {
    const compact = k.slice(firstDefined).map((v) => v as number);
    const compactD = sma(compact, dPeriod);
    for (let i = 0; i < compactD.length; i++) d[firstDefined + i] = compactD[i]!;
  }
  return { k, d };
}

/** Williams %R: −100·(highestHigh − close)/(highestHigh − lowestLow) over `period`, in [−100, 0]. */
export function williamsR(highs: number[], lows: number[], closes: number[], period = 14): Array<number | null> {
  const hh = rollingMax(highs, period);
  const ll = rollingMin(lows, period);
  return closes.map((c, i) => {
    if (hh[i] === null || ll[i] === null) return null;
    const range = hh[i]! - ll[i]!;
    return range === 0 ? -50 : ((hh[i]! - c) / range) * -100;
  });
}

/** Typical price (h+l+c)/3 per bar. */
export function typicalPrice(highs: number[], lows: number[], closes: number[]): number[] {
  return highs.map((h, i) => (h + lows[i]! + closes[i]!) / 3);
}

/**
 * Commodity Channel Index: (TP − SMA(TP)) / (0.015 · mean absolute deviation)
 * over `period`. Zero deviation (flat window) yields 0.
 */
export function cci(highs: number[], lows: number[], closes: number[], period = 20): Array<number | null> {
  const tp = typicalPrice(highs, lows, closes);
  const smaTp = sma(tp, period);
  return tp.map((v, i) => {
    if (smaTp[i] === null) return null;
    const window = tp.slice(i - period + 1, i + 1);
    const meanDev = mean(window.map((x) => Math.abs(x - smaTp[i]!)));
    return meanDev === 0 ? 0 : (v - smaTp[i]!) / (0.015 * meanDev);
  });
}

/** On-Balance Volume: running total that adds volume on up-closes, subtracts on down-closes. */
export function obv(closes: number[], volumes: number[]): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i > 0) {
      if (closes[i]! > closes[i - 1]!) total += volumes[i] ?? 0;
      else if (closes[i]! < closes[i - 1]!) total -= volumes[i] ?? 0;
    }
    out.push(total);
  }
  return out;
}

/**
 * Cumulative (anchored) VWAP: running Σ(typicalPrice·volume) / Σvolume from the
 * start of the series. Null until any volume has accumulated.
 */
export function vwap(highs: number[], lows: number[], closes: number[], volumes: number[]): Array<number | null> {
  const tp = typicalPrice(highs, lows, closes);
  const out: Array<number | null> = [];
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < tp.length; i++) {
    const v = volumes[i] ?? 0;
    cumPV += tp[i]! * v;
    cumV += v;
    out.push(cumV === 0 ? null : cumPV / cumV);
  }
  return out;
}

/** Rate of change: 100·(v − v[i−period]) / v[i−period]. */
export function roc(values: number[], period = 12): Array<number | null> {
  return values.map((v, i) => {
    if (i < period) return null;
    const base = values[i - period]!;
    return base === 0 ? null : ((v - base) / base) * 100;
  });
}

/** Momentum: v − v[i−period]. */
export function momentum(values: number[], period = 10): Array<number | null> {
  return values.map((v, i) => (i < period ? null : v - values[i - period]!));
}

export interface AdxResult {
  plusDI: Array<number | null>;
  minusDI: Array<number | null>;
  adx: Array<number | null>;
}

/**
 * Wilder's Directional Movement system: +DI, −DI and ADX over `period`.
 * +DI/−DI measure up/down directional strength; ADX (the smoothed DX) measures
 * trend strength irrespective of direction. All in [0, 100].
 */
export function adx(highs: number[], lows: number[], closes: number[], period = 14): AdxResult {
  const n = highs.length;
  const plusDI: Array<number | null> = new Array<number | null>(n).fill(null);
  const minusDI: Array<number | null> = new Array<number | null>(n).fill(null);
  const adxOut: Array<number | null> = new Array<number | null>(n).fill(null);
  if (n <= period || period <= 0) return { plusDI, minusDI, adx: adxOut };

  const tr: number[] = new Array<number>(n).fill(0);
  const plusDM: number[] = new Array<number>(n).fill(0);
  const minusDM: number[] = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = highs[i]! - highs[i - 1]!;
    const downMove = lows[i - 1]! - lows[i]!;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    const hl = highs[i]! - lows[i]!;
    tr[i] = Math.max(hl, Math.abs(highs[i]! - closes[i - 1]!), Math.abs(lows[i]! - closes[i - 1]!));
  }

  // Wilder-smoothed TR / +DM / −DM, seeded at index `period` with the running sum
  // of bars 1..period, then TR = prevTR − prevTR/period + TR[i].
  let smTR = 0;
  let smPlus = 0;
  let smMinus = 0;
  for (let i = 1; i <= period; i++) {
    smTR += tr[i]!;
    smPlus += plusDM[i]!;
    smMinus += minusDM[i]!;
  }
  const dx: number[] = new Array<number>(n).fill(0);
  for (let i = period; i < n; i++) {
    if (i > period) {
      smTR = smTR - smTR / period + tr[i]!;
      smPlus = smPlus - smPlus / period + plusDM[i]!;
      smMinus = smMinus - smMinus / period + minusDM[i]!;
    }
    const pDI = smTR === 0 ? 0 : (smPlus / smTR) * 100;
    const mDI = smTR === 0 ? 0 : (smMinus / smTR) * 100;
    plusDI[i] = pDI;
    minusDI[i] = mDI;
    const diSum = pDI + mDI;
    dx[i] = diSum === 0 ? 0 : (Math.abs(pDI - mDI) / diSum) * 100;
  }

  // ADX seeds at index 2·period−1 with the mean of the first `period` DX values,
  // then Wilder-smooths.
  const adxStart = 2 * period - 1;
  if (adxStart < n) {
    let prevAdx = mean(dx.slice(period, 2 * period));
    adxOut[adxStart] = prevAdx;
    for (let i = adxStart + 1; i < n; i++) {
      prevAdx = (prevAdx * (period - 1) + dx[i]!) / period;
      adxOut[i] = prevAdx;
    }
  }
  return { plusDI, minusDI, adx: adxOut };
}

export interface IchimokuResult {
  /** Tenkan-sen: (HH + LL) / 2 over the conversion window. */
  conversion: Array<number | null>;
  /** Kijun-sen: (HH + LL) / 2 over the base window. */
  base: Array<number | null>;
  /** Senkou Span A: (conversion + base) / 2, displaced forward. */
  spanA: Array<number | null>;
  /** Senkou Span B: (HH + LL) / 2 over the spanB window, displaced forward. */
  spanB: Array<number | null>;
  /** Chikou Span: close displaced backward. */
  laggingSpan: Array<number | null>;
}

/**
 * Ichimoku Kinkō Hyō. Conversion/base/spanB are Donchian midpoints over their
 * windows; the two spans are displaced forward `displacement` bars (the leading
 * cloud) and the lagging span backward, so the output arrays run `displacement`
 * bars longer than the input to hold the projected cloud.
 */
export function ichimoku(
  highs: number[],
  lows: number[],
  closes: number[],
  opts: { conversion?: number; base?: number; spanB?: number; displacement?: number } = {},
): IchimokuResult {
  const { conversion: convP = 9, base: baseP = 26, spanB: spanBP = 52, displacement = 26 } = opts;
  const n = highs.length;
  const midpoint = (period: number): Array<number | null> => {
    const hh = rollingMax(highs, period);
    const ll = rollingMin(lows, period);
    return hh.map((h, i) => (h !== null && ll[i] !== null ? (h + ll[i]!) / 2 : null));
  };
  const conversion = midpoint(convP);
  const base = midpoint(baseP);
  const spanBBase = midpoint(spanBP);

  const outLen = n + displacement;
  const spanA: Array<number | null> = new Array<number | null>(outLen).fill(null);
  const spanB: Array<number | null> = new Array<number | null>(outLen).fill(null);
  const laggingSpan: Array<number | null> = new Array<number | null>(outLen).fill(null);
  for (let i = 0; i < n; i++) {
    if (conversion[i] !== null && base[i] !== null) spanA[i + displacement] = (conversion[i]! + base[i]!) / 2;
    if (spanBBase[i] !== null) spanB[i + displacement] = spanBBase[i]!;
    if (i - displacement >= 0) laggingSpan[i - displacement] = closes[i]!;
  }
  // Pad the current-bar series to the projected length so all fields align.
  const pad = (a: Array<number | null>): Array<number | null> =>
    a.concat(new Array<number | null>(outLen - a.length).fill(null));
  return { conversion: pad(conversion), base: pad(base), spanA, spanB, laggingSpan };
}
