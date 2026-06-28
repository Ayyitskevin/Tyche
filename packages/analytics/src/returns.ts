import type { Candle } from '@tyche/contracts';

/** Extract the close series from candles. */
export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.c);
}

/** Period-over-period simple returns. Length = values.length - 1. */
export function simpleReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    out.push(prev === 0 ? 0 : (values[i]! - prev) / prev);
  }
  return out;
}

/** Period-over-period log returns. */
export function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const cur = values[i]!;
    out.push(prev > 0 && cur > 0 ? Math.log(cur / prev) : 0);
  }
  return out;
}

/** Total return from first to last value, as a fraction (e.g. 0.12 = +12%). */
export function cumulativeReturn(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  return first === 0 ? 0 : (last - first) / first;
}

/** Rebase a series so the first point equals `base` (default 100). */
export function normalizeToBase(values: number[], base = 100): number[] {
  if (values.length === 0) return [];
  const first = values[0]!;
  if (first === 0) return values.map(() => base);
  return values.map((v) => (v / first) * base);
}
