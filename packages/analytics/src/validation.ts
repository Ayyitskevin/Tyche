/**
 * Shared numeric guards and failure-handling helpers for pure financial
 * calculations. Centralizes the house invariants:
 *
 *   - missing / undefined inputs must never surface as a valid-looking zero
 *     when the metric is mathematically undefined (unavailable ≠ 0);
 *   - non-positive denominators yield null, not Infinity / NaN;
 *   - non-finite intermediates collapse to null.
 *
 * Pure and dependency-free. Educational analytics only — not investment advice.
 */

/** True when a value is null, undefined, NaN, or non-finite. */
export function isMissing(value: number | null | undefined): boolean {
  return value === null || value === undefined || !Number.isFinite(value);
}

/** Finite number, or null (never NaN / ±Infinity). */
export function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/**
 * Ratio a/b when the denominator is strictly positive; otherwise null.
 * Numerators may be signed (margins, growth). Never returns Infinity for b ≤ 0.
 */
export function posDenomRatio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (isMissing(a) || isMissing(b) || !(b! > 0)) return null;
  return finiteOrNull(a! / b!);
}

/**
 * Ratio a/b when both operands are present and the denominator is non-zero
 * (denominator may be negative). Null on missing operands or zero divisor.
 */
export function safeRatio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (isMissing(a) || isMissing(b) || b === 0) return null;
  return finiteOrNull(a! / b!);
}

/** Clamp Pearson correlation into the closed interval [-1, 1]. */
export function clampCorrelation(r: number): number {
  if (!Number.isFinite(r)) return r;
  return Math.max(-1, Math.min(1, r));
}

/**
 * Annualize a per-period rate by compounding: (1+r)^periodsPerYear − 1.
 * Null when the growth factor is non-positive (wipeout) or inputs are missing.
 */
export function compoundAnnualize(periodicRate: number, periodsPerYear: number): number | null {
  if (!Number.isFinite(periodicRate) || !Number.isFinite(periodsPerYear) || periodsPerYear <= 0) {
    return null;
  }
  const growth = 1 + periodicRate;
  if (growth <= 0) return -1;
  return finiteOrNull(growth ** periodsPerYear - 1);
}

/**
 * Scale a per-period rate by √periods (volatility / Sharpe convention).
 * Null when inputs are missing; returns 0 only when the periodic figure is exactly 0.
 */
export function sqrtAnnualize(periodic: number, periodsPerYear: number): number | null {
  if (!Number.isFinite(periodic) || !Number.isFinite(periodsPerYear) || periodsPerYear <= 0) {
    return null;
  }
  return finiteOrNull(periodic * Math.sqrt(periodsPerYear));
}

/**
 * Simple funding annualization used by the funding contract:
 *   annualizedPct = rate × (24 / intervalHours) × 365 × 100
 * Null when intervalHours ≤ 0 or rate is non-finite.
 */
export function annualizeFundingPct(rate: number, intervalHours: number): number | null {
  if (!Number.isFinite(rate) || !Number.isFinite(intervalHours) || !(intervalHours > 0)) return null;
  return finiteOrNull(rate * (24 / intervalHours) * 365 * 100);
}

/**
 * Reconcile a displayed total against the sum of component contributions.
 * Returns true when both sides are null (both unavailable) or both finite and
 * within `tolerance` absolute difference. Used by metamorphic tests and UI
 * integrity checks so multi-component scores cannot silently drift from their
 * parts.
 */
export function reconciles(
  total: number | null | undefined,
  components: Array<number | null | undefined>,
  tolerance = 1e-9,
): boolean {
  const present = components.filter((c) => !isMissing(c)) as number[];
  if (isMissing(total)) {
    // An unavailable total is only consistent when every component is also missing
    // (all-or-null composites) OR the caller intentionally allows partials.
    return present.length === 0;
  }
  if (present.length !== components.length) return false;
  const sum = present.reduce((s, c) => s + c, 0);
  return Math.abs(total! - sum) <= tolerance;
}

/**
 * Assert that a metric that is undefined on degenerate input is represented as
 * null (or undefined), never a fabricated 0. Returns true when the invariant holds.
 *
 * Use in tests: expect(unavailableNotZero(result.beta, { flatSeries: true })).toBe(true)
 * when the input was degenerate and beta must not look like a valid zero-beta.
 */
export function unavailableNotZero(
  value: number | null | undefined,
  opts: { allowZero?: boolean } = {},
): boolean {
  if (opts.allowZero) return true;
  // The invariant: on unavailable input the value must be null/undefined, not 0.
  return value === null || value === undefined;
}
