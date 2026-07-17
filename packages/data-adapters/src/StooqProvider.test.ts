import { describe, it, expect } from 'vitest';
import { CandleSchema, QuoteSchema } from '@tyche/contracts';
import { StooqProvider, type TextFetchLike } from './StooqProvider';
import { MemoryCache } from './cache';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';

const CSV = `Date,Open,High,Low,Close,Volume
2024-01-02,185.00,187.00,184.50,186.00,50000000
2024-01-03,186.00,188.00,185.00,187.50,45000000
`;

function makeFetch(
  urlSink: string[] = [],
  opts: { ok?: boolean; status?: number; throwErr?: boolean; body?: string } = {},
): TextFetchLike {
  return (url) => {
    urlSink.push(url);
    if (opts.throwErr) return Promise.reject(new Error('network down'));
    return Promise.resolve({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      text: () => Promise.resolve(opts.body ?? CSV),
    });
  };
}

describe('StooqProvider', () => {
  it('parses the daily CSV into schema-valid, ascending candles with volume', async () => {
    const urls: string[] = [];
    const provider = new StooqProvider({ fetchImpl: makeFetch(urls), cache: new MemoryCache(), minIntervalMs: 0 });
    const { data, provenance } = await provider.getHistory('AAPL', { range: 'max' });
    expect(urls[0]).toContain('s=aapl.us'); // .us market suffix applied
    expect(data.candles).toHaveLength(2);
    expect(data.candles[0]).toMatchObject({ t: '2024-01-02T00:00:00.000Z', o: 185, h: 187, l: 184.5, c: 186, v: 50000000 });
    for (const c of data.candles) expect(CandleSchema.safeParse(c).success).toBe(true);
    expect(data.currency).toBe('USD');
    expect(provenance?.provider).toBe('stooq');
  });

  it('derives a quote from the two most recent closes', async () => {
    const provider = new StooqProvider({ fetchImpl: makeFetch(), minIntervalMs: 0 });
    const { data } = await provider.getQuote('AAPL');
    expect(QuoteSchema.safeParse(data).success).toBe(true);
    expect(data.price).toBe(187.5);
    expect(data.prevClose).toBe(186);
    expect(data.change).toBeCloseTo(1.5, 6);
    expect(data.changePercent).toBeCloseTo(0.81, 2); // 1.5 / 186
  });

  it('best-effort batches quotes, skipping symbols that fail', async () => {
    const provider = new StooqProvider({ fetchImpl: makeFetch(), minIntervalMs: 0 });
    const { data } = await provider.getQuotes(['AAPL', 'MSFT']);
    expect(data).toHaveLength(2);
  });

  it('scopes servesSymbol to equity tickers (declines crypto/FX pairs)', () => {
    const provider = new StooqProvider();
    expect(provider.servesSymbol('AAPL')).toBe(true);
    expect(provider.servesSymbol('SPY')).toBe(true);
    expect(provider.servesSymbol('^SPX')).toBe(true);
    expect(provider.servesSymbol('BTC-USDT')).toBe(false); // Binance
    expect(provider.servesSymbol('EUR-USD')).toBe(false); // Frankfurter
  });

  it('throws a provider error when Stooq returns no data', async () => {
    const empty = new StooqProvider({ fetchImpl: makeFetch([], { body: 'No data available' }), minIntervalMs: 0 });
    await expect(empty.getHistory('NOPE')).rejects.toThrow(/No EOD data/);
    const failing = new StooqProvider({ fetchImpl: makeFetch([], { throwErr: true }), minIntervalMs: 0 });
    await expect(failing.getQuote('AAPL')).rejects.toThrow(/Stooq request failed/);
  });

  it('passes conformance for its declared capabilities', async () => {
    const provider = new StooqProvider({ fetchImpl: makeFetch(), minIntervalMs: 0 });
    const report = await checkProviderConformance(provider);
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });
});

describe('provider registry routing for Stooq', () => {
  it('routes equity price capabilities to stooq, but leaves pairs to their venues/mock', () => {
    const registry = createProviderRegistry({ providers: ['stooq', 'mock'] });
    expect(registry.forCapability('historicalPrices', 'AAPL')?.descriptor.name).toBe('stooq');
    expect(registry.forCapability('quotes', 'AAPL')?.descriptor.name).toBe('stooq');
    // Stooq declines pairs (servesSymbol false), so mock (serves all) answers.
    expect(registry.forCapability('historicalPrices', 'BTC-USDT')?.descriptor.name).toBe('mock');
    expect(registry.get('mock')).toBeDefined();
  });

  it('falls back to mock equity prices when stooq is not enabled', () => {
    const registry = createProviderRegistry({ providers: ['mock'] });
    expect(registry.forCapability('historicalPrices', 'AAPL')?.descriptor.name).toBe('mock');
  });
});
