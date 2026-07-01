import { z } from 'zod';
import { IsoDateTime } from './common';

/**
 * A perpetual-swap funding snapshot for one symbol on one venue. Funding is the
 * periodic payment between longs and shorts that tethers a perp to its index —
 * the core crypto market-structure datum an equities terminal never has.
 */
export const FundingRateSchema = z.object({
  symbol: z.string(),
  venue: z.string(),
  /** Funding rate per interval as a decimal (0.0001 = 1 basis point). */
  rate: z.number().finite(),
  /** Funding interval in hours (8 on most venues). */
  intervalHours: z.number().positive(),
  /** Simple annualized rate in percent: rate × (24/intervalHours) × 365 × 100. */
  annualizedPct: z.number().finite(),
  markPrice: z.number().finite().positive().optional(),
  indexPrice: z.number().finite().positive().optional(),
  nextFundingAt: IsoDateTime.optional(),
  asOf: IsoDateTime,
});
export type FundingRate = z.infer<typeof FundingRateSchema>;
