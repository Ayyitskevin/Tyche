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

/** How a position moved between two consecutive 13F-HR reports. */
export const InstitutionalChangeActionSchema = z.enum(['new', 'added', 'trimmed', 'exited', 'unchanged']);
export type InstitutionalChangeAction = z.infer<typeof InstitutionalChangeActionSchema>;

/** One position's quarter-over-quarter change between two 13F-HR reports. */
export const InstitutionalHoldingChangeSchema = z.object({
  issuer: z.string(),
  cusip: z.string(),
  ticker: z.string().optional(),
  class: z.string().optional(),
  putCall: z.enum(['Put', 'Call']).optional(),
  action: InstitutionalChangeActionSchema,
  /** Shares/principal held in the current report (0 for an exited position). */
  currentShares: z.number().nonnegative(),
  /** Shares/principal held in the prior report (0 for a new position). */
  priorShares: z.number().nonnegative(),
  /** currentShares − priorShares (signed). */
  deltaShares: z.number(),
  /** Percent change in shares vs the prior report; null when there was no prior holding. */
  deltaPercent: z.number().nullable().optional(),
  /** Reported USD value in the current report (0 for an exited position). */
  currentValue: z.number().nonnegative(),
  /** Reported USD value in the prior report (0 for a new position). */
  priorValue: z.number().nonnegative(),
  /** Position weight in the current portfolio, percent. */
  currentWeightPercent: z.number(),
});
export type InstitutionalHoldingChange = z.infer<typeof InstitutionalHoldingChangeSchema>;

/**
 * A manager's quarter-over-quarter 13F position changes — the diff of the two most
 * recent full 13F-HR reports (new buys, adds, trims, exits). Research-only, and
 * still a delayed quarterly snapshot: it shows *reported* changes, not live trading.
 */
export const InstitutionalChangesSchema = z.object({
  manager: z.string(),
  cik: z.string(),
  /** Period of the current (newer) report. */
  reportDate: IsoDate.optional(),
  /** Period of the prior report the diff is against. */
  priorReportDate: IsoDate.optional(),
  filedAt: IsoDate.optional(),
  /** False when only one 13F-HR exists — then every current position reads as `new`. */
  hasPrior: z.boolean(),
  newCount: z.number().int().nonnegative(),
  addedCount: z.number().int().nonnegative(),
  trimmedCount: z.number().int().nonnegative(),
  exitedCount: z.number().int().nonnegative(),
  /** Changed positions only (`unchanged` are omitted), most material first. */
  changes: z.array(InstitutionalHoldingChangeSchema),
  sourceUrl: z.string().url().optional(),
});
export type InstitutionalChanges = z.infer<typeof InstitutionalChangesSchema>;
