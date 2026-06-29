import { z } from 'zod';
import { FiniteNumber, IsoDate } from './common';

/**
 * Macro / economic time series — a provider-agnostic shape for sources like
 * FRED (Federal Reserve Economic Data). A series is identified by an opaque
 * provider series id (e.g. `GDP`, `UNRATE`, `CPIAUCSL`) and carries an ordered
 * list of dated observations. Values may be `null` where the source reports a
 * gap (FRED encodes missing observations as `"."`).
 */

/** A single dated observation. `value` is null when the source has no datum. */
export const EconomicObservationSchema = z.object({
  date: IsoDate,
  value: FiniteNumber.nullable(),
});
export type EconomicObservation = z.infer<typeof EconomicObservationSchema>;

export const EconomicSeriesSchema = z.object({
  seriesId: z.string().min(1),
  title: z.string(),
  units: z.string().optional(),
  unitsShort: z.string().optional(),
  frequency: z.string().optional(),
  seasonalAdjustment: z.string().optional(),
  notes: z.string().optional(),
  observationStart: IsoDate.optional(),
  observationEnd: IsoDate.optional(),
  lastUpdated: z.string().optional(),
  /** Ordered oldest → newest. */
  observations: z.array(EconomicObservationSchema),
});
export type EconomicSeries = z.infer<typeof EconomicSeriesSchema>;

/** Optional window/limit for a series request. */
export const EconomicSeriesQuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  limit: z.number().int().positive().max(100_000).optional(),
});
export type EconomicSeriesQuery = z.infer<typeof EconomicSeriesQuerySchema>;
