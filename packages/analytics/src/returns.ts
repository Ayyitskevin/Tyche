import type { Candle } from '@tyche/contracts';

/** Extract the close series from candles. */
export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.c);
}

/**
 * Period-over-period simple returns. Length = values.length - 1.
 * When the prior level is zero or non-finite, the period return is **null**
 * (undefined), never a fabricated 0. Consumers that need a pure number series
 * should use {@link finiteReturns}.
 */
export function simpleReturns(values: number[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const cur = values[i]!;
    if (prev === 0 || !Number.isFinite(prev) || !Number.isFinite(cur)) {
      out.push(null);
      continue;
    }
    const r = (cur - prev) / prev;
    out.push(Number.isFinite(r) ? r : null);
  }
  return out;
}

/** Drop null/non-finite period returns (for pure numeric risk/stat paths). */
export function finiteReturns(returns: Array<number | null | undefined>): number[] {
  return returns.filter((r): r is number => r !== null && r !== undefined && Number.isFinite(r));
}

/**
 * Period-over-period log returns. Null when either level is non-positive or
 * non-finite (log undefined) — never a fabricated 0.
 */
export function logReturns(values: number[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const cur = values[i]!;
    if (!(prev > 0) || !(cur > 0) || !Number.isFinite(prev) || !Number.isFinite(cur)) {
      out.push(null);
      continue;
    }
    const r = Math.log(cur / prev);
    out.push(Number.isFinite(r) ? r : null);
  }
  return out;
}

/**
 * Total return from first to last value, as a fraction (e.g. 0.12 = +12%).
 * Null when history is too short or the first level is zero / non-finite —
 * never a fabricated 0% return.
 */
export function cumulativeReturn(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (first === 0 || !Number.isFinite(first) || !Number.isFinite(last)) return null;
  const r = (last - first) / first;
  return Number.isFinite(r) ? r : null;
}

/**
 * Rebase a series so the first point equals `base` (default 100).
 * Empty result when the first level is zero or non-finite (rebasement undefined).
 */
export function normalizeToBase(values: number[], base = 100): number[] {
  if (values.length === 0) return [];
  const first = values[0]!;
  if (first === 0 || !Number.isFinite(first)) return [];
  return values.map((v) => (v / first) * base);
}
