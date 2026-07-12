import { z } from 'zod';
import { ProviderModeSchema, FreshnessTierSchema } from './provenance';

/**
 * The provider capability model. Every provider declares exactly which
 * capabilities it supports; every module declares which it requires. The gap
 * between the two is what produces graceful "missing capability" UI states
 * instead of crashes.
 */
export const PROVIDER_CAPABILITY_KEYS = [
  'quotes',
  'batchQuotes',
  'historicalPrices',
  'intradayPrices',
  'trades',
  'orderBook',
  'news',
  'filings',
  'filingSearch',
  'insiderTransactions',
  'fundamentals',
  'estimates',
  'analystRatings',
  'ownership',
  'options',
  'fx',
  'crypto',
  'futures',
  'bonds',
  'portfolio',
  'screener',
  'economicSeries',
  'economicReleases',
  'events',
  'fundingRates',
  'membership',
  'dexPools',
] as const;

export const ProviderCapabilitySchema = z.enum(PROVIDER_CAPABILITY_KEYS);
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export const ProviderCapabilitiesSchema = z.object({
  quotes: z.boolean(),
  batchQuotes: z.boolean(),
  historicalPrices: z.boolean(),
  intradayPrices: z.boolean(),
  trades: z.boolean(),
  orderBook: z.boolean(),
  news: z.boolean(),
  filings: z.boolean(),
  /** Cross-issuer filing full-text search (e.g. SEC EDGAR EFTS). */
  filingSearch: z.boolean(),
  /** Insider (Section 16) transactions from EDGAR Form 3/4/5 ownership filings. */
  insiderTransactions: z.boolean(),
  fundamentals: z.boolean(),
  estimates: z.boolean(),
  analystRatings: z.boolean(),
  ownership: z.boolean(),
  options: z.boolean(),
  fx: z.boolean(),
  crypto: z.boolean(),
  futures: z.boolean(),
  bonds: z.boolean(),
  portfolio: z.boolean(),
  screener: z.boolean(),
  economicSeries: z.boolean(),
  economicReleases: z.boolean(),
  events: z.boolean(),
  /** Perpetual-swap funding rates (crypto market structure). */
  fundingRates: z.boolean(),
  /** Index/ETF constituent membership. */
  membership: z.boolean(),
  /** On-chain DEX liquidity pools (decentralized market structure). */
  dexPools: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const RateLimitSchema = z.object({
  requestsPerMinute: z.number().int().positive().optional(),
  requestsPerDay: z.number().int().positive().optional(),
  burst: z.number().int().positive().optional(),
  notes: z.string().optional(),
});
export type RateLimit = z.infer<typeof RateLimitSchema>;

/** A freshness guarantee a provider makes for a given capability, if known. */
export const FreshnessGuaranteeSchema = z.object({
  capability: ProviderCapabilitySchema,
  tier: FreshnessTierSchema,
  delaySeconds: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});
export type FreshnessGuarantee = z.infer<typeof FreshnessGuaranteeSchema>;

export const ProviderDescriptorSchema = z.object({
  name: z.string(),
  mode: ProviderModeSchema,
  capabilities: ProviderCapabilitiesSchema,
  freshness: z.array(FreshnessGuaranteeSchema).default([]),
  attribution: z.string().optional(),
  attributionRequired: z.boolean().default(false),
  rateLimit: RateLimitSchema.optional(),
  homepage: z.string().url().optional(),
  description: z.string().optional(),
  /** True when the adapter needs configuration/keys before it can serve data. */
  requiresConfiguration: z.boolean().default(false),
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;

/** A fully "off" capability set — handy base for stub providers. */
export const NO_CAPABILITIES: ProviderCapabilities = Object.fromEntries(
  PROVIDER_CAPABILITY_KEYS.map((k) => [k, false]),
) as ProviderCapabilities;
