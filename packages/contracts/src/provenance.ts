import { z } from 'zod';
import { IsoDateTime } from './common';

/**
 * Provenance & freshness metadata. Per the foundation's non-negotiable
 * constraints, *every* practical API response carries a {@link DataProvenance}
 * describing which provider produced it, in what mode, and how fresh it is.
 */

export const ProviderModeSchema = z.enum([
  'mock',
  'public',
  'paid',
  'enterprise',
  'user_supplied',
]);
export type ProviderMode = z.infer<typeof ProviderModeSchema>;

/** Coarse freshness tier for a piece of data. */
export const FreshnessTierSchema = z.enum([
  'live', // real-time
  'delayed', // exchange-delayed (e.g. 15m)
  'eod', // end-of-day snapshot
  'historical', // archival series
  'mock', // deterministic synthetic data
  'unknown',
]);
export type FreshnessTier = z.infer<typeof FreshnessTierSchema>;

export const DataFreshnessSchema = z.object({
  /** Timestamp the underlying data represents. */
  asOf: IsoDateTime,
  tier: FreshnessTierSchema,
  /** Known provider delay, if any (e.g. 900 for 15-minute delayed feeds). */
  delaySeconds: z.number().int().nonnegative().optional(),
  /** Age of the data relative to retrieval, in milliseconds. */
  ageMs: z.number().int().nonnegative().optional(),
  stale: z.boolean().optional(),
});
export type DataFreshness = z.infer<typeof DataFreshnessSchema>;

export const DataProvenanceSchema = z.object({
  /** Provider name, e.g. `mock`, `yahoo`, `secedgar`. */
  provider: z.string(),
  providerMode: ProviderModeSchema,
  /** Which provider capability produced this payload, e.g. `quotes`. */
  capability: z.string(),
  retrievedAt: IsoDateTime,
  freshness: DataFreshnessSchema,
  license: z.string().optional(),
  attribution: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  notes: z.string().optional(),
  cacheHit: z.boolean().optional(),
});
export type DataProvenance = z.infer<typeof DataProvenanceSchema>;

/** A data payload paired with its provenance. */
export interface Envelope<T> {
  data: T;
  provenance: DataProvenance;
}

/** Build a Zod schema for an {@link Envelope} around a data schema. */
export const envelope = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: schema, provenance: DataProvenanceSchema });
