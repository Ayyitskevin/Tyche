import { describe, it, expect } from 'vitest';
import { QuoteSchema } from '@tyche/contracts';
import { FinnhubProvider, type FetchLike } from './FinnhubProvider';
import { MemoryCache } from './cache';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';

const KEY = 'SECRET-FINNHUB-KEY';
/** A normal, tradeable-symbol `/quote` response. */
const QUOTE = { c: 187.5, d: 1.5, dp: 0.806, h: 188.2, l: 185.9, o: 186.1, pc: 186.0, t: 1704300000 };
/** Finnhub's answer for an unknown/never-printed symbol: all zeros. */
const ZERO = { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 };

function makeFetch(
  urlSink: string[] = [],
  opts: {
    ok?: boolean;
    status?: number;
    throwErr?: boolean;
    body?: unknown;
    bodyFor?: (url: string) => unknown;
  } = {},
): FetchLike {
  return (url) => {
    urlSink.push(url);
    if (opts.throwErr) return Promise.reject(new Error('network down'));
    const body = opts.bodyFor ? opts.bodyFor(url) : (opts.body ?? QUOTE);
    return Promise.resolve({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: () => Promise.resolve(body),
    });
  };
}

function provider(fetchImpl: FetchLike): FinnhubProvider {
  return new FinnhubProvider({ apiKey: KEY, fetchImpl, cache: new MemoryCache(), minIntervalMs: 0 });
}

describe('FinnhubProvider', () => {
  it('maps a Finnhub payload to a schema-valid, live quote', async () => {
    const urls: string[] = [];
    const { data, provenance } = await provider(makeFetch(urls)).getQuote('AAPL');
    expect(urls[0]).toContain('symbol=AAPL');
    expect(urls[0]).toContain(`token=${KEY}`); // key travels only as a request param
    expect(QuoteSchema.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({ symbol: 'AAPL', currency: 'USD', price: 187.5, prevClose: 186 });
    expect(data.change).toBeCloseTo(1.5, 6);
    expect(data.changePercent).toBeCloseTo(0.806, 3); // Finnhub's own dp is used as-is
    expect(data.timestamp).toBe(new Date(1704300000 * 1000).toISOString());
    expect(provenance?.provider).toBe('finnhub');
    expect(provenance?.providerMode).toBe('user_supplied'); // bring-your-own-key, never resold
    expect(provenance?.freshness.tier).toBe('live');
    // The key must never leak into provenance (it is not part of the citation surface).
    expect(JSON.stringify(provenance)).not.toContain(KEY);
  });

  it('omits non-positive OHLC and derives change from prevClose when d/dp are absent', async () => {
    const body = { c: 187.5, pc: 186.0, o: 0, h: 0, l: 0, t: 0 }; // premarket-ish: no o/h/l, no d/dp
    const { data } = await provider(makeFetch([], { body })).getQuote('AAPL');
    expect(QuoteSchema.safeParse(data).success).toBe(true);
    expect(data.open).toBeUndefined();
    expect(data.dayHigh).toBeUndefined();
    expect(data.dayLow).toBeUndefined();
    expect(data.change).toBeCloseTo(1.5, 6);
    expect(data.changePercent).toBeCloseTo(0.81, 2); // 1.5 / 186, computed
    expect(typeof data.timestamp).toBe('string'); // t=0 → falls back to now
  });

  it('derives change from prevClose on explicit null deltas (not just absent keys)', async () => {
    // Finnhub emits d/dp as JSON null (not missing) around the open / for thin names —
    // a regression guard: null must not short-circuit the prevClose-based fallback to 0.
    const body = { c: 187.5, pc: 186.0, d: null, dp: null, h: 188.2, l: 185.9, o: 186.1, t: 1704300000 };
    const { data } = await provider(makeFetch([], { body })).getQuote('AAPL');
    expect(QuoteSchema.safeParse(data).success).toBe(true);
    expect(data.change).toBeCloseTo(1.5, 6); // NOT 0
    expect(data.changePercent).toBeCloseTo(0.81, 2); // 1.5 / 186, computed
  });

  it('falls back to now for an out-of-range timestamp instead of throwing a RangeError', async () => {
    const body = { c: 187.5, pc: 186.0, t: 9e15 }; // absurd unix seconds → Date overflow if used raw
    const { data } = await provider(makeFetch([], { body })).getQuote('AAPL');
    expect(QuoteSchema.safeParse(data).success).toBe(true);
    expect(Number.isNaN(Date.parse(data.timestamp))).toBe(false); // a valid, parseable ISO instant
  });

  it('best-effort batches quotes, skipping symbols the key can not answer', async () => {
    const bodyFor = (url: string) => (url.includes('symbol=AAPL') ? QUOTE : ZERO);
    const { data, provenance } = await provider(makeFetch([], { bodyFor })).getQuotes(['AAPL', 'MSFT']);
    expect(data).toHaveLength(1); // MSFT's all-zero quote is dropped, not surfaced as price 0
    expect(data[0]!.symbol).toBe('AAPL');
    expect(provenance?.capability).toBe('batchQuotes');
  });

  it('scopes servesSymbol to US equity tickers (declines crypto/FX pairs and ^ indices)', () => {
    const p = provider(makeFetch());
    expect(p.servesSymbol('AAPL')).toBe(true);
    expect(p.servesSymbol('SPY')).toBe(true);
    expect(p.servesSymbol('BRK.B')).toBe(true);
    expect(p.servesSymbol('BTC-USDT')).toBe(false); // Binance
    expect(p.servesSymbol('EUR-USD')).toBe(false); // Frankfurter
    expect(p.servesSymbol('^SPX')).toBe(false); // Finnhub free tier has no index quotes → Stooq/mock
  });

  it('refuses to construct without a key and never leaks the key in errors', async () => {
    expect(() => new FinnhubProvider({ apiKey: '' })).toThrow(/requires an API key/);
    expect(() => new FinnhubProvider({ apiKey: '   ' })).toThrow(/requires an API key/);

    const unauthorized = provider(makeFetch([], { ok: false, status: 401 }));
    await expect(unauthorized.getQuote('AAPL')).rejects.toThrow(/rejected the API key/);

    const limited = provider(makeFetch([], { ok: false, status: 429 }));
    await expect(limited.getQuote('AAPL')).rejects.toThrow(/rate limit/);

    const down = provider(makeFetch([], { throwErr: true }));
    await expect(down.getQuote('AAPL')).rejects.toThrow(/request failed/);

    const noData = provider(makeFetch([], { body: ZERO }));
    await expect(noData.getQuote('NOPE')).rejects.toThrow(/No quote/);
  });

  it('passes conformance for its declared capabilities', async () => {
    const report = await checkProviderConformance(provider(makeFetch()));
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });
});

describe('provider registry routing for Finnhub', () => {
  it('wins real-time equity quotes over stooq when a key is configured', () => {
    const registry = createProviderRegistry({
      providers: ['finnhub', 'stooq', 'mock'],
      finnhubApiKey: KEY,
    });
    // Finnhub (registered first) serves equity quotes...
    expect(registry.forCapability('quotes', 'AAPL')?.descriptor.name).toBe('finnhub');
    expect(registry.forCapability('batchQuotes', 'AAPL')?.descriptor.name).toBe('finnhub');
    // ...but history has no Finnhub capability, so it stays with the EOD adapter.
    expect(registry.forCapability('historicalPrices', 'AAPL')?.descriptor.name).toBe('stooq');
    // Finnhub declines indices → the EOD adapter answers them.
    expect(registry.forCapability('quotes', '^SPX')?.descriptor.name).toBe('stooq');
    // Crypto pairs are declined by both equity adapters → mock (or a venue) answers.
    expect(registry.forCapability('quotes', 'BTC-USDT')?.descriptor.name).toBe('mock');
  });

  it('is not registered without a key, so quotes fall back to the EOD adapter', () => {
    const registry = createProviderRegistry({ providers: ['finnhub', 'stooq', 'mock'] });
    expect(registry.get('finnhub')).toBeUndefined();
    expect(registry.forCapability('quotes', 'AAPL')?.descriptor.name).toBe('stooq');
  });

  it('treats a whitespace-only key as no key (no boot crash, quotes fall back to stooq)', () => {
    const build = () =>
      createProviderRegistry({ providers: ['finnhub', 'stooq', 'mock'], finnhubApiKey: '   ' });
    expect(build).not.toThrow(); // must not fail-loud out of buildApp
    const registry = build();
    expect(registry.get('finnhub')).toBeUndefined();
    expect(registry.forCapability('quotes', 'AAPL')?.descriptor.name).toBe('stooq');
  });
});
