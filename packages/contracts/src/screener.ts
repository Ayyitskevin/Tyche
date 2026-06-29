import { z } from 'zod';
import { IsoDateTime } from './common';
import { AssetClassSchema } from './instruments';

/**
 * Equity screener contracts. A screen filters a provider's instrument universe
 * by quote/fundamental fields and returns ranked rows. Numeric fields support
 * comparison operators; categorical fields (sector, assetClass) support eq/neq.
 * Educational discovery only — a screen is not a recommendation.
 */

/** Fields a screen can filter or sort on. */
export const ScreenFieldSchema = z.enum([
  'price',
  'changePercent',
  'marketCap',
  'volume',
  'sector',
  'assetClass',
]);
export type ScreenField = z.infer<typeof ScreenFieldSchema>;

export const NUMERIC_SCREEN_FIELDS = ['price', 'changePercent', 'marketCap', 'volume'] as const;

export const ScreenOpSchema = z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);
export type ScreenOp = z.infer<typeof ScreenOpSchema>;

export const ScreenFilterSchema = z
  .object({
    field: ScreenFieldSchema,
    op: ScreenOpSchema,
    value: z.union([z.number(), z.string()]),
  })
  // A numeric field requires a numeric value (and a categorical field a text
  // value), so comparisons are never silently lexicographic.
  .superRefine((filter, ctx) => {
    const numeric = (NUMERIC_SCREEN_FIELDS as readonly string[]).includes(filter.field);
    if (numeric && typeof filter.value !== 'number') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: `Field "${filter.field}" requires a numeric value` });
    }
    if (!numeric && typeof filter.value !== 'string') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: `Field "${filter.field}" requires a text value` });
    }
  });
export type ScreenFilter = z.infer<typeof ScreenFilterSchema>;

export const ScreenSortSchema = z.object({
  field: ScreenFieldSchema,
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type ScreenSort = z.infer<typeof ScreenSortSchema>;

export const ScreenQuerySchema = z.object({
  filters: z.array(ScreenFilterSchema).default([]),
  sort: ScreenSortSchema.optional(),
  limit: z.number().int().positive().max(500).default(50),
});
export type ScreenQuery = z.infer<typeof ScreenQuerySchema>;

/** One row in a screen result: identity + the comparable metrics. */
export const ScreenRowSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  assetClass: AssetClassSchema,
  sector: z.string().nullable().default(null),
  price: z.number().nullable().default(null),
  changePercent: z.number().nullable().default(null),
  marketCap: z.number().nullable().default(null),
  volume: z.number().nullable().default(null),
});
export type ScreenRow = z.infer<typeof ScreenRowSchema>;

/** A named, persisted screen the operator can re-run with one click. */
export const SavedScreenSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  query: ScreenQuerySchema,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type SavedScreen = z.infer<typeof SavedScreenSchema>;
