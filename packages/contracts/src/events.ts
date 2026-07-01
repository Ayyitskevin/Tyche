import { z } from 'zod';
import { FiniteNumber, Id, IsoDate } from './common';

/**
 * Corporate events — earnings dates, dividends, splits. A calendar surface, not
 * a recommendation: events carry facts (dates, amounts, ratios) and a
 * confirmed/estimated status only.
 */
export const CorporateEventTypeSchema = z.enum(['earnings', 'dividend', 'split']);
export type CorporateEventType = z.infer<typeof CorporateEventTypeSchema>;

export const CorporateEventStatusSchema = z.enum(['confirmed', 'estimated']);
export type CorporateEventStatus = z.infer<typeof CorporateEventStatusSchema>;

export const CorporateEventSchema = z.object({
  id: Id,
  symbol: z.string(),
  type: CorporateEventTypeSchema,
  /** Event date (day precision). */
  date: IsoDate,
  status: CorporateEventStatusSchema,
  title: z.string(),
  /** Earnings: consensus EPS estimate, when known. */
  epsEstimate: FiniteNumber.nullable().optional(),
  /** Dividend: cash amount per share. */
  amount: FiniteNumber.optional(),
  /** Split: ratio label, e.g. "4:1". */
  ratio: z.string().optional(),
});
export type CorporateEvent = z.infer<typeof CorporateEventSchema>;

/** Window/filter for an events request. */
export const EventsQuerySchema = z.object({
  symbol: z.string().optional(),
  /** Look-ahead window in days (the feed also includes the past ~30 days). */
  days: z.number().int().positive().max(365).optional(),
});
export type EventsQuery = z.infer<typeof EventsQuerySchema>;
