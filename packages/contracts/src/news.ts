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
