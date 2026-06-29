/**
 * Time-value-of-money helpers. Standard public-domain finance formulas;
 * educational analytics only — nothing here is investment advice.
 *
 * `ratePerPeriod` is the periodic rate as a decimal (e.g. 0.01 = 1% per period);
 * `nper` is the number of periods. Annuity payments are ordinary (end of period).
 * Each function handles the zero-rate limit linearly so it never divides by zero.
 */

/** Future value of a present sum `pv` plus a `pmt` annuity, after `nper` periods. */
export function futureValue(pv: number, pmt: number, ratePerPeriod: number, nper: number): number {
  if (ratePerPeriod === 0) return pv + pmt * nper;
  const growth = Math.pow(1 + ratePerPeriod, nper);
  return pv * growth + pmt * ((growth - 1) / ratePerPeriod);
}

/** Present value of a future sum `fv` plus a `pmt` annuity, over `nper` periods. */
export function presentValue(fv: number, pmt: number, ratePerPeriod: number, nper: number): number {
  if (ratePerPeriod === 0) return fv + pmt * nper;
  const discount = Math.pow(1 + ratePerPeriod, -nper);
  return fv * discount + pmt * ((1 - discount) / ratePerPeriod);
}

/** Level payment that fully amortizes `principal` over `nper` periods at `ratePerPeriod` (positive). */
export function loanPayment(principal: number, ratePerPeriod: number, nper: number): number {
  if (nper <= 0) return 0;
  if (ratePerPeriod === 0) return principal / nper;
  return (principal * ratePerPeriod) / (1 - Math.pow(1 + ratePerPeriod, -nper));
}

/** Compound annual growth rate from `begin` to `end` over `years` (decimal). */
export function cagr(begin: number, end: number, years: number): number {
  if (begin <= 0 || end <= 0 || years <= 0) return Number.NaN;
  return Math.pow(end / begin, 1 / years) - 1;
}
