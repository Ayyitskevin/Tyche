/**
 * Formula registry — authoritative identifiers, assumptions, limitations, and
 * sources for audited analytical transforms. When the repository lacks an
 * authoritative formula definition, the entry is marked `needsHumanReview: true`
 * and inventing coefficients is forbidden.
 *
 * Educational / descriptive only — nothing here is investment advice.
 */

import type { UnitKind } from './analyticalMeta';

export interface FormulaDefinition {
  /** Stable id used in AnalyticalMeta.formulaId. */
  id: string;
  /** Short human label. */
  name: string;
  /** Module path under @tyche/analytics (or apps/web for yield-curve). */
  module: string;
  /** Primary output units. */
  units: UnitKind;
  /** Model assumptions that affect interpretation. */
  assumptions: string[];
  /** Known limitations and disclosed simplifications. */
  limitations: string[];
  /**
   * Authority for the coefficients / structure. When null, the formula must
   * not be treated as a verified standard implementation without human review.
   */
  authority: string | null;
  /** When true, coefficients or structure need human verification before relying on them. */
  needsHumanReview: boolean;
  /** Explicit non-advice framing. */
  disclaimer: string;
}

const DISCLAIMER =
  'Descriptive / educational analytics only. Not investment advice, not a rating, not a signal.';

/**
 * Registry of audited formulas. Keys match AnalyticalMeta.formulaId.
 * Extend when applying the validation framework to additional modules.
 */
export const FORMULAS: Record<string, FormulaDefinition> = {
  'dcf.gordon-growth.v1': {
    id: 'dcf.gordon-growth.v1',
    name: 'Discounted cash flow (Gordon terminal)',
    module: 'dcf.ts',
    units: 'currency',
    assumptions: [
      'Base FCF is the year-0 anchor; year t FCF = baseFcf × (1+g)^t',
      'Explicit forecast then Gordon perpetuity at terminalGrowthRate',
      'Discount rate is constant (WACC or equivalent)',
      'Net debt subtracted from enterprise value to equity value',
    ],
    limitations: [
      'Terminal value null when discountRate ≤ terminalGrowthRate (divergent perpetuity)',
      'No mid-year convention; end-of-year cash flows only',
      'Single-stage growth in the explicit period; no fade schedule',
      'Currency is caller-supplied; no FX conversion inside the model',
    ],
    authority: 'Standard Gordon growth DCF structure as coded in packages/analytics/src/dcf.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'dcf.reverse.v1': {
    id: 'dcf.reverse.v1',
    name: 'Reverse DCF (implied growth)',
    module: 'dcf.ts',
    units: 'ratio',
    assumptions: [
      'Solves for explicit growth rate that matches a target equity value (typically market cap)',
      'All other DCF assumptions held fixed',
      'Bisection on growth in [-0.95, 1.0]',
    ],
    limitations: [
      'Null when baseFcf ≤ 0, terminal diverges, or target is outside the bracket',
      'Implied growth is model-relative, not a forecast',
    ],
    authority: 'Inverse of dcf.gordon-growth.v1 via bisection (packages/analytics/src/dcf.ts)',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'capm.cost-of-equity.v1': {
    id: 'capm.cost-of-equity.v1',
    name: 'CAPM cost of equity',
    module: 'capm.ts',
    units: 'ratio',
    assumptions: [
      'costOfEquity = riskFreeRate + beta × equityRiskPremium',
      'Rates are annual decimals',
      'Beta is a levered equity beta supplied by the caller',
    ],
    limitations: [
      'No adjustment for size, liquidity, or country risk',
      'ERP and rf are caller inputs — not fetched inside the pure function',
    ],
    authority: 'Standard CAPM as coded in packages/analytics/src/capm.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'capm.wacc.v1': {
    id: 'capm.wacc.v1',
    name: 'Weighted average cost of capital',
    module: 'capm.ts',
    units: 'ratio',
    assumptions: [
      'Value-weighted equity and after-tax debt',
      'afterTaxCostOfDebt = pretax × (1 − taxRate)',
      'Weights null when total capital ≤ 0',
    ],
    limitations: [
      'Uses supplied market values; no iterative WACC/value circularity solver',
      'Ignores preferred equity and other capital layers',
    ],
    authority: 'Standard WACC as coded in packages/analytics/src/capm.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'risk.correlation.v1': {
    id: 'risk.correlation.v1',
    name: 'Pearson correlation of returns',
    module: 'portfolioRisk.ts',
    units: 'dimensionless',
    assumptions: [
      'Sample Pearson correlation; series aligned at the most-recent end',
      'Result clamped to [-1, 1]',
      'Undefined (null) when either series has zero variance or fewer than 2 points',
    ],
    limitations: [
      'Pairwise length trim is not calendar-date alignment (see marketSensitivity for date align)',
      'Does not robustify outliers',
    ],
    authority: 'Sample Pearson correlation; house rule unavailable≠0 on flat series',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'risk.beta.v1': {
    id: 'risk.beta.v1',
    name: 'Regression beta vs benchmark',
    module: 'portfolioRisk.ts',
    units: 'dimensionless',
    assumptions: [
      'beta = cov(asset, benchmark) / var(benchmark) (sample convention)',
      'Null when benchmark variance is zero or fewer than 2 points',
    ],
    limitations: [
      'Single-factor only; no robust / Bayesian shrinkage',
      'Alignment is end-trim, not date-merge (marketSensitivity date-aligns candles first)',
    ],
    authority: 'OLS slope as coded in packages/analytics/src/portfolioRisk.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'risk.market-sensitivity.v1': {
    id: 'risk.market-sensitivity.v1',
    name: 'Market sensitivity (beta, alpha, capture)',
    module: 'marketBeta.ts',
    units: 'dimensionless',
    assumptions: [
      'Daily simple returns; series aligned on common trading dates',
      'Alpha annualized ×252 from daily intercept',
      'Whole bundle null when n<2 or either return series is flat',
    ],
    limitations: [
      'Calendar alignment only — no FX or total-return adjustment',
      'Up/down capture uses mean returns on benchmark up/down days',
    ],
    authority: 'packages/analytics/src/marketBeta.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'scoring.altman-z-prime.v1': {
    id: 'scoring.altman-z-prime.v1',
    name: "Altman Z′-Score (private-firm)",
    module: 'scoring.ts',
    units: 'score',
    assumptions: [
      'Private-firm Z′ weights: 0.717, 0.847, 3.107, 0.42, 0.998',
      'X4 uses book equity / total liabilities (no market cap)',
      'EBIT proxied by operating income',
      'All-or-null: score null unless all five components present',
      'Zones: >2.9 safe · 1.23–2.9 grey · <1.23 distress',
    ],
    limitations: [
      'Not the original public-firm Z (different weights and bands)',
      'Descriptive screen only — high false-positive/negative rates by design of any single score',
    ],
    authority:
      'Altman private-firm Z′ variant as documented in financial-terminal-reference / scoring.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'scoring.piotroski-f.v1': {
    id: 'scoring.piotroski-f.v1',
    name: 'Piotroski F-Score',
    module: 'scoring.ts',
    units: 'score',
    assumptions: [
      'Nine binary YoY signals; score = count of passes',
      'Missing inputs → signal null, never counted as pass or fail',
      'Leverage uses total-debt/assets (mapped BS exposes total debt)',
      'Band only when complete: ≥7 strong · 4–6 moderate · ≤3 weak',
    ],
    limitations: [
      'Annual periods only',
      'NoDilution uses shares outstanding ≤ prior — not a full share-issuance ledger',
    ],
    authority: 'Piotroski (2000) nine-signal checklist as coded in scoring.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'scoring.beneish-m.v1': {
    id: 'scoring.beneish-m.v1',
    name: 'Beneish M-Score (1999 8-variable)',
    module: 'scoring.ts',
    units: 'score',
    assumptions: [
      'M = −4.84 + Σ(weight × index); all-or-null on eight indices',
      'Flag elevated when M > −1.78',
      'LVGI uses totalLiabilities/totalAssets (double-count-free proxy)',
      'AQI omits long-term securities (currentAssets + net PP&E only)',
    ],
    limitations: [
      'Statistical screen with high false-positive rate — never an accusation of fraud',
      'Two disclosed simplifications vs published LVGI/AQI numerators',
    ],
    authority: 'Beneish (1999) as coded with disclosed simplifications in scoring.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'comps.multiples.v1': {
    id: 'comps.multiples.v1',
    name: 'Peer comparison multiples',
    module: 'relativeValue.ts',
    units: 'ratio',
    assumptions: [
      'EV = marketCap + totalDebt − cash',
      'EBITDA = operatingIncome + D&A',
      'Multiples null when denominator not strictly positive',
    ],
    limitations: [
      'No sector-normalization or outlier winsorization',
      'Cash/debt missing treated as 0 only inside EV construction when marketCap present',
    ],
    authority: 'packages/analytics/src/relativeValue.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'funding.carry.v1': {
    id: 'funding.carry.v1',
    name: 'Perp funding carry analytics',
    module: 'fundingAnalytics.ts',
    units: 'percent',
    assumptions: [
      'annualizedPct from provider datum; dailyPct = rate × (24/intervalHours) × 100',
      'Regime bands: rich ≥30% · elevated ≥10% · neutral · negative <−10% APR',
      'Premium null when mark or index absent',
    ],
    limitations: [
      'Simple annualization ignores compounding and fee schedules',
      'Regime thresholds are fixed house bands, not vendor standards',
    ],
    authority: 'packages/analytics/src/fundingAnalytics.ts + contracts funding annualizedPct',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'book.depth-slippage.v1': {
    id: 'book.depth-slippage.v1',
    name: 'Order-book depth and cost-to-fill',
    module: 'bookAnalytics.ts',
    units: 'bps',
    assumptions: [
      'Mid = (bestBid+bestAsk)/2 when both sides present',
      'Microprice size-weighted; imbalance notional-weighted',
      'costToFill walks the book; never extrapolates beyond depth',
    ],
    limitations: [
      'Single snapshot — no queue dynamics',
      'Slippage vs mid; does not model fees or latency',
    ],
    authority: 'packages/analytics/src/bookAnalytics.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'yield.curve-spread.v1': {
    id: 'yield.curve-spread.v1',
    name: 'Treasury curve spread (long − short)',
    module: 'apps/web/src/modules/yieldCurve.ts',
    units: 'percent',
    assumptions: [
      'FRED constant-maturity DGS* series',
      'asOfYield: latest valued observation on or before target',
      'Spread = long − short in percentage points; negative = inverted',
    ],
    limitations: [
      'Lives in the web module, not @tyche/analytics',
      'Does not interpolate missing tenors',
    ],
    authority: 'apps/web/src/modules/yieldCurve.ts',
    needsHumanReview: false,
    disclaimer: DISCLAIMER,
  },
  'flow.trade-tape.v1': {
    id: 'flow.trade-tape.v1',
    name: 'Trade-tape order-flow analytics',
    module: 'tradeFlow.ts',
    units: 'dimensionless',
    assumptions: ['Aggregates trade prints into descriptive flow stats'],
    limitations: [
      'HUMAN REVIEW: confirm formula authority and edge cases against tradeFlow.ts before relying on outputs',
    ],
    authority: null,
    needsHumanReview: true,
    disclaimer: DISCLAIMER,
  },
};

export function getFormula(id: string): FormulaDefinition | undefined {
  return FORMULAS[id];
}

/** All registered formula ids (stable sort for determinism). */
export function listFormulaIds(): string[] {
  return Object.keys(FORMULAS).sort();
}

/** Formulas that still require human verification of authority / coefficients. */
export function formulasNeedingReview(): FormulaDefinition[] {
  return Object.values(FORMULAS).filter((f) => f.needsHumanReview || f.authority === null);
}
