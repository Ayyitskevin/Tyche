import { z } from 'zod';
import { IsoDate } from './common';

/**
 * One position from an institutional manager's SEC Form 13F-HR information table.
 * Keyless and license-clean (EDGAR 13F infotable XML). `value` follows the SEC's
 * current whole-dollar reporting convention (pre-2023 filings reported thousands;
 * the adapter reads the latest filing, which is post-convention).
 */
export const InstitutionalHoldingSchema = z.object({
  /** Issuer name as filed (`nameOfIssuer`), e.g. 'APPLE INC'. */
  issuer: z.string(),
  /** 9-character CUSIP of the security. */
  cusip: z.string(),
  /** Ticker, when resolvable; often absent (a 13F carries no ticker, only a CUSIP). */
  ticker: z.string().optional(),
  /** Title of class, e.g. 'COM', 'CL A'. */
  class: z.string().optional(),
  /** Market value of the position, USD. */
  value: z.number().nonnegative(),
  /** Share or principal amount held (`sshPrnamt`). */
  shares: z.number().nonnegative(),
  /** 'SH' shares or 'PRN' principal amount. */
  sharesType: z.enum(['SH', 'PRN']).optional(),
  /** Position value as a percent of the manager's total reported 13F value. */
  weightPercent: z.number(),
  /** Option overlay when the position is a put/call rather than the underlying. */
  putCall: z.enum(['Put', 'Call']).optional(),
});
export type InstitutionalHolding = z.infer<typeof InstitutionalHoldingSchema>;

/**
 * An institutional manager's 13F-HR portfolio snapshot — the holdings plus report
 * metadata (who filed, which quarter, aggregate value). Research-only: a 13F is a
 * quarterly, up-to-45-days-delayed, long-only snapshot of US 13(f) securities —
 * it excludes shorts, cash, and non-US holdings, so it is NOT a live portfolio.
 */
export const InstitutionalPortfolioSchema = z.object({
  /** Filer (manager) name as filed. */
  manager: z.string(),
  /** Filer CIK (zero-padded). */
  cik: z.string(),
  /** Period of report (quarter end) the holdings represent. */
  reportDate: IsoDate.optional(),
  /** When the 13F-HR was filed with the SEC. */
  filedAt: IsoDate.optional(),
  /** Sum of reported position values, USD. */
  totalValue: z.number().nonnegative(),
  /** Number of reported positions (before any display cap). */
  positionCount: z.number().int().nonnegative(),
  holdings: z.array(InstitutionalHoldingSchema),
  /** Direct link to the filing's information-table document. */
  sourceUrl: z.string().url().optional(),
});
export type InstitutionalPortfolio = z.infer<typeof InstitutionalPortfolioSchema>;

/** Query for institutional holdings: a manager CIK or a known-manager alias/name. */
export const InstitutionalHoldingsQuerySchema = z.object({
  manager: z.string(),
  limit: z.number().int().positive().max(200).optional(),
});
export type InstitutionalHoldingsQuery = z.infer<typeof InstitutionalHoldingsQuerySchema>;
