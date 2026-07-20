import type { Candle } from '@tyche/contracts';
import { analyticalMeta, statusFromMetricAvailability, type AnalyticalMeta } from './analyticalMeta';
import { closes, simpleReturns } from './returns';
import { mean, stddev } from './indicators';

/**
 * Risk primitives. Degenerate inputs that make a ratio undefined return `null`
 * (unavailable ≠ 0). Empty max-drawdown / VaR use 0 only where the empty-path
 * value is a true empty aggregate (no path / no observations), not a ratio.
 * Formula ids: risk.sharpe.v1, risk.series-stats.v1.
 */

/** Annualized volatility from a return series. */
export function volatility(returns: number[], periodsPerYear = 252): number {
  return stddev(returns) * Math.sqrt(periodsPerYear);
}

/** Maximum drawdown of a price/value series, as a negative fraction. */
export function maxDrawdown(values: number[]): number {
  if (values.length === 0) return 0;
  let peak = values[0]!;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    // Peak at zero makes relative drawdown undefined — skip that step (keep prior worst).
    if (peak === 0) continue;
    const dd = (v - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/**
 * Annualized Sharpe ratio. `riskFreeRate` is the annual rate (e.g. 0.04).
 * Null when fewer than 2 returns or excess-return volatility is zero —
 * Sharpe is undefined there, never a fabricated 0.
 */
export function sharpeRatio(returns: number[], riskFreeRate = 0, periodsPerYear = 252): number | null {
  if (returns.length < 2) return null;
  const excess = returns.map((r) => r - riskFreeRate / periodsPerYear);
  const sd = stddev(excess);
  if (sd === 0) return null;
  const s = (mean(excess) / sd) * Math.sqrt(periodsPerYear);
  return Number.isFinite(s) ? s : null;
}

/** Historical Value-at-Risk: the return at the (1 - confidence) quantile. */
export function historicalVar(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((1 - confidence) * sorted.length), sorted.length - 1);
  return sorted[idx]!;
}

export interface SeriesStats {
  totalReturn: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number;
  sharpe: number | null;
  meta: AnalyticalMeta;
}

/**
 * Total simple return first→last. Null when history is too short or the first
 * price is zero (division undefined) — never a fabricated 0 return.
 */
export function totalReturnOf(prices: number[]): number | null {
  if (prices.length < 2) return null;
  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  if (!(first !== 0) || !Number.isFinite(first) || !Number.isFinite(last)) return null;
  const r = (last - first) / first;
  return Number.isFinite(r) ? r : null;
}

/** Convenience bundle of headline stats for a candle series. */
export function seriesStats(candles: Candle[], riskFreeRate = 0): SeriesStats {
  const prices = closes(candles);
  const returns = simpleReturns(prices);
  const totalReturn = totalReturnOf(prices);
  const sharpe = sharpeRatio(returns, riskFreeRate);
  const vol = returns.length >= 2 ? volatility(returns) : null;
  const volFinite = vol !== null && Number.isFinite(vol) ? vol : null;
  const dd = maxDrawdown(prices);

  // Status must agree with metric availability: null skill metrics → not plain "estimated".
  const status = statusFromMetricAvailability([totalReturn, volFinite, sharpe], {
    successStatus: 'estimated',
  });

  const notes: string[] = ['Headline total return / vol / drawdown / Sharpe bundle'];
  if (totalReturn === null && prices.length >= 2) {
    notes.push('totalReturn undefined: first price is zero or non-finite (not a 0% return)');
  }
  if (sharpe === null && returns.length >= 2) {
    notes.push('Sharpe undefined: flat or zero excess volatility');
  }

  return {
    totalReturn,
    annualizedVolatility: volFinite,
    maxDrawdown: dd,
    sharpe,
    meta: analyticalMeta({
      formulaId: 'risk.series-stats.v1',
      status,
      // Mixed bundle: do not claim a single shared unit for return/vol/DD/Sharpe.
      fieldUnits: {
        totalReturn: 'ratio',
        annualizedVolatility: 'ratio',
        maxDrawdown: 'ratio',
        sharpe: 'dimensionless',
      },
      source: 'price history',
      notes: notes.join('; '),
      // Prefer partial/unavailable status over forcing unavailable solely from null sharpe.
      value: status === 'unavailable' ? null : totalReturn ?? sharpe ?? 1,
    }),
  };
}
