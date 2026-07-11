import { z } from 'zod';
import { IsoDate } from './common';

/** A filing full-text search request. `query` is the free-text term(s). */
export const FilingSearchQuerySchema = z.object({
  query: z.string().min(1),
  /** Restrict to specific form types, e.g. ['10-K', '8-K']. */
  forms: z.array(z.string()).optional(),
  /** Inclusive filing-date lower bound (YYYY-MM-DD). */
  dateFrom: IsoDate.optional(),
  /** Inclusive filing-date upper bound (YYYY-MM-DD). */
  dateTo: IsoDate.optional(),
  limit: z.number().int().positive().max(100).optional(),
});
export type FilingSearchQuery = z.infer<typeof FilingSearchQuerySchema>;

/**
 * One hit from a filing full-text search (e.g. SEC EDGAR's keyless EFTS index).
 * Unlike {@link FilingSchema} (a per-issuer submissions feed), a search hit spans
 * all issuers and is keyed on the matched document rather than a symbol.
 */
export const FilingSearchHitSchema = z.object({
  /** Filer / entity display name, e.g. "Apple Inc. (AAPL)". */
  entity: z.string(),
  /** Zero-padded CIK, when known. */
  cik: z.string().optional(),
  /** Form type, e.g. 10-K, 10-Q, 8-K. */
  form: z.string(),
  /** Filing date (the full-text index reports a date, not a timestamp). */
  filedAt: IsoDate,
  /** Direct link to the matched document, when resolvable. */
  url: z.string().url().optional(),
  accessionNumber: z.string().optional(),
  /** The matched document's file type/name, when distinct from the form. */
  fileType: z.string().optional(),
});
export type FilingSearchHit = z.infer<typeof FilingSearchHitSchema>;
