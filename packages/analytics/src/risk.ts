import type { Candle } from '@tyche/contracts';
import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';
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
    const dd = peak === 0 ? 0 : (v - peak) / peak;
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

/** Convenience bundle of headline stats for a candle series. */
export function seriesStats(candles: Candle[], riskFreeRate = 0): SeriesStats {
  const prices = closes(candles);
  const returns = simpleReturns(prices);
  const totalReturn =
    prices.length >= 2 && prices[0]! !== 0
      ? (prices[prices.length - 1]! - prices[0]!) / prices[0]!
      : prices.length < 2
        ? null
        : 0;
  const sharpe = sharpeRatio(returns, riskFreeRate);
  const vol = returns.length >= 2 ? volatility(returns) : null;
  return {
    totalReturn,
    annualizedVolatility: vol,
    maxDrawdown: maxDrawdown(prices),
    sharpe,
    meta: analyticalMeta({
      formulaId: 'risk.series-stats.v1',
      status: returns.length < 2 ? 'unavailable' : 'estimated',
      units: 'ratio',
      source: 'price history',
      notes: 'Headline total return / vol / drawdown / Sharpe bundle',
      value: sharpe,
    }),
  };
}
