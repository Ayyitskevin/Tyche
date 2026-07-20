/**
 * Cost of capital — CAPM cost of equity and the weighted-average cost of capital
 * (WACC). Pure and dependency-free; the WACC weights are null when total capital is
 * not positive, so a degenerate capital structure degrades gracefully rather than
 * dividing by zero. Rates are decimals (0.09 = 9%). Educational analytics only —
 * nothing here is investment advice.
 *
 * Formula ids: `capm.cost-of-equity.v1`, `capm.wacc.v1` (see formulas.ts).
 */

import { analyticalMeta, annotate, type AnalyticalMeta, type AnalyticalResult } from './analyticalMeta';

export interface CapmInputs {
  /** Risk-free rate (decimal), e.g. the 10Y Treasury yield. */
  riskFreeRate: number;
  /** Levered equity beta. */
  beta: number;
  /** Equity risk premium (decimal). */
  equityRiskPremium: number;
}

/** CAPM cost of equity = r_f + β · ERP. */
export function costOfEquity(i: CapmInputs): number {
  return i.riskFreeRate + i.beta * i.equityRiskPremium;
}

/** CAPM cost of equity with analytical provenance. */
export function costOfEquityAnnotated(i: CapmInputs): AnalyticalResult<number> {
  const value = costOfEquity(i);
  return annotate(value, {
    formulaId: 'capm.cost-of-equity.v1',
    status: 'estimated',
    units: 'ratio',
    source: 'user inputs',
    notes: 'r_f + β · ERP',
  });
}

/** After-tax cost of debt = pretax · (1 − tax). */
export function afterTaxCostOfDebt(pretaxCostOfDebt: number, taxRate: number): number {
  return pretaxCostOfDebt * (1 - taxRate);
}

export interface WaccInputs {
  costOfEquity: number;
  pretaxCostOfDebt: number;
  taxRate: number;
  /** Market value of equity (market cap). */
  equityValue: number;
  /** Market/book value of debt. */
  debtValue: number;
}

export interface WaccBreakdown {
  weightEquity: number | null;
  weightDebt: number | null;
  afterTaxCostOfDebt: number;
  wacc: number | null;
  /** Formula provenance; status unavailable when total capital ≤ 0. */
  meta: AnalyticalMeta;
}

/**
 * Weighted-average cost of capital. Equity and debt are value-weighted by their
 * share of total capital; the debt leg is taxed. Weights and WACC are null when
 * total capital is not positive.
 */
export function wacc(i: WaccInputs): WaccBreakdown {
  const total = i.equityValue + i.debtValue;
  const atcd = afterTaxCostOfDebt(i.pretaxCostOfDebt, i.taxRate);
  if (!(total > 0)) {
    return {
      weightEquity: null,
      weightDebt: null,
      afterTaxCostOfDebt: atcd,
      wacc: null,
      meta: analyticalMeta({
        formulaId: 'capm.wacc.v1',
        status: 'unavailable',
        units: 'ratio',
        source: 'user inputs',
        notes: 'Total capital not positive — weights and WACC undefined',
        value: null,
      }),
    };
  }
  const weightEquity = i.equityValue / total;
  const weightDebt = i.debtValue / total;
  const w = weightEquity * i.costOfEquity + weightDebt * atcd;
  const waccValue = Number.isFinite(w) ? w : null;
  return {
    weightEquity,
    weightDebt,
    afterTaxCostOfDebt: atcd,
    wacc: waccValue,
    meta: analyticalMeta({
      formulaId: 'capm.wacc.v1',
      status: waccValue === null ? 'unavailable' : 'estimated',
      units: 'ratio',
      source: 'user inputs',
      value: waccValue,
    }),
  };
}
