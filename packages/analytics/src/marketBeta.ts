import type { Candle } from '@tyche/contracts';
import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';
import { simpleReturns } from './returns';
import { beta as betaOf, correlation as correlationOf } from './portfolioRisk';
import { mean, stddev } from './indicators';

/** Pairwise drop periods where either return is undefined (zero base / non-finite). */
function alignFiniteReturns(rs: Array<number | null>, rb: Array<number | null>): [number[], number[]] {
  const a: number[] = [];
  const b: number[] = [];
  const n = Math.min(rs.length, rb.length);
  for (let i = 0; i < n; i++) {
    const x = rs[i];
    const y = rb[i];
    if (
      x !== null &&
      x !== undefined &&
      y !== null &&
      y !== undefined &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      a.push(x);
      b.push(y);
    }
  }
  return [a, b];
}

/**
 * Market-sensitivity analytics: a symbol's beta, annualized alpha, R², correlation,
 * and up/down capture versus a benchmark, from their DAILY price histories. The two
 * series are aligned on their common trading dates (not just trimmed to equal length),
 * so returns line up correctly even when coverage differs. Every statistic is null
 * when the aligned history is too short or the benchmark is flat — a degenerate input
 * never yields a fabricated 0-beta. Descriptive analytics over past prices; not
 * predictive and not investment advice.
 *
 * Formula id: `risk.market-sensitivity.v1`.
 */

export interface MarketSensitivity {
  symbol: string;
  benchmark: string;
  /** Number of aligned daily-return observations. */
  observations: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Slope of the symbol's returns on the benchmark's. null when <2 obs or the benchmark is flat. */
  beta: number | null;
  /** Annualized alpha (daily intercept × 252). null when beta is null. */
  alpha: number | null;
  /** Coefficient of determination, correlation². */
  rSquared: number | null;
  /** Pearson correlation of daily returns. */
  correlation: number | null;
  /** Mean symbol return ÷ mean benchmark return on benchmark UP days (>1 = outperforms in up markets). */
  upCapture: number | null;
  /** Same on benchmark DOWN days (<1 = falls less than the benchmark). */
  downCapture: number | null;
  meta: AnalyticalMeta;
}

const PERIODS_PER_YEAR = 252;

/** Align two candle series on their common trading dates (ascending); returns paired closes. */
function alignByDate(asset: Candle[], benchmark: Candle[]): { dates: string[]; a: number[]; b: number[] } {
  const bByDate = new Map<string, number>();
  for (const c of benchmark) bByDate.set(c.t.slice(0, 10), c.c);
  const sorted = [...asset].sort((x, y) => Date.parse(x.t) - Date.parse(y.t));
  const dates: string[] = [];
  const a: number[] = [];
  const b: number[] = [];
  const seen = new Set<string>();
  for (const c of sorted) {
    const d = c.t.slice(0, 10);
    if (seen.has(d)) continue;
    const bc = bByDate.get(d);
    if (bc === undefined) continue;
    seen.add(d);
    dates.push(d);
    a.push(c.c);
    b.push(bc);
  }
  return { dates, a, b };
}

/** Capture ratio: mean asset return ÷ mean benchmark return over the days matching `side`. */
function capture(rs: number[], rb: number[], side: 'up' | 'down'): number | null {
  const idx = rb.map((_, i) => i).filter((i) => (side === 'up' ? rb[i]! > 0 : rb[i]! < 0));
  if (idx.length === 0) return null;
  const mb = mean(idx.map((i) => rb[i]!));
  if (mb === 0) return null;
  const ms = mean(idx.map((i) => rs[i]!));
  const r = ms / mb;
  return Number.isFinite(r) ? r : null;
}

/**
 * Compute a symbol's market sensitivity versus a benchmark from their candle series.
 * Empty-safe; beta/alpha/correlation are null when there are fewer than two aligned
 * return observations or the benchmark has zero variance. Educational analytics only.
 */
export function marketSensitivity(
  assetCandles: Candle[],
  benchmarkCandles: Candle[],
  symbol: string,
  benchmark: string,
): MarketSensitivity {
  const { dates, a, b } = alignByDate(assetCandles, benchmarkCandles);
  const [rs, rb] = alignFiniteReturns(simpleReturns(a), simpleReturns(b));
  const n = rs.length;

  const asOf = dates[dates.length - 1] ?? undefined;
  const unavailableMeta = analyticalMeta({
    formulaId: 'risk.market-sensitivity.v1',
    status: 'unavailable',
    units: 'dimensionless',
    source: 'historical prices',
    asOf,
    notes: 'Insufficient aligned history or flat series — stats undefined (not zero)',
    value: null,
  });
  const base: MarketSensitivity = {
    symbol,
    benchmark,
    observations: n,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    beta: null,
    alpha: null,
    rSquared: null,
    correlation: null,
    upCapture: null,
    downCapture: null,
    meta: unavailableMeta,
  };

  // Null the whole bundle when either series is flat: a zero-variance benchmark makes
  // beta undefined, and a zero-variance asset makes correlation/R² undefined (0/0). A
  // degenerate input must render "—", never a fabricated 0.
  if (n < 2 || stddev(rb) === 0 || stddev(rs) === 0) return base;

  const beta = betaOf(rs, rb);
  const corr = correlationOf(rs, rb);
  // portfolioRisk.beta/correlation return null on degenerate inputs (unavailable ≠ 0).
  if (beta === null || corr === null) return base;
  const alphaDaily = mean(rs) - beta * mean(rb);
  return {
    ...base,
    beta,
    alpha: alphaDaily * PERIODS_PER_YEAR,
    rSquared: corr * corr,
    correlation: corr,
    upCapture: capture(rs, rb, 'up'),
    downCapture: capture(rs, rb, 'down'),
    meta: analyticalMeta({
      formulaId: 'risk.market-sensitivity.v1',
      status: 'estimated',
      units: 'dimensionless',
      source: 'historical prices',
      asOf,
      notes: 'Beta/alpha/correlation from date-aligned daily returns',
    }),
  };
}
