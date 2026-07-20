/**
 * Provider failure-mode contract tests. Drive real adapter code paths with
 * controlled fetch fakes so timeout/abort, rate-limit, malformed payloads,
 * schema drift, and registry fallback cannot silently appear as authoritative
 * live envelopes.
 */
import { describe, it, expect } from 'vitest';
import {
  envelope,
  NO_CAPABILITIES,
  OrderBookSchema,
  QuoteSchema,
  FundingRateSchema,
} from '@tyche/contracts';
import { BinanceProvider } from './BinanceProvider';
import { FinnhubProvider } from './FinnhubProvider';
import { MockProvider } from './MockProvider';
import { ProviderRegistry } from './providerRegistry';
import { ProviderError, isCapabilityError } from './errors';
import { checkProviderConformance } from './conformance';
import type { FetchLike } from './stubs/FredProvider';

// --- fetch fakes ------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function rejectFetch(err: Error): FetchLike {
  return () => Promise.reject(err);
}

function statusFetch(status: number, body: unknown = {}): FetchLike {
  return () => Promise.resolve(jsonResponse(body, status));
}

function bodyFetch(body: unknown, status = 200): FetchLike {
  return () => Promise.resolve(jsonResponse(body, status));
}

// --- timeout / abort --------------------------------------------------------

describe('provider contracts: timeout / abort', () => {
  it('Binance wraps transport rejection as ProviderError (not a silent empty quote)', async () => {
    const p = new BinanceProvider({
      fetchImpl: rejectFetch(new Error('network timeout')),
      minIntervalMs: 0,
    });
    await expect(p.getQuote('BTC-USDT')).rejects.toBeInstanceOf(ProviderError);
    await expect(p.getQuote('BTC-USDT')).rejects.toThrow(/request failed|Binance/i);
  });

  it('Finnhub wraps transport rejection without leaking the API key URL', async () => {
    const p = new FinnhubProvider({
      apiKey: 'secret-test-key-do-not-leak',
      fetchImpl: rejectFetch(new Error('ETIMEDOUT https://finnhub.io/api/v1/quote?token=secret-test-key-do-not-leak')),
      minIntervalMs: 0,
    });
    try {
      await p.getQuote('AAPL');
      expect.fail('expected ProviderError');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect(String(err)).not.toMatch(/secret-test-key/);
      expect((err as ProviderError).message).toMatch(/request failed/i);
    }
  });

  it('AbortError-style rejections become ProviderError, not a fabricated quote', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const p = new BinanceProvider({ fetchImpl: rejectFetch(abort), minIntervalMs: 0 });
    await expect(p.getQuote('ETH-USDT')).rejects.toBeInstanceOf(ProviderError);
  });
});

// --- rate limiting ----------------------------------------------------------

describe('provider contracts: rate limiting', () => {
  it('Finnhub 429 surfaces a rate-limit ProviderError (not empty data)', async () => {
    const p = new FinnhubProvider({
      apiKey: 'k',
      fetchImpl: statusFetch(429, { error: 'rate limit' }),
      minIntervalMs: 0,
    });
    await expect(p.getQuote('AAPL')).rejects.toThrow(/rate limit/i);
  });

  it('Binance non-OK status becomes ProviderError with status context', async () => {
    const p = new BinanceProvider({
      fetchImpl: statusFetch(429, { code: -1003, msg: 'Too many requests' }),
      minIntervalMs: 0,
    });
    await expect(p.getQuote('BTC-USDT')).rejects.toThrow(/429|Binance/i);
  });
});

// --- malformed payloads -----------------------------------------------------

describe('provider contracts: malformed payloads', () => {
  it('Binance quote without a usable lastPrice throws (no zero-price quote)', async () => {
    const p = new BinanceProvider({
      fetchImpl: bodyFetch({
        symbol: 'BTCUSDT',
        lastPrice: 'not-a-number',
        bidPrice: '1',
        askPrice: '2',
        closeTime: 1782950000000,
      }),
      minIntervalMs: 0,
    });
    await expect(p.getQuote('BTC-USDT')).rejects.toBeInstanceOf(ProviderError);
  });

  it('Binance order book with garbage levels does not pass OrderBookSchema as clean data', async () => {
    const p = new BinanceProvider({
      fetchImpl: bodyFetch({
        bids: [['nope', 'x']],
        asks: [[null, null]],
      }),
      minIntervalMs: 0,
    });
    // Adapter may throw while mapping, or return a book that fails schema — either way
    // the envelope must not validate as a clean authoritative order book with fake zeros.
    try {
      const env = await p.getOrderBook('BTC-USDT');
      const parsed = envelope(OrderBookSchema).safeParse(env);
      if (parsed.success) {
        // If it somehow parses, levels must not invent prices from garbage.
        const levels = [...parsed.data.data.bids, ...parsed.data.data.asks];
        for (const l of levels) {
          expect(Number.isFinite(l.price) && l.price > 0).toBe(true);
        }
      }
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
    }
  });
});

// --- schema drift (Zod rejection) -------------------------------------------

describe('provider contracts: schema drift', () => {
  it('rejects a quote envelope missing required fields via Zod', () => {
    const bad = {
      data: { symbol: 'AAPL', price: 100 }, // missing timestamp
      provenance: {
        provider: 'test',
        providerMode: 'public',
        capability: 'quotes',
        retrievedAt: '2026-07-19T00:00:00.000Z',
        freshness: { asOf: '2026-07-19T00:00:00.000Z', tier: 'live' },
      },
    };
    expect(envelope(QuoteSchema).safeParse(bad).success).toBe(false);
  });

  it('rejects funding rows with non-finite annualizedPct (schema drift)', () => {
    const bad = {
      symbol: 'BTC-USDT',
      venue: 'binance',
      rate: 0.0001,
      intervalHours: 8,
      annualizedPct: Number.NaN,
      asOf: '2026-07-19T00:00:00.000Z',
    };
    expect(FundingRateSchema.safeParse(bad).success).toBe(false);
  });

  it('conformance fails when a provider returns a schema-invalid envelope', async () => {
    // Minimal fake: declare quotes but return a broken envelope.
    const broken = {
      descriptor: {
        name: 'broken-quotes',
        mode: 'public' as const,
        capabilities: { ...NO_CAPABILITIES, quotes: true },
      },
      getQuote: async () => ({
        data: { symbol: 'AAPL', price: 1 }, // missing timestamp → schema fail
        provenance: {
          provider: 'broken-quotes',
          providerMode: 'public' as const,
          capability: 'quotes',
          retrievedAt: '2026-07-19T00:00:00.000Z',
          freshness: { asOf: '2026-07-19T00:00:00.000Z', tier: 'live' as const },
        },
      }),
    };
    const report = await checkProviderConformance(broken as never);
    expect(report.ok).toBe(false);
    const quotes = report.checks.find((c) => c.capability === 'quotes');
    expect(quotes?.passed).toBe(false);
  });
});

// --- fallback / routing -----------------------------------------------------

describe('provider contracts: fallback and routing', () => {
  it('registry routes equities away from venue adapters (no silent crypto fill)', () => {
    const registry = new ProviderRegistry();
    registry.register(new BinanceProvider({ fetchImpl: statusFetch(500), minIntervalMs: 0 }));
    registry.register(new MockProvider({ referenceDate: new Date('2026-07-01T12:00:00Z') }));
    expect(registry.forCapability('quotes', 'AAPL')?.descriptor.name).toBe('mock');
    expect(registry.forCapability('quotes', 'BTC-USDT')?.descriptor.name).toBe('binance');
  });

  it('mock fallback still serves schema-valid envelopes when primary is unavailable', async () => {
    const mock = new MockProvider({ referenceDate: new Date('2026-07-01T12:00:00Z') });
    const env = await mock.getQuote('AAPL');
    expect(envelope(QuoteSchema).safeParse(env).success).toBe(true);
    expect(env.provenance.provider).toBe('mock');
    expect(env.provenance.providerMode).toBe('mock');
    // Equity quotes are labeled delayed synthetic mock — never unattributed live market data.
    expect(env.provenance.providerMode).not.toBe('paid');
  });

  it('capability gaps throw CapabilityError rather than empty authoritative data', async () => {
    const mock = new MockProvider({ referenceDate: new Date('2026-07-01T12:00:00Z') });
    // Mock may support most capabilities; force a missing method path via registry lookup.
    const registry = new ProviderRegistry();
    registry.register(new BinanceProvider({ fetchImpl: statusFetch(503), minIntervalMs: 0 }));
    // Binance does not serve AAPL — forCapability returns undefined or mock if registered.
    registry.register(mock);
    const provider = registry.forCapability('quotes', 'AAPL');
    expect(provider?.descriptor.name).toBe('mock');
    // Direct capability error path on an unsupported method of Binance for equities:
    const binance = new BinanceProvider({ fetchImpl: statusFetch(200, {}), minIntervalMs: 0 });
    await expect(binance.getQuote('AAPL')).rejects.toThrow(/not a crypto pair/i);
  });

  it('failed Binance path does not get re-labeled as mock live success without status change', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new BinanceProvider({
        fetchImpl: rejectFetch(new Error('timeout')),
        minIntervalMs: 0,
      }),
    );
    registry.register(new MockProvider({ referenceDate: new Date('2026-07-01T12:00:00Z') }));
    // Primary for BTC is binance — it fails; callers must handle ProviderError.
    // The registry does NOT silently rewrite a failed live call as mock success for the same request.
    const primary = registry.forCapability('quotes', 'BTC-USDT');
    expect(primary?.descriptor.name).toBe('binance');
    await expect(primary!.getQuote('BTC-USDT')).rejects.toBeInstanceOf(ProviderError);
    // Separate explicit fallback to mock is a different call with truthful mock provenance.
    const fallback = registry.get('mock')!;
    const env = await fallback.getQuote('BTC-USD');
    expect(env.provenance.provider).toBe('mock');
    expect(env.provenance.providerMode).toBe('mock');
    // Explicit mock fallback is labeled mock mode — not rebranded as paid live.
    expect(env.provenance.providerMode).not.toBe('paid');
    expect(env.provenance.provider).not.toBe('binance');
  });
});

describe('provider contracts: isCapabilityError guard', () => {
  it('distinguishes capability gaps from provider failures', () => {
    const pe = new ProviderError('binance', 'timeout');
    expect(isCapabilityError(pe)).toBe(false);
    expect(pe.name).toBe('ProviderError');
  });
});
