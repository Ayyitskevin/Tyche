import { describe, it, expect } from 'vitest';
import {
  QuoteSchema,
  HistoricalSeriesSchema,
  OptionChainSchema,
  EstimateMetricSchema,
  AnalystRatingSchema,
  InstitutionalHolderSchema,
} from '@tyche/contracts';
import { z } from 'zod';
import { MockProvider } from './MockProvider';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';
import { SEED_SYMBOLS } from './seed';

const fixedDate = new Date('2026-06-15T20:00:00.000Z');

describe('MockProvider conformance', () => {
  it('honors every declared capability with schema-valid envelopes', async () => {
    const provider = new MockProvider({ referenceDate: fixedDate });
    const report = await checkProviderConformance(provider);
    const failed = report.checks.filter((c) => !c.passed);
    expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);
    expect(report.ok).toBe(true);
  });
});

describe('MockProvider data', () => {
  const provider = new MockProvider({ referenceDate: fixedDate });

  it('serves quotes for every seed symbol', async () => {
    for (const symbol of SEED_SYMBOLS) {
      const { data, provenance } = await provider.getQuote(symbol);
      expect(QuoteSchema.safeParse(data).success).toBe(true);
      expect(data.symbol).toBe(symbol);
      expect(provenance.provider).toBe('mock');
      expect(provenance.freshness.asOf).toBeDefined();
    }
  });

  it('is deterministic across instances for the same reference date', async () => {
    const a = new MockProvider({ referenceDate: fixedDate });
    const b = new MockProvider({ referenceDate: fixedDate });
    const [qa, qb] = await Promise.all([a.getQuote('AAPL'), b.getQuote('AAPL')]);
    expect(qa.data.price).toBe(qb.data.price);
  });

  it('respects history range length and validates the series', async () => {
    const { data } = await provider.getHistory('MSFT', { range: '1mo', interval: '1d' });
    expect(HistoricalSeriesSchema.safeParse(data).success).toBe(true);
    expect(data.candles.length).toBeGreaterThan(10);
    expect(data.candles.length).toBeLessThanOrEqual(22);
    // OHLC invariants
    for (const c of data.candles) {
      expect(c.h).toBeGreaterThanOrEqual(c.l);
      expect(c.h).toBeGreaterThanOrEqual(c.o);
      expect(c.h).toBeGreaterThanOrEqual(c.c);
    }
  });

  it('returns empty (not an error) for inapplicable capabilities on crypto', async () => {
    const { data } = await provider.getFinancials('BTC-USD');
    expect(data).toEqual([]);
  });

  it('synthesizes data for unknown symbols so DES never crashes', async () => {
    const { data } = await provider.getInstrument('NFLX');
    expect(data.symbol).toBe('NFLX');
    expect(data.name.length).toBeGreaterThan(0);
  });

  it('returns a multi-symbol global news feed when no symbol is given', async () => {
    const { data } = await provider.getNews({ limit: 30 });
    const distinct = new Set(data.flatMap((it) => it.symbols));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('filters news by source (case-insensitive)', async () => {
    const { data } = await provider.getNews({ source: 'tyche wire', limit: 50 });
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((it) => it.source === 'Tyche Wire')).toBe(true);
  });

  it('filters news by keyword over headline + summary', async () => {
    const { data } = await provider.getNews({ keyword: 'guidance', limit: 50 });
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((it) => `${it.headline} ${it.summary ?? ''}`.toLowerCase().includes('guidance'))).toBe(true);
  });

  it('filters news by a since/until date window', async () => {
    const since = '2026-06-14T20:00:00.000Z'; // 24h before the fixed reference date
    const { data } = await provider.getNews({ since, limit: 50 });
    expect(data.every((it) => Date.parse(it.publishedAt) >= Date.parse(since))).toBe(true);
  });

  it('returns an empty feed for an explicitly empty symbol set', async () => {
    const { data } = await provider.getNews({ symbols: [] });
    expect(data).toEqual([]);
  });

  it('honors the limit', async () => {
    const { data } = await provider.getNews({ limit: 5 });
    expect(data.length).toBeLessThanOrEqual(5);
  });

  it('returns a schema-valid option chain with IV and Greeks for an optionable name', async () => {
    const { data, provenance } = await provider.getOptionChain('AAPL');
    expect(OptionChainSchema.safeParse(data).success).toBe(true);
    expect(data.expirations.length).toBeGreaterThan(0);
    expect(data.contracts.length).toBeGreaterThan(0);
    const c = data.contracts[0]!;
    expect(typeof c.impliedVolatility).toBe('number');
    expect(typeof c.greeks?.delta).toBe('number');
    expect(provenance.capability).toBe('options');
  });

  it('returns an empty chain (not an error) for a non-optionable symbol', async () => {
    const { data } = await provider.getOptionChain('BTC-USD');
    expect(data.contracts).toEqual([]);
    expect(data.expirations).toEqual([]);
  });

  it('returns schema-valid estimates, ratings, and ownership for an equity', async () => {
    const est = await provider.getEstimates('AAPL');
    expect(z.array(EstimateMetricSchema).safeParse(est.data).success).toBe(true);
    expect(est.data.some((m) => m.metric === 'eps')).toBe(true);
    expect(est.provenance.capability).toBe('estimates');

    const rat = await provider.getAnalystRatings('AAPL');
    expect(z.array(AnalystRatingSchema).safeParse(rat.data).success).toBe(true);
    expect(rat.data.length).toBeGreaterThan(0);
    expect(rat.provenance.capability).toBe('analystRatings');

    const own = await provider.getOwnership('AAPL');
    expect(z.array(InstitutionalHolderSchema).safeParse(own.data).success).toBe(true);
    expect(own.data.length).toBeGreaterThan(0);
    expect(own.provenance.capability).toBe('ownership');
  });

  it('returns empty estimates/ratings/ownership for a non-equity symbol', async () => {
    expect((await provider.getEstimates('BTC-USD')).data).toEqual([]);
    expect((await provider.getAnalystRatings('BTC-USD')).data).toEqual([]);
    expect((await provider.getOwnership('BTC-USD')).data).toEqual([]);
  });
});

describe('ProviderRegistry', () => {
  it('always provides mock and resolves capabilities', () => {
    const registry = createProviderRegistry({ providers: ['yahoo'] });
    expect(registry.get('mock')).toBeDefined();
    expect(registry.get('yahoo')).toBeDefined();
    // yahoo stub declares nothing, so quotes resolve to mock
    expect(registry.forCapability('quotes')?.descriptor.name).toBe('mock');
    expect(registry.aggregateCapabilities().quotes).toBe(true);
    expect(registry.aggregateCapabilities().futures).toBe(false);
    expect(registry.missingCapabilities(['quotes', 'futures'])).toEqual(['futures']);
  });
});
