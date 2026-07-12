import type { EconomicObservation } from '@tyche/contracts';

/**
 * Pure helpers for the Treasury yield curve (YCRV). Each constant-maturity tenor is
 * a FRED `DGS*` series; the curve is assembled by reading each series' value "as of"
 * a target date. Frequency-agnostic and null-safe. Descriptive market data only —
 * nothing here is investment advice.
 */

export interface Tenor {
  /** FRED constant-maturity series id. */
  id: string;
  /** Short axis/table label. */
  label: string;
  /** Maturity in years (for the x-axis / spread lookups). */
  years: number;
}

/** The Treasury constant-maturity curve, short → long. */
export const TREASURY_TENORS: Tenor[] = [
  { id: 'DGS1MO', label: '1M', years: 1 / 12 },
  { id: 'DGS3MO', label: '3M', years: 0.25 },
  { id: 'DGS6MO', label: '6M', years: 0.5 },
  { id: 'DGS1', label: '1Y', years: 1 },
  { id: 'DGS2', label: '2Y', years: 2 },
  { id: 'DGS3', label: '3Y', years: 3 },
  { id: 'DGS5', label: '5Y', years: 5 },
  { id: 'DGS7', label: '7Y', years: 7 },
  { id: 'DGS10', label: '10Y', years: 10 },
  { id: 'DGS20', label: '20Y', years: 20 },
  { id: 'DGS30', label: '30Y', years: 30 },
];

/** As-of snapshots the module overlays for curve comparison. */
export const CURVE_ASOF = [
  { key: 'now', label: 'Today', daysAgo: 0 },
  { key: 'month', label: '1M ago', daysAgo: 30 },
  { key: 'year', label: '1Y ago', daysAgo: 365 },
] as const;
export type CurveAsOfKey = (typeof CURVE_ASOF)[number]['key'];

const DAY_MS = 86_400_000;

function toMs(date: string): number {
  return Date.parse(date.includes('T') ? date : `${date}T00:00:00.000Z`);
}

/**
 * The valued observation as of a target date: the latest one dated on or before the
 * target, or — when the target precedes the series — the earliest valued point.
 * Null observations are skipped. Assumes observations are ordered oldest → newest.
 */
export function asOfYield(observations: EconomicObservation[], targetMs: number): number | null {
  let chosen: number | null = null;
  let firstValued: number | null = null;
  for (const o of observations) {
    if (o.value === null) continue;
    if (firstValued === null) firstValued = o.value;
    if (toMs(o.date) <= targetMs) chosen = o.value;
    else break; // ordered — nothing further is on-or-before the target
  }
  return chosen ?? firstValued;
}

export interface CurvePoint extends Tenor {
  yield: number | null;
}

/** Build a curve by reading each tenor's series as of `targetMs`. */
export function buildCurve(
  seriesByTenor: Map<string, EconomicObservation[]>,
  targetMs: number,
): CurvePoint[] {
  return TREASURY_TENORS.map((t) => {
    const obs = seriesByTenor.get(t.id);
    return { ...t, yield: obs ? asOfYield(obs, targetMs) : null };
  });
}

/** Spread (long − short) between two tenors on a curve, in the curve's units (pp). */
export function curveSpread(curve: CurvePoint[], shortId: string, longId: string): number | null {
  const short = curve.find((p) => p.id === shortId)?.yield ?? null;
  const long = curve.find((p) => p.id === longId)?.yield ?? null;
  if (short === null || long === null) return null;
  const s = long - short;
  return Number.isFinite(s) ? s : null;
}

/** Headline spreads with the sign convention used for inversion (negative = inverted). */
export const KEY_SPREADS = [
  { key: '2s10s', label: '2s10s', shortId: 'DGS2', longId: 'DGS10' },
  { key: '3m10y', label: '3m10y', shortId: 'DGS3MO', longId: 'DGS10' },
  { key: '5s30s', label: '5s30s', shortId: 'DGS5', longId: 'DGS30' },
] as const;

/** True when the target date is `daysAgo` before `now` (both epoch ms). */
export function asOfTargetMs(nowMs: number, daysAgo: number): number {
  return nowMs - daysAgo * DAY_MS;
}
