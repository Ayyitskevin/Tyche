import { describe, it, expect } from 'vitest';
import {
  QuoteSchema,
  HistoricalSeriesSchema,
  OptionChainSchema,
  EstimateMetricSchema,
  AnalystRatingSchema,
  InstitutionalHolderSchema,
  InstitutionalPortfolioSchema,
  InstitutionalChangesSchema,
  EconomicSeriesSchema,
  CorporateEventSchema,
  DexPoolSchema,
} from '@tyche/contracts';
import { z } from 'zod';
import { MockProvider } from './MockProvider';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';
import { SEED_INSTRUMENTS, SEED_SYMBOLS } from './seed';

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

  it('populates a deterministic ytdPercent on batch quotes', async () => {
    const { data, provenance } = await provider.getQuotes(['SPY', 'QQQ', 'EWJ']);
    expect(data).toHaveLength(3);
    for (const q of data) expect(typeof q.ytdPercent).toBe('number');
    expect(provenance.capability).toBe('batchQuotes');
    // Deterministic for a fixed reference date.
    const again = new MockProvider({ referenceDate: fixedDate });
    expect((await again.getQuotes(['SPY'])).data[0]!.ytdPercent).toBe(data[0]!.ytdPercent);
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

describe('MockProvider economic series', () => {
  const provider = new MockProvider({ referenceDate: fixedDate });

  it('returns a schema-valid catalog series with units and observations', async () => {
    const { data, provenance } = await provider.getEconomicSeries('UNRATE');
    expect(EconomicSeriesSchema.safeParse(data).success).toBe(true);
    expect(data.seriesId).toBe('UNRATE');
    expect(data.units).toBe('Percent');
    expect(data.observations.length).toBeGreaterThan(100);
    expect(provenance.capability).toBe('economicSeries');
    // Observations are ordered oldest → newest.
    const dates = data.observations.map((o) => o.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('synthesizes a series for an unknown id and is deterministic', async () => {
    const a = await provider.getEconomicSeries('ZZUNKNOWN');
    const b = await provider.getEconomicSeries('zzunknown');
    expect(a.data.title).toContain('synthetic');
    expect(a.data.observations).toEqual(b.data.observations); // id is upper-cased + seeded
  });

  it('honors a limit by returning the most recent observations', async () => {
    const full = await provider.getEconomicSeries('CPIAUCSL');
    const limited = await provider.getEconomicSeries('CPIAUCSL', { limit: 12 });
    expect(limited.data.observations).toHaveLength(12);
    expect(limited.data.observations.at(-1)?.date).toBe(full.data.observations.at(-1)?.date);
  });
});

describe('MockProvider corporate events + market session', () => {
  const provider = new MockProvider({ referenceDate: fixedDate });

  it('generates schema-valid, deterministic events sorted by date', async () => {
    const a = await provider.getEvents({ days: 90 });
    const b = await provider.getEvents({ days: 90 });
    expect(z.array(CorporateEventSchema).safeParse(a.data).success).toBe(true);
    expect(a.data.length).toBeGreaterThan(0);
    expect(a.data).toEqual(b.data); // deterministic
    const dates = a.data.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    expect(a.provenance.capability).toBe('events');
  });

  it('scopes to a symbol and includes at least one earnings event in 90 days', async () => {
    const { data } = await provider.getEvents({ symbol: 'AAPL', days: 90 });
    expect(data.every((e) => e.symbol === 'AAPL')).toBe(true);
    expect(data.some((e) => e.type === 'earnings')).toBe(true);
  });

  it('publishes no corporate events for crypto', async () => {
    const { data } = await provider.getEvents({ symbol: 'BTC-USD', days: 90 });
    expect(data).toEqual([]);
  });

  it('derives the market session from the clock (weekday 20:00 UTC = post) and keeps crypto 24/7', async () => {
    // fixedDate is Monday 2026-06-15T20:00:00Z.
    const equity = await provider.getQuote('AAPL');
    expect(equity.data.marketState).toBe('post');
    const crypto = await provider.getQuote('BTC-USD');
    expect(crypto.data.marketState).toBe('regular');
    const weekend = new MockProvider({ referenceDate: new Date('2026-06-14T15:00:00.000Z') }); // Sunday
    expect((await weekend.getQuote('AAPL')).data.marketState).toBe('closed');
  });
});

describe('MockProvider DEX pools + commodities', () => {
  const provider = new MockProvider({ referenceDate: fixedDate });

  it('returns deterministic, schema-valid pools sorted deepest-liquidity first', async () => {
    const a = await provider.getDexPools('ETH');
    const b = await provider.getDexPools('ETH');
    expect(z.array(DexPoolSchema).safeParse(a.data).success).toBe(true);
    expect(a.data.length).toBeGreaterThan(0);
    expect(a.data.map((p) => p.pairAddress)).toEqual(b.data.map((p) => p.pairAddress)); // deterministic
    const liq = a.data.map((p) => p.liquidityUsd ?? 0);
    expect([...liq].sort((x, y) => y - x)).toEqual(liq);
    expect(a.provenance.capability).toBe('dexPools');
  });

  it('prices pools off the seeded quote for known tokens and honors the limit', async () => {
    const quote = await provider.getQuote('ETH-USD');
    const { data } = await provider.getDexPools('ETH-USD', 3); // pair input → base token
    expect(data).toHaveLength(3);
    for (const pool of data) {
      expect(pool.baseToken.symbol).toBe('ETH');
      // Venue dispersion stays within ±0.2% of the mock spot.
      expect(Math.abs((pool.priceUsd ?? 0) / quote.data.price - 1)).toBeLessThan(0.002);
    }
  });

  it('synthesizes pools for unknown tokens too (keyless demo never dead-ends)', async () => {
    const { data } = await provider.getDexPools('ZORP');
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((p) => p.baseToken.symbol === 'ZORP')).toBe(true);
  });

  it('serves quotes and history for the seeded commodities', async () => {
    const commodities = SEED_INSTRUMENTS.filter((s) => s.assetClass === 'commodity');
    expect(commodities.length).toBeGreaterThanOrEqual(6);
    const groups = new Set(commodities.map((c) => c.sector));
    expect(groups).toEqual(new Set(['Energy', 'Metals', 'Agriculture']));
    const gold = await provider.getQuote('XAU-USD');
    expect(QuoteSchema.safeParse(gold.data).success).toBe(true);
    expect(gold.data.price).toBeGreaterThan(0);
    const history = await provider.getHistory('WTI-USD', { range: '1mo' });
    expect(HistoricalSeriesSchema.safeParse(history.data).success).toBe(true);
    expect(history.data.candles.length).toBeGreaterThan(10);
  });
});

describe('MockProvider 13F institutional holdings + changes', () => {
  const provider = new MockProvider({ referenceDate: fixedDate });

  it('synthesizes a schema-valid, weight-ranked snapshot for any manager', async () => {
    const { data } = await provider.getInstitutionalHoldings('BERKSHIRE');
    expect(InstitutionalPortfolioSchema.safeParse(data).success).toBe(true);
    expect(data.manager).toBe('Berkshire Hathaway');
    expect(data.holdings.length).toBeGreaterThan(0);
    // Sorted by value, descending.
    for (let i = 1; i < data.holdings.length; i++) {
      expect(data.holdings[i - 1]!.value).toBeGreaterThanOrEqual(data.holdings[i]!.value);
    }
  });

  it('synthesizes a schema-valid quarter-over-quarter diff with a new buy and an exit', async () => {
    const { data } = await provider.getInstitutionalChanges('BERKSHIRE');
    expect(InstitutionalChangesSchema.safeParse(data).success).toBe(true);
    expect(data.hasPrior).toBe(true);
    expect(data.newCount).toBeGreaterThan(0); // the dropped-last name reads as new
    expect(data.exitedCount).toBeGreaterThan(0); // the synthetic exited name
    expect(data.changes.every((c) => c.action !== 'unchanged')).toBe(true); // movers only
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
    expect(registry.aggregateCapabilities().bonds).toBe(false);
    expect(registry.missingCapabilities(['quotes', 'bonds'])).toEqual(['bonds']);
  });
});
