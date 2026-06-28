import type { Candle } from '@tyche/contracts';
import { closes, simpleReturns } from './returns';
import { mean, stddev } from './indicators';

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

/** Annualized Sharpe ratio. `riskFreeRate` is the annual rate (e.g. 0.04). */
export function sharpeRatio(returns: number[], riskFreeRate = 0, periodsPerYear = 252): number {
  if (returns.length < 2) return 0;
  const excess = returns.map((r) => r - riskFreeRate / periodsPerYear);
  const sd = stddev(excess);
  if (sd === 0) return 0;
  return (mean(excess) / sd) * Math.sqrt(periodsPerYear);
}

/** Historical Value-at-Risk: the return at the (1 - confidence) quantile. */
export function historicalVar(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((1 - confidence) * sorted.length), sorted.length - 1);
  return sorted[idx]!;
}

export interface SeriesStats {
  totalReturn: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  sharpe: number;
}

/** Convenience bundle of headline stats for a candle series. */
export function seriesStats(candles: Candle[], riskFreeRate = 0): SeriesStats {
  const prices = closes(candles);
  const returns = simpleReturns(prices);
  const totalReturn =
    prices.length >= 2 && prices[0]! !== 0
      ? (prices[prices.length - 1]! - prices[0]!) / prices[0]!
      : 0;
  return {
    totalReturn,
    annualizedVolatility: volatility(returns),
    maxDrawdown: maxDrawdown(prices),
    sharpe: sharpeRatio(returns, riskFreeRate),
  };
}
