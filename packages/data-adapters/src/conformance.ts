import { z } from 'zod';
import {
  AnalystRatingSchema,
  EconomicSeriesSchema,
  EstimateMetricSchema,
  FilingSchema,
  FinancialStatementSchema,
  HistoricalSeriesSchema,
  InstitutionalHolderSchema,
  NewsItemSchema,
  OptionChainSchema,
  OrderBookSchema,
  QuoteBatchSchema,
  QuoteSchema,
  ScreenRowSchema,
  TradePrintSchema,
  envelope,
  type ProviderCapability,
} from '@tyche/contracts';
import type { DataProvider } from './Provider';

export interface ConformanceCheck {
  capability: ProviderCapability | string;
  passed: boolean;
  error?: string;
}

export interface ConformanceReport {
  provider: string;
  ok: boolean;
  checks: ConformanceCheck[];
}

interface Probe {
  call: (provider: DataProvider) => Promise<unknown>;
  schema: z.ZodTypeAny;
}

/**
 * For each capability the foundation knows how to probe, a call + the schema its
 * envelope must satisfy. Capabilities a provider declares but that have no probe
 * here are reported as `passed` (nothing to verify yet).
 */
function buildProbes(equitySymbol: string, cryptoSymbol: string): Partial<Record<ProviderCapability, Probe>> {
  return {
    quotes: { call: (p) => p.getQuote(equitySymbol), schema: envelope(QuoteSchema) },
    batchQuotes: {
      call: (p) => p.getQuotes([equitySymbol, cryptoSymbol]),
      schema: envelope(QuoteBatchSchema),
    },
    historicalPrices: {
      call: (p) => p.getHistory(equitySymbol, { range: '1mo', interval: '1d' }),
      schema: envelope(HistoricalSeriesSchema),
    },
    intradayPrices: {
      call: (p) => p.getHistory(equitySymbol, { range: '1d', interval: '5m' }),
      schema: envelope(HistoricalSeriesSchema),
    },
    trades: { call: (p) => p.getTrades(equitySymbol), schema: envelope(z.array(TradePrintSchema)) },
    orderBook: { call: (p) => p.getOrderBook(equitySymbol), schema: envelope(OrderBookSchema) },
    news: { call: (p) => p.getNews({ symbol: equitySymbol }), schema: envelope(z.array(NewsItemSchema)) },
    filings: { call: (p) => p.getFilings(equitySymbol), schema: envelope(z.array(FilingSchema)) },
    fundamentals: {
      call: (p) => p.getFinancials(equitySymbol),
      schema: envelope(z.array(FinancialStatementSchema)),
    },
    estimates: {
      call: (p) => p.getEstimates(equitySymbol),
      schema: envelope(z.array(EstimateMetricSchema)),
    },
    analystRatings: {
      call: (p) => p.getAnalystRatings(equitySymbol),
      schema: envelope(z.array(AnalystRatingSchema)),
    },
    ownership: {
      call: (p) => p.getOwnership(equitySymbol),
      schema: envelope(z.array(InstitutionalHolderSchema)),
    },
    options: { call: (p) => p.getOptionChain(equitySymbol), schema: envelope(OptionChainSchema) },
    crypto: { call: (p) => p.getQuote(cryptoSymbol), schema: envelope(QuoteSchema) },
    screener: { call: (p) => p.screen({ filters: [], limit: 10 }), schema: envelope(z.array(ScreenRowSchema)) },
    economicSeries: {
      call: (p) => p.getEconomicSeries('GDP'),
      schema: envelope(EconomicSeriesSchema),
    },
  };
}

export interface ConformanceOptions {
  equitySymbol?: string;
  cryptoSymbol?: string;
}

/**
 * Verify that a provider honors every capability it declares: the corresponding
 * method must resolve and its envelope (data + provenance) must validate against
 * the contract schema.
 */
export async function checkProviderConformance(
  provider: DataProvider,
  options: ConformanceOptions = {},
): Promise<ConformanceReport> {
  const equitySymbol = options.equitySymbol ?? 'AAPL';
  const cryptoSymbol = options.cryptoSymbol ?? 'BTC-USD';
  const probes = buildProbes(equitySymbol, cryptoSymbol);
  const capabilities = provider.descriptor.capabilities;
  const checks: ConformanceCheck[] = [];

  for (const capability of Object.keys(capabilities) as ProviderCapability[]) {
    if (!capabilities[capability]) continue;
    const probe = probes[capability];
    if (!probe) {
      checks.push({ capability, passed: true });
      continue;
    }
    try {
      const result = await probe.call(provider);
      const parsed = probe.schema.safeParse(result);
      checks.push(
        parsed.success
          ? { capability, passed: true }
          : { capability, passed: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      );
    } catch (error) {
      checks.push({
        capability,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    provider: provider.descriptor.name,
    ok: checks.every((c) => c.passed),
    checks,
  };
}
