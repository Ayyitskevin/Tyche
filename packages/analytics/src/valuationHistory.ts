import type { FinancialStatement, Candle } from '@tyche/contracts';
import { bundlePeriods, lineItem } from './fundamentals';

/**
 * Valuation-multiples history: trailing P/E and P/S at each reported annual fiscal
 * year-end (the reported EPS / sales-per-share against the share price on that date)
 * plus the current multiples, with the historical min/avg/max band. A P/E is null
 * when earnings were zero or negative (the ratio is not meaningful), never a
 * fabricated or negative multiple. Pure and deterministic. Descriptive analytics
 * over reported filings and past prices — not a valuation opinion, not investment
 * advice.
 */

export interface ValuationPoint {
  fiscalDate: string;
  fiscalYear: number | null;
  eps: number | null;
  /** Revenue ÷ shares outstanding. */
  salesPerShare: number | null;
  /** Share price on or just before the fiscal date. */
  price: number | null;
  /** price ÷ eps; null when eps ≤ 0 or an input is missing. */
  pe: number | null;
  /** price ÷ sales-per-share; null when ≤ 0 or an input is missing. */
  ps: number | null;
}

export interface ValuationBand {
  min: number | null;
  avg: number | null;
  max: number | null;
}

export interface ValuationHistory {
  symbol: string;
  /** Per-fiscal-year historical multiples, newest first. */
  points: ValuationPoint[];
  /** Latest close in the loaded price history. */
  currentPrice: number | null;
  /** Latest price ÷ most-recent reported annual EPS (trailing). */
  currentPe: number | null;
  currentPs: number | null;
  /** Min/avg/max of the historical P/E points (excludes the current figure). */
  peBand: ValuationBand;
  psBand: ValuationBand;
}

/** Latest close on or before an ISO date (candles must be ascending); null if none. */
function priceAsOf(ascending: Candle[], isoDate: string): number | null {
  let out: number | null = null;
  for (const c of ascending) {
    if (c.t.slice(0, 10) <= isoDate) out = c.c;
    else break;
  }
  return out;
}

/** Positive ratio a/b, or null when b ≤ 0 or either operand is missing. */
function posRatio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b <= 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

function band(values: number[]): ValuationBand {
  if (values.length === 0) return { min: null, avg: null, max: null };
  let min = values[0]!;
  let max = values[0]!;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, avg: sum / values.length, max };
}

/**
 * Compute the valuation-multiples history from a set of financial statements and a
 * candle series. Only ANNUAL periods are used; each fiscal year's P/E and P/S pair
 * the reported EPS / sales-per-share with the share price on that fiscal date.
 * Empty-safe. Descriptive analytics only; not investment advice.
 */
export function valuationHistory(
  statements: FinancialStatement[],
  candles: Candle[],
  symbol: string,
): ValuationHistory {
  const ascending = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const currentPrice = ascending.length > 0 ? ascending[ascending.length - 1]!.c : null;

  const bundles = bundlePeriods(statements.filter((s) => s.period === 'annual')); // newest-first
  const points: ValuationPoint[] = bundles.map((b) => {
    const eps = lineItem(b.income, 'eps');
    const revenue = lineItem(b.income, 'totalRevenue');
    const shares = lineItem(b.balance, 'sharesOutstanding');
    const salesPerShare = revenue !== null && shares !== null && shares > 0 ? revenue / shares : null;
    const price = priceAsOf(ascending, b.fiscalDate);
    return {
      fiscalDate: b.fiscalDate,
      fiscalYear: b.fiscalYear ?? null,
      eps,
      salesPerShare,
      price,
      pe: posRatio(price, eps),
      ps: posRatio(price, salesPerShare),
    };
  });

  const latestEps = points[0]?.eps ?? null;
  const latestSalesPerShare = points[0]?.salesPerShare ?? null;

  return {
    symbol,
    points,
    currentPrice,
    currentPe: posRatio(currentPrice, latestEps),
    currentPs: posRatio(currentPrice, latestSalesPerShare),
    peBand: band(points.map((p) => p.pe).filter((v): v is number => v !== null)),
    psBand: band(points.map((p) => p.ps).filter((v): v is number => v !== null)),
  };
}
