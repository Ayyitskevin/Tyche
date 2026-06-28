import { z } from 'zod';
import { IsoDate, Currency } from './common';

export const StatementTypeSchema = z.enum(['income', 'balance', 'cash_flow']);
export type StatementType = z.infer<typeof StatementTypeSchema>;

export const FiscalPeriodSchema = z.enum(['annual', 'quarterly', 'ttm']);
export type FiscalPeriod = z.infer<typeof FiscalPeriodSchema>;

export const StatementLineItemSchema = z.object({
  /** Stable machine key, e.g. `totalRevenue`. */
  key: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  unit: z.string().optional(), // e.g. 'USD', 'shares', 'ratio'
  order: z.number().int().optional(),
});
export type StatementLineItem = z.infer<typeof StatementLineItemSchema>;

export const FinancialStatementSchema = z.object({
  symbol: z.string(),
  type: StatementTypeSchema,
  period: FiscalPeriodSchema,
  fiscalDate: IsoDate,
  fiscalYear: z.number().int().optional(),
  fiscalQuarter: z.number().int().min(1).max(4).optional(),
  currency: Currency.default('USD'),
  lineItems: z.array(StatementLineItemSchema),
});
export type FinancialStatement = z.infer<typeof FinancialStatementSchema>;

// --- Estimates -------------------------------------------------------------

export const EstimatePeriodSchema = z.enum([
  'current_quarter',
  'next_quarter',
  'current_year',
  'next_year',
]);
export type EstimatePeriod = z.infer<typeof EstimatePeriodSchema>;

export const EstimateMetricSchema = z.object({
  metric: z.string(), // e.g. 'eps', 'revenue'
  period: EstimatePeriodSchema,
  fiscalLabel: z.string().optional(), // e.g. 'Q3 2026'
  mean: z.number().nullable(),
  median: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  numAnalysts: z.number().int().nonnegative().optional(),
  actual: z.number().nullable().optional(),
  currency: Currency.optional(),
});
export type EstimateMetric = z.infer<typeof EstimateMetricSchema>;

// --- Analyst ratings -------------------------------------------------------

export const RatingActionSchema = z.enum([
  'initiate',
  'upgrade',
  'downgrade',
  'maintain',
  'reiterate',
]);
export type RatingAction = z.infer<typeof RatingActionSchema>;

export const AnalystRatingSchema = z.object({
  symbol: z.string(),
  firm: z.string(),
  analyst: z.string().optional(),
  rating: z.string(), // e.g. 'buy', 'overweight', 'hold'
  action: RatingActionSchema.optional(),
  priceTarget: z.number().nullable().optional(),
  previousPriceTarget: z.number().nullable().optional(),
  date: IsoDate,
});
export type AnalystRating = z.infer<typeof AnalystRatingSchema>;

// --- Ownership -------------------------------------------------------------

export const InstitutionalHolderSchema = z.object({
  holder: z.string(),
  shares: z.number().nonnegative(),
  marketValue: z.number().nonnegative().optional(),
  percentOfShares: z.number().optional(),
  percentOfPortfolio: z.number().optional(),
  changeShares: z.number().optional(),
  reportDate: IsoDate,
});
export type InstitutionalHolder = z.infer<typeof InstitutionalHolderSchema>;
