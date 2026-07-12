import { z } from 'zod';
import { FiniteNumber, IsoDate } from './common';

/**
 * Economic release calendar — the "ECO calendar" of scheduled and just-published
 * macro data releases (CPI, GDP, employment, FOMC decisions, …). Provider-agnostic:
 * a keyless/public or bring-your-own-key source (e.g. FRED release dates) supplies
 * the name + scheduled date; `actual`/`previous` come from the underlying series
 * where available, and `consensus` is only populated by sources that carry
 * estimates (never fabricated). Research-only; not investment advice.
 */

export const ReleaseImportanceSchema = z.enum(['low', 'medium', 'high']);
export type ReleaseImportance = z.infer<typeof ReleaseImportanceSchema>;

export const EconomicReleaseSchema = z.object({
  /** Provider release id (e.g. FRED release_id), when available. */
  releaseId: z.string().optional(),
  /** Related FRED-style series id for the headline datum, when available. */
  seriesId: z.string().optional(),
  /** Human name, e.g. "Consumer Price Index". */
  name: z.string().min(1),
  /** Scheduled release date, ISO (date or datetime). */
  date: IsoDate,
  /** Reference period the datum covers, e.g. "May 2025" or "Q1 2025". */
  period: z.string().optional(),
  frequency: z.string().optional(),
  unit: z.string().optional(),
  importance: ReleaseImportanceSchema.optional(),
  /** Reported value (null until released). */
  actual: FiniteNumber.nullable().optional(),
  /** Prior period's value. */
  previous: FiniteNumber.nullable().optional(),
  /** Consensus estimate; only where a source carries estimates, else null. */
  consensus: FiniteNumber.nullable().optional(),
});
export type EconomicRelease = z.infer<typeof EconomicReleaseSchema>;

/** Optional window / importance filter for a calendar request. */
export const EconomicReleaseQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  importance: ReleaseImportanceSchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
});
export type EconomicReleaseQuery = z.infer<typeof EconomicReleaseQuerySchema>;
