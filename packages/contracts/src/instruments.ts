import { z } from 'zod';
import { Currency } from './common';

/** Broad asset class taxonomy. Drives capability gating and module routing. */
export const AssetClassSchema = z.enum([
  'equity',
  'etf',
  'index',
  'crypto',
  'fx',
  'future',
  'bond',
  'option',
  'commodity',
  'fund',
]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const ExchangeSchema = z.object({
  code: z.string(), // e.g. XNAS
  name: z.string(),
  mic: z.string().optional(), // ISO 10383 Market Identifier Code
  country: z.string().optional(),
  timezone: z.string().optional(), // IANA tz, e.g. America/New_York
});
export type Exchange = z.infer<typeof ExchangeSchema>;

/** The minimal stable identity of a tradable instrument. */
export const InstrumentIdentifierSchema = z.object({
  symbol: z.string(),
  assetClass: AssetClassSchema,
  exchange: z.string().optional(), // exchange code
  mic: z.string().optional(),
  figi: z.string().optional(),
  isin: z.string().optional(),
  cusip: z.string().optional(),
  currency: Currency.optional(),
});
export type InstrumentIdentifier = z.infer<typeof InstrumentIdentifierSchema>;

/** A fully described instrument (security master record). */
export const InstrumentSchema = InstrumentIdentifierSchema.extend({
  name: z.string(),
  description: z.string().optional(),
  sector: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  website: z.string().url().optional(),
  employees: z.number().int().nonnegative().optional(),
  marketCap: z.number().nonnegative().optional(),
  sharesOutstanding: z.number().nonnegative().optional(),
  active: z.boolean().default(true),
  exchangeDetail: ExchangeSchema.optional(),
});
export type Instrument = z.infer<typeof InstrumentSchema>;

/** A search hit returned by the SECF / search route. */
export const SearchResultSchema = z.object({
  identifier: InstrumentIdentifierSchema,
  name: z.string(),
  score: z.number().min(0).max(1).optional(),
  matchedOn: z.enum(['symbol', 'name', 'isin', 'figi', 'alias']).optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;
