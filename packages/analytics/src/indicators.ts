export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sample standard deviation (n-1). */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Simple moving average. `null` until enough data points exist. */
export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  if (period <= 0) return values.map(() => null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Exponential moving average, seeded with an SMA. */
export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  if (period <= 0) return values.map(() => null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      let seed = 0;
      for (let j = i - period + 1; j <= i; j++) seed += values[j]!;
      prev = seed / period;
    } else {
      prev = values[i]! * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

/** Wilder's RSI. `null` until enough data points exist. */
export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array<number | null>(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i]! - values[i - 1]!;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i]! - values[i - 1]!;
    const g = change > 0 ? change : 0;
    const l = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
