import type { FinancialStatement } from '@tyche/contracts';

/**
 * Derived fundamental analytics — margins, returns, leverage and growth computed
 * from normalized financial-statement line items. Pure and dependency-free: every
 * function takes the contract's FinancialStatement shape and returns null wherever
 * an input line item is missing or a denominator is zero, so a sparse statement set
 * degrades gracefully rather than throwing or surfacing Infinity/NaN. Educational
 * analytics only — nothing here is investment advice.
 */

/** Read a line-item value by key from a statement, or null when absent/non-finite. */
export function lineItem(statement: FinancialStatement | undefined, key: string): number | null {
  if (!statement) return null;
  const item = statement.lineItems.find((li) => li.key === key);
  return item && typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : null;
}

/**
 * Null-safe ratio a / b: null when either operand is null or the denominator is
 * zero, so margins and returns never divide by zero or surface Infinity/NaN.
 */
export function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

/**
 * One fiscal period's statements grouped together. Statements of all three types
 * that share a fiscalDate collapse into a single bundle; any type may be absent.
 */
export interface PeriodBundle {
  fiscalDate: string;
  fiscalYear?: number;
  fiscalQuarter?: number;
  income?: FinancialStatement;
  balance?: FinancialStatement;
  cashFlow?: FinancialStatement;
}

/**
 * Group statements of all types by fiscal date into per-period bundles, sorted
 * newest-first. Statements sharing a fiscalDate merge into one bundle; the
 * fiscalYear/quarter come from whichever statement carries them.
 */
export function bundlePeriods(statements: FinancialStatement[]): PeriodBundle[] {
  const byDate = new Map<string, PeriodBundle>();
  for (const s of statements) {
    let bundle = byDate.get(s.fiscalDate);
    if (!bundle) {
      bundle = { fiscalDate: s.fiscalDate };
      byDate.set(s.fiscalDate, bundle);
    }
    if (s.fiscalYear !== undefined) bundle.fiscalYear = s.fiscalYear;
    if (s.fiscalQuarter !== undefined) bundle.fiscalQuarter = s.fiscalQuarter;
    if (s.type === 'income') bundle.income = s;
    else if (s.type === 'balance') bundle.balance = s;
    else if (s.type === 'cash_flow') bundle.cashFlow = s;
  }
  return [...byDate.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
}

/** Profitability, efficiency and leverage ratios for a single period. */
export interface FinancialRatios {
  /** grossProfit / revenue */
  grossMargin: number | null;
  /** operatingIncome / revenue */
  operatingMargin: number | null;
  /** netIncome / revenue */
  netMargin: number | null;
  /** freeCashFlow / revenue */
  fcfMargin: number | null;
  /** netIncome / totalAssets */
  returnOnAssets: number | null;
  /** netIncome / totalEquity */
  returnOnEquity: number | null;
  /** totalDebt / totalEquity */
  debtToEquity: number | null;
  /** totalDebt / totalAssets */
  debtToAssets: number | null;
  /** revenue / totalAssets */
  assetTurnover: number | null;
}

/**
 * Compute the ratio bundle for one period from its income/balance/cash-flow line
 * items. Each ratio is null when a required line item is absent, so a period that
 * only reports an income statement still yields the margins it can support.
 */
export function financialRatios(bundle: PeriodBundle): FinancialRatios {
  const revenue = lineItem(bundle.income, 'totalRevenue');
  const grossProfit = lineItem(bundle.income, 'grossProfit');
  const operatingIncome = lineItem(bundle.income, 'operatingIncome');
  const netIncome = lineItem(bundle.income, 'netIncome');
  const fcf = lineItem(bundle.cashFlow, 'freeCashFlow');
  const totalAssets = lineItem(bundle.balance, 'totalAssets');
  const totalEquity = lineItem(bundle.balance, 'totalEquity');
  const totalDebt = lineItem(bundle.balance, 'totalDebt');
  return {
    grossMargin: ratio(grossProfit, revenue),
    operatingMargin: ratio(operatingIncome, revenue),
    netMargin: ratio(netIncome, revenue),
    fcfMargin: ratio(fcf, revenue),
    returnOnAssets: ratio(netIncome, totalAssets),
    returnOnEquity: ratio(netIncome, totalEquity),
    debtToEquity: ratio(totalDebt, totalEquity),
    debtToAssets: ratio(totalDebt, totalAssets),
    assetTurnover: ratio(revenue, totalAssets),
  };
}

/**
 * Period-over-period growth (current − prior) / |prior|. Null when either operand
 * is null or the base is zero. Dividing by |prior| keeps the sign pointing in the
 * direction of change even when the base is negative.
 */
export function growth(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  const g = (current - prior) / Math.abs(prior);
  return Number.isFinite(g) ? g : null;
}
