import type { Candle } from '@tyche/contracts';
import { analyticalMeta, statusFromMetricAvailability, type AnalyticalMeta } from './analyticalMeta';
import { closes, finiteReturns, simpleReturns } from './returns';
import { volatility, maxDrawdown, sharpeRatio } from './risk';

/**
 * Multi-horizon performance & risk snapshot for a single instrument's price
 * history. Trailing total returns are anchored to the LAST candle's date (not the
 * wall clock) so the readout is deterministic and reproducible; risk stats assume
 * daily bars. Every figure is null when the loaded history can't support it — a
 * short series never fabricates a 3-year return. Descriptive analytics over past
 * prices; not predictive and not investment advice.
 *
 * Formula id: `risk.performance.v1`.
 */

export interface TrailingReturn {
  key: string;
  label: string;
  /** Total return over the horizon (fraction), or null when history doesn't reach back that far. */
  return: number | null;
}

export interface PerformanceStats {
  symbol: string;
  /** Date of the most recent candle (the "as of" anchor). */
  asOf: string | null;
  /** Date of the earliest candle in the loaded history. */
  firstDate: string | null;
  lastPrice: number | null;
  trailing: TrailingReturn[];
  /** Annualized volatility (daily→annual); null when <2 return observations. */
  annualizedVolatility: number | null;
  /** Worst peak-to-trough drawdown over the loaded history (negative fraction). */
  maxDrawdown: number | null;
  /** Drawdown from the running peak as of the last candle (≤0). */
  currentDrawdown: number | null;
  /** Annualized Sharpe over the loaded history; null when <2 observations or flat. */
  sharpe: number | null;
  /** Best / worst single-day return in the history. */
  bestDay: number | null;
  worstDay: number | null;
  /** Fraction of days with a positive return; null when no returns. */
  positiveRate: number | null;
  /** Number of candles in the loaded history. */
  observations: number;
  meta: AnalyticalMeta;
}

interface Horizon {
  key: string;
  label: string;
  days?: number;
  months?: number;
  ytd?: boolean;
}

const HORIZONS: Horizon[] = [
  { key: '1W', label: '1 week', days: 7 },
  { key: '1M', label: '1 month', months: 1 },
  { key: '3M', label: '3 months', months: 3 },
  { key: '6M', label: '6 months', months: 6 },
  { key: 'YTD', label: 'Year to date', ytd: true },
  { key: '1Y', label: '1 year', months: 12 },
  { key: '3Y', label: '3 years', months: 36 },
];

/**
 * Subtract whole months from a UTC date, clamping the day to the target month's
 * last day so "1 month before Mar 31" is Feb 28/29 — not the Mar 2/3 that naive
 * `setUTCMonth` produces by overflowing a short month.
 */
function subMonths(anchor: Date, months: number): number {
  const targetIndex = anchor.getUTCMonth() - months;
  const targetYear = anchor.getUTCFullYear() + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(anchor.getUTCDate(), lastDay);
  return Date.UTC(targetYear, targetMonth, day, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds());
}

/** Cutoff timestamp for a calendar-duration horizon, measured back from the anchor. */
function cutoffMs(anchor: Date, h: Horizon): number {
  if (h.days !== undefined) return anchor.getTime() - h.days * 86_400_000;
  if (h.months !== undefined) return subMonths(anchor, h.months);
  return anchor.getTime();
}

const emptyStats = (symbol: string): PerformanceStats => ({
  symbol,
  asOf: null,
  firstDate: null,
  lastPrice: null,
  trailing: HORIZONS.map((h) => ({ key: h.key, label: h.label, return: null })),
  annualizedVolatility: null,
  maxDrawdown: null,
  currentDrawdown: null,
  sharpe: null,
  bestDay: null,
  worstDay: null,
  positiveRate: null,
  observations: 0,
  meta: analyticalMeta({
    formulaId: 'risk.performance.v1',
    status: 'unavailable',
    fieldUnits: {
      lastPrice: 'currency',
      annualizedVolatility: 'ratio',
      maxDrawdown: 'ratio',
      currentDrawdown: 'ratio',
      sharpe: 'dimensionless',
      positiveRate: 'ratio',
    },
    source: 'price history',
    notes: 'Empty candle series',
    value: null,
  }),
});

/**
 * Compute the trailing-return and risk snapshot for a candle series. Candles are
 * sorted ascending by timestamp defensively. Trailing returns use the close at or
 * just before each horizon's cutoff (date-accurate, gap-tolerant); YTD uses the
 * last close of the prior calendar year (null when no prior-year candle exists, so
 * it is never a partial-year proxy). Empty-safe.
 */
export function performanceStats(candles: Candle[], symbol: string, riskFreeRate = 0): PerformanceStats {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const n = sorted.length;
  if (n === 0) return emptyStats(symbol);

  const prices = closes(sorted);
  const lastCandle = sorted[n - 1]!;
  const lastClose = lastCandle.c;
  const anchor = new Date(Date.parse(lastCandle.t));
  const anchorYear = anchor.getUTCFullYear();

  const trailing: TrailingReturn[] = HORIZONS.map((h) => {
    let ref: number | null = null;
    if (h.ytd) {
      for (let i = n - 1; i >= 0; i--) {
        if (new Date(Date.parse(sorted[i]!.t)).getUTCFullYear() < anchorYear) {
          ref = prices[i]!;
          break;
        }
      }
    } else {
      const cut = cutoffMs(anchor, h);
      for (let i = n - 1; i >= 0; i--) {
        if (Date.parse(sorted[i]!.t) <= cut) {
          ref = prices[i]!;
          break;
        }
      }
    }
    const ret = ref !== null && ref !== 0 ? lastClose / ref - 1 : null;
    return { key: h.key, label: h.label, return: ret };
  });

  // Defined period returns only — zero-base steps are null and excluded (unavailable ≠ 0).
  const rets = finiteReturns(simpleReturns(prices));
  let peak = prices[0]!;
  for (const p of prices) if (p > peak) peak = p;
  // Relative drawdown is undefined when the running peak is zero.
  const currentDrawdown = peak === 0 ? null : (lastClose - peak) / peak;

  let bestDay: number | null = null;
  let worstDay: number | null = null;
  let positives = 0;
  for (const r of rets) {
    if (bestDay === null || r > bestDay) bestDay = r;
    if (worstDay === null || r < worstDay) worstDay = r;
    if (r > 0) positives += 1;
  }

  const sharpe = rets.length >= 2 ? sharpeRatio(rets, riskFreeRate) : null;
  const vol = rets.length >= 2 ? volatility(rets) : null;
  const volFinite = vol !== null && Number.isFinite(vol) ? vol : null;
  const positiveRate = rets.length > 0 ? positives / rets.length : null;
  const asOf = lastCandle.t.slice(0, 10);
  // Status tracks skill/path metric availability — flat series with null Sharpe is partial, not estimated.
  const status = statusFromMetricAvailability([volFinite, sharpe, bestDay, positiveRate], {
    successStatus: 'estimated',
  });
  const notes: string[] = ['Trailing returns date-anchored to last candle'];
  if (sharpe === null) notes.push('Sharpe undefined when flat, short, or zero excess vol');
  if (rets.length < 2) notes.push('Fewer than 2 return observations — risk ratios withheld');

  return {
    symbol,
    asOf,
    firstDate: sorted[0]!.t.slice(0, 10),
    lastPrice: lastClose,
    trailing,
    annualizedVolatility: volFinite,
    maxDrawdown: maxDrawdown(prices),
    currentDrawdown,
    sharpe,
    bestDay,
    worstDay,
    positiveRate,
    observations: n,
    meta: analyticalMeta({
      formulaId: 'risk.performance.v1',
      status,
      // Mixed: last price is currency; returns/vol/DD are ratios; Sharpe is dimensionless.
      fieldUnits: {
        lastPrice: 'currency',
        annualizedVolatility: 'ratio',
        maxDrawdown: 'ratio',
        currentDrawdown: 'ratio',
        sharpe: 'dimensionless',
        positiveRate: 'ratio',
      },
      source: 'price history',
      asOf,
      notes: notes.join('; '),
      value: status === 'unavailable' ? null : lastClose,
    }),
  };
}
