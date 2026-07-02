import { z } from 'zod';
import { IsoDateTime } from './common';

/** One index/ETF constituent with its weight in the parent. */
export const ConstituentSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  /** Weight in percent of the parent index/ETF (0–100). */
  weightPct: z.number().finite().nonnegative(),
  sector: z.string().nullable().default(null),
});
export type Constituent = z.infer<typeof ConstituentSchema>;

/** Index/ETF membership: what a benchmark holds and at what weights. */
export const IndexMembershipSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  asOf: IsoDateTime,
  constituents: z.array(ConstituentSchema),
});
export type IndexMembership = z.infer<typeof IndexMembershipSchema>;
