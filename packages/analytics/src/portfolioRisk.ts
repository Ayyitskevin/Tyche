import { mean, stddev } from './indicators';
import { historicalVar, maxDrawdown, sharpeRatio, volatility } from './risk';

/**
 * Multi-asset & benchmark-relative portfolio risk analytics. Pure and
 * dependency-free: every function takes aligned periodic RETURN series (same
 * length, same dates — the caller aligns by date). Educational analytics only —
 * nothing here is investment advice, and there is no notion of placing a trade.
 *
 * Ratios that divide covariance by variance (beta, correlation) use the sample
 * convention consistently in numerator and denominator, so the divisor cancels
 * and the result is convention-independent.
 */

/** Trim two series to their common length, aligned at the most-recent end. */
function align(a: number[], b: number[]): [number[], number[]] {
  const n = Math.min(a.length, b.length);
  return [a.slice(a.length - n), b.slice(b.length - n)];
}

/**
 * Sample covariance of two series (aligned at the end).
 * Null when fewer than 2 points — covariance is undefined, not zero.
 */
export function covariance(a: number[], b: number[]): number | null {
  const [x, y] = align(a, b);
  if (x.length < 2) return null;
  const mx = mean(x);
  const my = mean(y);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += (x[i]! - mx) * (y[i]! - my);
  return sum / (x.length - 1);
}

/**
 * Pearson correlation in [-1, 1].
 * Null when either series is flat or has fewer than 2 points — unavailable ≠ 0.
 */
export function correlation(a: number[], b: number[]): number | null {
  const [x, y] = align(a, b);
  if (x.length < 2) return null;
  const sx = stddev(x);
  const sy = stddev(y);
  if (sx === 0 || sy === 0) return null;
  const cov = covariance(x, y);
  if (cov === null) return null;
  const r = cov / (sx * sy);
  // Guard tiny floating-point overshoot beyond ±1.
  return Math.max(-1, Math.min(1, r));
}

/**
 * Beta of an asset vs a benchmark = cov(asset, benchmark) / var(benchmark).
 * Null when the benchmark is flat or history is too short — unavailable ≠ 0.
 */
export function beta(asset: number[], benchmark: number[]): number | null {
  const [a, b] = align(asset, benchmark);
  if (a.length < 2) return null;
  const varB = stddev(b) ** 2;
  if (varB === 0) return null;
  const cov = covariance(a, b);
  if (cov === null) return null;
  return cov / varB;
}

/**
 * Pairwise correlation matrix over N return series (each aligned pairwise).
 * `out[i][j]` is corr(series[i], series[j]); the diagonal is 1 for non-flat
 * series and null for a flat one (stddev is 0 — unavailable, not a zero correlation).
 */
export function correlationMatrix(series: number[][]): (number | null)[][] {
  return series.map((si) =>
    series.map((sj) => (si === sj ? (stddev(si) === 0 ? null : 1) : correlation(si, sj))),
  );
}

/**
 * Downside deviation: RMS of shortfalls below the per-period minimum acceptable
 * return `mar`, counting non-shortfall periods as zero (target semivariance, /N).
 */
export function downsideDeviation(returns: number[], mar = 0): number {
  if (returns.length === 0) return 0;
  let sum = 0;
  for (const r of returns) {
    const shortfall = Math.min(0, r - mar);
    sum += shortfall * shortfall;
  }
  return Math.sqrt(sum / returns.length);
}

/**
 * Annualized Sortino ratio: excess mean return over `mar` per downside
 * deviation, scaled by √periods. 0 when there is no downside (dd = 0).
 */
export function sortinoRatio(returns: number[], mar = 0, periodsPerYear = 252): number {
  if (returns.length < 2) return 0;
  const dd = downsideDeviation(returns, mar);
  if (dd === 0) return 0;
  return ((mean(returns) - mar) / dd) * Math.sqrt(periodsPerYear);
}

/** Annualized geometric (compound) return from a periodic return series. */
export function annualizedReturn(returns: number[], periodsPerYear = 252): number {
  if (returns.length === 0) return 0;
  let growth = 1;
  for (const r of returns) growth *= 1 + r;
  if (growth <= 0) return -1; // total wipeout
  return growth ** (periodsPerYear / returns.length) - 1;
}

/** Equity curve (cumulative growth of $1) implied by a return series. */
export function equityCurve(returns: number[], start = 1): number[] {
  const out: number[] = [];
  let v = start;
  for (const r of returns) {
    v *= 1 + r;
    out.push(v);
  }
  return out;
}

/**
 * Calmar ratio: annualized return ÷ |maximum drawdown| of the implied equity
 * curve. 0 when there is no drawdown.
 */
export function calmarRatio(returns: number[], periodsPerYear = 252): number {
  if (returns.length < 2) return 0;
  const dd = Math.abs(maxDrawdown(equityCurve(returns)));
  if (dd === 0) return 0;
  return annualizedReturn(returns, periodsPerYear) / dd;
}

/** Active returns (asset − benchmark), aligned at the most-recent end. */
export function activeReturns(asset: number[], benchmark: number[]): number[] {
  const [a, b] = align(asset, benchmark);
  return a.map((v, i) => v - b[i]!);
}

/** Annualized tracking error: √periods × stddev of the active (asset − benchmark) return. */
export function trackingError(asset: number[], benchmark: number[], periodsPerYear = 252): number {
  return volatility(activeReturns(asset, benchmark), periodsPerYear);
}

/**
 * Information ratio: annualized mean active return ÷ annualized tracking error.
 * 0 when the tracking error is 0.
 */
export function informationRatio(asset: number[], benchmark: number[], periodsPerYear = 252): number {
  const active = activeReturns(asset, benchmark);
  if (active.length < 2) return 0;
  const te = stddev(active);
  if (te === 0) return 0;
  return (mean(active) / te) * Math.sqrt(periodsPerYear);
}

/**
 * Weighted portfolio return series from per-asset return series and weights.
 * Series are aligned at the most-recent end to the shortest asset history, so a
 * newly-added holding with less history shortens the window rather than erroring.
 * Weights are used as given (caller supplies fractions summing to ~1).
 */
export function portfolioReturns(weights: number[], returnsByAsset: number[][]): number[] {
  if (returnsByAsset.length === 0) return [];
  const n = Math.min(...returnsByAsset.map((s) => s.length));
  if (n === 0) return [];
  const aligned = returnsByAsset.map((s) => s.slice(s.length - n));
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    let r = 0;
    for (let i = 0; i < aligned.length; i++) r += (weights[i] ?? 0) * aligned[i]![t]!;
    out.push(r);
  }
  return out;
}

export interface PortfolioRiskStats {
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDrawdown: number;
  /** Historical 1-period VaR at `confidence` (a negative return, e.g. -0.031). */
  valueAtRisk: number;
  /** Beta vs the benchmark; null when no benchmark series was supplied. */
  beta: number | null;
  /** Annualized tracking error vs the benchmark; null without a benchmark. */
  trackingError: number | null;
  /** Information ratio vs the benchmark; null without a benchmark. */
  informationRatio: number | null;
}

/**
 * Headline risk bundle for a portfolio's own return series, optionally relative
 * to a benchmark. Benchmark-relative fields are null when no benchmark is given.
 */
export function portfolioRiskStats(
  returns: number[],
  benchmark: number[] | null = null,
  opts: { riskFreeRate?: number; mar?: number; periodsPerYear?: number; confidence?: number } = {},
): PortfolioRiskStats {
  const { riskFreeRate = 0, mar = 0, periodsPerYear = 252, confidence = 0.95 } = opts;
  const hasBench = benchmark !== null && benchmark.length >= 2;
  return {
    annualizedReturn: annualizedReturn(returns, periodsPerYear),
    annualizedVolatility: volatility(returns, periodsPerYear),
    sharpe: sharpeRatio(returns, riskFreeRate, periodsPerYear),
    sortino: sortinoRatio(returns, mar, periodsPerYear),
    calmar: calmarRatio(returns, periodsPerYear),
    maxDrawdown: maxDrawdown(equityCurve(returns)),
    valueAtRisk: historicalVar(returns, confidence),
    beta: hasBench ? beta(returns, benchmark) : null,
    trackingError: hasBench ? trackingError(returns, benchmark, periodsPerYear) : null,
    informationRatio: hasBench ? informationRatio(returns, benchmark, periodsPerYear) : null,
  };
}
