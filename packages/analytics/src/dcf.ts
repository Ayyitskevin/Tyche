/**
 * Discounted-cash-flow valuation — a small, dependency-free intrinsic-value
 * sandbox. Given a base free cash flow and a set of assumptions (explicit growth,
 * a terminal growth rate, and a discount rate / WACC), it projects and discounts
 * the cash flows, adds a Gordon-growth terminal value, and nets debt to an equity
 * value and per-share fair value. It also inverts the model — solving for the
 * growth rate the market is implying at a given price (reverse DCF) — and sweeps a
 * discount-rate × terminal-growth sensitivity grid.
 *
 * Pure and finite-safe: every result is null wherever an assumption makes the
 * model undefined (most importantly when the discount rate does not exceed the
 * terminal growth rate, where a Gordon perpetuity diverges). Educational analytics
 * only — nothing here is investment advice.
 *
 * Formula id: `dcf.gordon-growth.v1` / `dcf.reverse.v1` (see formulas.ts).
 * Results carry {@link AnalyticalMeta} so callers can surface status, units, and
 * formula provenance without treating unavailable terminals as zeros.
 */

import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';

export interface DcfInputs {
  /** Most recent annual free cash flow, in currency units (the year-0 base). */
  baseFcf: number;
  /** Explicit forecast horizon in years (coerced to an integer ≥ 1). */
  forecastYears: number;
  /** Annual FCF growth during the explicit forecast (decimal, e.g. 0.10 = 10%). */
  growthRate: number;
  /** Perpetual growth after the forecast (decimal); must be < discountRate. */
  terminalGrowthRate: number;
  /** Discount rate / WACC (decimal, e.g. 0.09 = 9%). */
  discountRate: number;
  /** Total debt − cash & equivalents; subtracted from enterprise value. Default 0. */
  netDebt?: number;
  /** Shares outstanding, for the per-share fair value. Optional. */
  sharesOutstanding?: number;
}

/** One projected forecast year. */
export interface DcfYear {
  year: number;
  fcf: number;
  discountFactor: number;
  presentValue: number;
}

export interface DcfResult {
  years: DcfYear[];
  /** Sum of the present values of the explicit-forecast FCFs. */
  sumPvFcf: number;
  /** Undiscounted terminal value at the end of the forecast (null if undefined). */
  terminalValue: number | null;
  pvTerminalValue: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  fairValuePerShare: number | null;
  /** Formula provenance; status is unavailable when the terminal diverges. */
  meta: AnalyticalMeta;
}

function finite(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

function forecastCount(years: number): number {
  return Math.max(1, Math.floor(Number.isFinite(years) ? years : 1));
}

/**
 * Project and discount the explicit forecast, add a Gordon-growth terminal value,
 * and net debt to an equity value / per-share fair value. The terminal value —
 * and everything downstream of it — is null when the discount rate does not
 * exceed the terminal growth rate (a divergent perpetuity), so callers can warn
 * rather than surface an Infinity.
 */
export function discountedCashFlow(inputs: DcfInputs): DcfResult {
  const n = forecastCount(inputs.forecastYears);
  const { baseFcf, growthRate, terminalGrowthRate, discountRate } = inputs;
  const netDebt = inputs.netDebt ?? 0;
  const shares = inputs.sharesOutstanding;

  const years: DcfYear[] = [];
  let sumPvFcf = 0;
  const valid = 1 + discountRate > 0;
  for (let y = 1; y <= n; y += 1) {
    const fcf = baseFcf * (1 + growthRate) ** y;
    const discountFactor = valid ? 1 / (1 + discountRate) ** y : 0;
    const presentValue = fcf * discountFactor;
    years.push({ year: y, fcf, discountFactor, presentValue });
    if (valid) sumPvFcf += presentValue;
  }

  // Gordon terminal value only converges when the discount rate leads terminal growth.
  const lastFcf = years[years.length - 1]!.fcf;
  const canTerminate = valid && discountRate > terminalGrowthRate;
  const terminalValue = canTerminate
    ? finite((lastFcf * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate))
    : null;
  const lastFactor = years[years.length - 1]!.discountFactor;
  const pvTerminalValue = terminalValue === null ? null : finite(terminalValue * lastFactor);

  const enterpriseValue =
    pvTerminalValue === null ? null : finite(sumPvFcf + pvTerminalValue);
  const equityValue = enterpriseValue === null ? null : finite(enterpriseValue - netDebt);
  const fairValuePerShare =
    equityValue === null || shares === undefined || shares <= 0
      ? null
      : finite(equityValue / shares);

  const status =
    equityValue === null ? ('unavailable' as const) : ('estimated' as const);
  return {
    years,
    sumPvFcf: finite(sumPvFcf) ?? 0,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    meta: analyticalMeta({
      formulaId: 'dcf.gordon-growth.v1',
      status,
      units: 'currency',
      source: 'user inputs',
      notes:
        equityValue === null
          ? 'Terminal value undefined (discountRate ≤ terminalGrowthRate) or non-finite result'
          : 'Gordon-growth DCF; model estimate under stated assumptions',
      value: equityValue,
    }),
  };
}

/**
 * Reverse DCF — solve for the explicit growth rate implied by a target equity
 * value (typically the current market cap), holding every other assumption fixed.
 * Equity value is strictly increasing in the growth rate when the base FCF is
 * positive and the terminal value converges, so a bisection is well-posed. Returns
 * null when the base FCF is non-positive, the terminal value diverges, or the
 * target falls outside the value the model can produce over a wide growth bracket.
 */
export function impliedGrowthRate(
  inputs: DcfInputs,
  targetEquityValue: number,
): number | null {
  if (!(inputs.baseFcf > 0) || !Number.isFinite(targetEquityValue)) return null;
  if (!(inputs.discountRate > inputs.terminalGrowthRate)) return null;

  const equityAt = (g: number): number | null =>
    discountedCashFlow({ ...inputs, growthRate: g }).equityValue;

  let lo = -0.95;
  let hi = 1.0; // 100% annual growth — a generous upper bracket
  const loVal = equityAt(lo);
  const hiVal = equityAt(hi);
  if (loVal === null || hiVal === null) return null;
  if (targetEquityValue < loVal || targetEquityValue > hiVal) return null;

  for (let i = 0; i < 100 && hi - lo > 1e-9; i += 1) {
    const mid = (lo + hi) / 2;
    const midVal = equityAt(mid);
    if (midVal === null) return null;
    if (midVal < targetEquityValue) lo = mid;
    else hi = mid;
  }
  return finite((lo + hi) / 2);
}

/**
 * Sensitivity grid of equity value across a discount-rate × terminal-growth
 * matrix (rows = discount rates, columns = terminal growth rates). Cells where the
 * discount rate does not exceed the terminal growth rate are null.
 */
export function dcfSensitivity(
  inputs: DcfInputs,
  discountRates: number[],
  terminalGrowthRates: number[],
): (number | null)[][] {
  return discountRates.map((discountRate) =>
    terminalGrowthRates.map(
      (terminalGrowthRate) =>
        discountedCashFlow({ ...inputs, discountRate, terminalGrowthRate }).equityValue,
    ),
  );
}
