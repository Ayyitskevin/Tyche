import { z } from 'zod';
import { IsoDateTime } from './common';

export const NewsSentimentSchema = z.enum(['positive', 'neutral', 'negative']);
export type NewsSentiment = z.infer<typeof NewsSentimentSchema>;

export const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string().optional(),
  url: z.string().url().optional(),
  source: z.string(),
  author: z.string().optional(),
  publishedAt: IsoDateTime,
  /** Symbols this item references. */
  symbols: z.array(z.string()).default([]),
  sentiment: NewsSentimentSchema.optional(),
  tags: z.array(z.string()).default([]),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

/**
 * Query shape for the news feed. All fields optional: no symbol/symbols ⇒ the
 * global TOP feed; `source`/`keyword`/`since`/`until` narrow the result;
 * `watchlistId` is resolved to that list's symbols server-side.
 */
export const NewsQuerySchema = z.object({
  symbol: z.string().optional(),
  symbols: z.array(z.string()).optional(),
  source: z.string().optional(),
  keyword: z.string().optional(),
  since: IsoDateTime.optional(),
  until: IsoDateTime.optional(),
  watchlistId: z.string().optional(),
  limit: z.number().int().positive().optional(),
});
export type NewsQuery = z.infer<typeof NewsQuerySchema>;
