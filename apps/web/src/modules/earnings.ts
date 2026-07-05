/**
 * Earnings-surprise view logic (pure, unit-testable). The surprise is the
 * reported `actual` versus the consensus `mean`, both as an absolute delta and a
 * percentage of the (magnitude of the) estimate. Returns null — rendered as an
 * em-dash — whenever there's nothing to compare (no actual yet, no estimate, or
 * a zero estimate that would divide to Infinity).
 */
export interface EarningsSurprise {
  abs: number;
  pct: number;
}

export function earningsSurprise(
  actual: number | null | undefined,
  mean: number | null | undefined,
): EarningsSurprise | null {
  if (actual === null || actual === undefined || mean === null || mean === undefined) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(mean) || mean === 0) return null;
  const abs = actual - mean;
  return { abs, pct: (abs / Math.abs(mean)) * 100 };
}
