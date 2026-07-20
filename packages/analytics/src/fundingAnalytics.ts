import type { FundingRate } from '@tyche/contracts';
import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';

/**
 * Carry-regime label derived from the annualized funding rate (% APR). Perp
 * funding is positive when longs pay shorts (crowded longs) and negative when
 * shorts pay longs (crowded shorts / spot-discount). Thresholds are fixed,
 * documented bands — NOT a signal, NOT advice:
 *   rich      ≥ +30% APR   (expensive to hold the perp long)
 *   elevated  +10% … +30%
 *   neutral   −10% … +10%
 *   negative  < −10% APR   (longs are paid to hold)
 *
 * Formula id: `funding.carry.v1`.
 */
export type FundingRegime = 'rich' | 'elevated' | 'neutral' | 'negative';

export interface FundingAnalyticsRow {
  symbol: string;
  venue: string;
  /** Per-interval funding rate as a decimal (0.0001 = 1 basis point). */
  rate: number;
  intervalHours: number;
  /** Funding paid per day in percent: rate × (24/intervalHours) × 100. */
  dailyPct: number;
  /** Simple annualized funding in percent (from the datum). */
  annualizedPct: number;
  /** Perp premium (mark vs index) in basis points; null when mark or index is absent. */
  premiumBps: number | null;
  regime: FundingRegime;
  /** annualizedPct minus the cross-sectional median (percentage points). */
  deviationPct: number;
  /** Percentile rank of annualizedPct within the board, 0–100. */
  percentile: number;
}

export interface FundingAnalytics {
  /** Rows sorted by annualizedPct descending (richest carry first). */
  rows: FundingAnalyticsRow[];
  count: number;
  medianAnnualizedPct: number | null;
  meanAnnualizedPct: number | null;
  /** Population standard deviation of annualizedPct; null when < 2 rows. */
  dispersionPct: number | null;
  /** Fraction of symbols with positive funding (longs pay shorts), 0–1; null when empty. */
  positiveShare: number | null;
  meta: AnalyticalMeta;
}

const RICH_APR = 30;
const ELEVATED_APR = 10;
const NEGATIVE_APR = -10;

function regimeOf(annualizedPct: number): FundingRegime {
  if (annualizedPct >= RICH_APR) return 'rich';
  if (annualizedPct >= ELEVATED_APR) return 'elevated';
  if (annualizedPct < NEGATIVE_APR) return 'negative';
  return 'neutral';
}

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  const mid = n >> 1;
  return n % 2 === 1 ? sortedAsc[mid]! : (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2;
}

/**
 * Cross-sectional analytics over a perpetual-swap funding board (one snapshot
 * per symbol). Descriptive market-structure math only — it computes each perp's
 * daily/annualized carry, its premium/basis, a documented regime label, and how
 * rich its carry is versus the rest of the board. It never fabricates a value:
 * the premium is null when the mark or index price is absent, and every
 * cross-sectional stat degrades to null on empty/degenerate input. Not advice.
 */
export function fundingAnalytics(rates: FundingRate[]): FundingAnalytics {
  const clean = rates.filter(
    (r) => Number.isFinite(r.annualizedPct) && Number.isFinite(r.rate) && r.intervalHours > 0,
  );
  const count = clean.length;
  if (count === 0) {
    return {
      rows: [],
      count: 0,
      medianAnnualizedPct: null,
      meanAnnualizedPct: null,
      dispersionPct: null,
      positiveShare: null,
      meta: analyticalMeta({
        formulaId: 'funding.carry.v1',
        status: 'unavailable',
        units: 'percent',
        source: 'funding rates',
        notes: 'Empty board after filtering non-finite rates',
        value: null,
      }),
    };
  }

  const anns = clean.map((r) => r.annualizedPct);
  const sortedAsc = [...anns].sort((a, b) => a - b);
  const med = median(sortedAsc);
  const mean = anns.reduce((sum, x) => sum + x, 0) / count;
  const dispersion =
    count >= 2 ? Math.sqrt(anns.reduce((sum, x) => sum + (x - mean) ** 2, 0) / count) : null;
  const positiveShare = clean.filter((r) => r.rate > 0).length / count;

  const rows: FundingAnalyticsRow[] = clean.map((r) => {
    const dailyPct = r.rate * (24 / r.intervalHours) * 100;
    const premiumBps =
      r.markPrice !== undefined && r.indexPrice !== undefined && r.indexPrice > 0
        ? ((r.markPrice - r.indexPrice) / r.indexPrice) * 10000
        : null;
    // Percentile: the share of the board with annualized ≤ this row (0–100).
    const leq = sortedAsc.filter((x) => x <= r.annualizedPct).length;
    const percentile = count > 1 ? ((leq - 1) / (count - 1)) * 100 : 50;
    return {
      symbol: r.symbol,
      venue: r.venue,
      rate: r.rate,
      intervalHours: r.intervalHours,
      dailyPct,
      annualizedPct: r.annualizedPct,
      premiumBps,
      regime: regimeOf(r.annualizedPct),
      deviationPct: r.annualizedPct - med,
      percentile,
    };
  });
  rows.sort((a, b) => b.annualizedPct - a.annualizedPct);

  return {
    rows,
    count,
    medianAnnualizedPct: med,
    meanAnnualizedPct: mean,
    dispersionPct: dispersion,
    positiveShare,
    meta: analyticalMeta({
      formulaId: 'funding.carry.v1',
      status: 'estimated',
      units: 'percent',
      source: 'funding rates',
      provider: clean[0]?.venue,
      notes: 'Cross-sectional carry board; regime bands are house thresholds, not advice',
    }),
  };
}
