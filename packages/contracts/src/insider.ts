import { z } from 'zod';
import { IsoDate } from './common';

/**
 * A single insider (Section 16) transaction from an SEC Form 3/4/5 ownership
 * filing. Keyless and license-clean (EDGAR ownership XML). One filing typically
 * yields several transactions; the provider flattens them into this shape.
 */
export const InsiderTransactionSchema = z.object({
  symbol: z.string(),
  /** Reporting owner (insider) name, as filed. */
  owner: z.string(),
  /** Relationship/role, e.g. 'Chief Executive Officer', 'Director', '10% Owner'. */
  relationship: z.string().optional(),
  /** Transaction date. */
  date: IsoDate,
  /** SEC transaction code, e.g. 'P' (open-market purchase), 'S' (sale), 'A' (award). */
  code: z.string(),
  /** 'A' acquired or 'D' disposed; null when the filing doesn't disambiguate. */
  acquiredDisposed: z.enum(['A', 'D']).nullable().optional(),
  shares: z.number().nonnegative(),
  /** Price per share; null for non-priced transactions (grants, gifts). */
  pricePerShare: z.number().nonnegative().nullable().optional(),
  /** Shares beneficially owned following the transaction. */
  sharesOwnedFollowing: z.number().nonnegative().nullable().optional(),
  /** Form type: 3 (initial), 4 (changes), 5 (annual). */
  form: z.string().default('4'),
  filedAt: IsoDate.optional(),
  /** Direct link to the filing's ownership document. */
  url: z.string().url().optional(),
});
export type InsiderTransaction = z.infer<typeof InsiderTransactionSchema>;
