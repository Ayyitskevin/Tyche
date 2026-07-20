/**
 * Relative-value comps — valuation and profitability multiples for a peer set,
 * so a subject company can be benchmarked against comparable issuers. Pure and
 * dependency-free: every multiple is null wherever an input is missing or a
 * denominator is not positive (a loss-making P/E, negative-equity P/B, or negative
 * EBITDA is "not meaningful", not a misleading number). Educational analytics
 * only — nothing here is investment advice.
 *
 * Formula id: `comps.multiples.v1`.
 */

import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';
import { posDenomRatio } from './validation';

/** Normalized inputs for one company, drawn from its latest annual filing + master. */
export interface CompFinancials {
  symbol: string;
  marketCap: number | null;
  /** Latest annual revenue; `priorRevenue` is the year before, for growth. */
  revenue: number | null;
  priorRevenue: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
  grossProfit: number | null;
  depreciationAmortization: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  cash: number | null;
  freeCashFlow: number | null;
}

/** Computed multiples for one company. Margins / yield / growth are decimals. */
export interface CompRow {
  symbol: string;
  marketCap: number | null;
  enterpriseValue: number | null;
  pe: number | null;
  ps: number | null;
  pb: number | null;
  evEbitda: number | null;
  evSales: number | null;
  fcfYield: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  revenueGrowth: number | null;
  meta: AnalyticalMeta;
}

/** Compute the multiples for a single company. */
export function compMultiples(f: CompFinancials): CompRow {
  const enterpriseValue =
    f.marketCap === null ? null : f.marketCap + (f.totalDebt ?? 0) - (f.cash ?? 0);
  const ebitda = f.operatingIncome === null ? null : f.operatingIncome + (f.depreciationAmortization ?? 0);
  const revenueGrowth =
    f.revenue !== null && f.priorRevenue !== null && f.priorRevenue > 0
      ? f.revenue / f.priorRevenue - 1
      : null;
  const pe = posDenomRatio(f.marketCap, f.netIncome);
  const anyMultiple =
    pe !== null ||
    posDenomRatio(f.marketCap, f.revenue) !== null ||
    posDenomRatio(enterpriseValue, ebitda) !== null;
  return {
    symbol: f.symbol,
    marketCap: f.marketCap,
    enterpriseValue,
    pe,
    ps: posDenomRatio(f.marketCap, f.revenue),
    pb: posDenomRatio(f.marketCap, f.totalEquity),
    evEbitda: posDenomRatio(enterpriseValue, ebitda),
    evSales: posDenomRatio(enterpriseValue, f.revenue),
    fcfYield: posDenomRatio(f.freeCashFlow, f.marketCap),
    grossMargin: posDenomRatio(f.grossProfit, f.revenue),
    operatingMargin: posDenomRatio(f.operatingIncome, f.revenue),
    netMargin: posDenomRatio(f.netIncome, f.revenue),
    revenueGrowth,
    meta: analyticalMeta({
      formulaId: 'comps.multiples.v1',
      status: anyMultiple ? 'estimated' : 'unavailable',
      units: 'ratio',
      source: 'market cap + financial statements',
      notes: anyMultiple
        ? 'Multiples null when denominator not strictly positive'
        : 'No positive denominators — all multiples unavailable',
    }),
  };
}

/** Median of a list, ignoring non-finite values; null when empty. */
export function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** Per-metric medians across a set of comp rows (nulls dropped before the median). */
export type PeerMedians = Omit<CompRow, 'symbol' | 'marketCap' | 'enterpriseValue' | 'meta'>;

export function peerMedians(rows: CompRow[]): PeerMedians {
  const col = (sel: (r: CompRow) => number | null): number | null =>
    median(rows.map(sel).filter((v): v is number => v !== null));
  return {
    pe: col((r) => r.pe),
    ps: col((r) => r.ps),
    pb: col((r) => r.pb),
    evEbitda: col((r) => r.evEbitda),
    evSales: col((r) => r.evSales),
    fcfYield: col((r) => r.fcfYield),
    grossMargin: col((r) => r.grossMargin),
    operatingMargin: col((r) => r.operatingMargin),
    netMargin: col((r) => r.netMargin),
    revenueGrowth: col((r) => r.revenueGrowth),
  };
}

/** Premium (+) / discount (−) of a value to a reference, as a decimal; null-safe. */
export function premiumToPeers(value: number | null, reference: number | null): number | null {
  if (value === null || reference === null || !(reference > 0)) return null;
  const p = value / reference - 1;
  return Number.isFinite(p) ? p : null;
}
