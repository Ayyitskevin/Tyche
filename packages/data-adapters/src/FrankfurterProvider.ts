import {
  NO_CAPABILITIES,
  type DataProvenance,
  type Envelope,
  type HistoricalSeries,
  type Instrument,
  type ProviderCapability,
  type ProviderDescriptor,
  type Quote,
  type QuoteBatch,
  type SearchResult,
} from '@tyche/contracts';
import { StubProvider, type HistoryQuery } from './Provider';
import { ProviderError } from './errors';
import { MemoryCache, type CacheStore } from './cache';
import { makeProvenance, withProvenance } from './provenance';
import type { FetchLike } from './stubs/FredProvider';

const BASE_URL = 'https://api.frankfurter.app';

/** Currencies in the ECB reference set (Frankfurter's universe). */
const ECB_CURRENCIES = new Set([
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR',
  'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK',
  'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);
const PAIR = /^([A-Z]{3})-([A-Z]{3})$/;

const SERIES_TTL = 30 * 60 * 1000;

const RANGE_DAYS: Record<string, number> = {
  '1d': 10, // need at least two observations for a change
  '5d': 10,
  '1mo': 31,
  '3mo': 93,
  '6mo': 186,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
  max: 3650,
};

interface SeriesResponse {
  base?: string;
  rates?: Record<string, Record<string, number>>;
}

export interface FrankfurterProviderOptions {
  cache?: CacheStore;
  fetchImpl?: FetchLike;
  minIntervalMs?: number;
}

/**
 * Frankfurter FX adapter — real, keyless daily ECB reference rates for ISO
 * currency pairs (`EUR-USD`, `USD-JPY`, …): `fx`, `quotes`, `batchQuotes`, and
 * daily `historicalPrices`. Reference rates are one fixing per business day, so
 * everything is EOD-tier and candles are flat (o=h=l=c) — honest about what the
 * source provides. {@link servesSymbol} confines the adapter to ECB currency
 * pairs so it never intercepts equities or crypto.
 */
export class FrankfurterProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'frankfurter',
    mode: 'public',
    capabilities: {
      ...NO_CAPABILITIES,
      quotes: true,
      batchQuotes: true,
      historicalPrices: true,
      fx: true,
    },
    freshness: [
      { capability: 'quotes', tier: 'eod' },
      { capability: 'historicalPrices', tier: 'historical' },
    ],
    attribution: 'FX reference rates via Frankfurter (European Central Bank)',
    attributionRequired: true,
    homepage: 'https://frankfurter.dev',
    description: 'Daily ECB reference rates for ~30 currencies. Keyless public API; one fixing per business day.',
    requiresConfiguration: false,
  };

  private readonly cache: CacheStore;
  private readonly fetchImpl: FetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: FrankfurterProviderOptions = {}) {
    super();
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 100;
  }

  servesSymbol(symbol: string): boolean {
    const match = PAIR.exec(symbol.trim().toUpperCase());
    if (!match) return false;
    const [, base, quote] = match;
    return base !== quote && ECB_CURRENCIES.has(base!) && ECB_CURRENCIES.has(quote!);
  }

  override async searchInstruments(query: string, limit = 12): Promise<Envelope<SearchResult[]>> {
    const q = query.trim().toUpperCase().replace('/', '-');
    const hits: SearchResult[] = [];
    if (/^[A-Z]{2,3}(-[A-Z]{0,3})?$/.test(q)) {
      const [base, quotePrefix = ''] = q.split('-') as [string, string?];
      for (const currency of ECB_CURRENCIES) {
        if (!currency.startsWith(base!) ) continue;
        for (const quote of ['USD', 'EUR', 'JPY', 'GBP', 'CHF']) {
          if (currency === quote) continue;
          if (quotePrefix && !quote.startsWith(quotePrefix)) continue;
          hits.push({
            identifier: { symbol: `${currency}-${quote}`, assetClass: 'fx', exchange: 'ECB', currency: quote },
            name: `${currency} / ${quote} (ECB reference)`,
            matchedOn: 'symbol',
          });
          if (hits.length >= limit) break;
        }
        if (hits.length >= limit) break;
      }
    }
    return withProvenance(hits, this.prov('quotes'));
  }

  override async getInstrument(symbol: string): Promise<Envelope<Instrument>> {
    const { base, quote, dash } = this.pair(symbol);
    const data: Instrument = {
      symbol: dash,
      assetClass: 'fx',
      exchange: 'ECB',
      currency: quote,
      name: `${base} / ${quote}`,
      description: `${base} priced in ${quote}, daily ECB reference fixing via Frankfurter.`,
      active: true,
    };
    return withProvenance(data, this.prov('quotes'));
  }

  override async getQuote(symbol: string): Promise<Envelope<Quote>> {
    const series = await this.series(symbol, 10);
    const points = series.points;
    const last = points[points.length - 1];
    const prev = points[points.length - 2] ?? last;
    if (!last) throw new ProviderError('frankfurter', `No rates for ${symbol}.`);
    const change = last.rate - (prev?.rate ?? last.rate);
    const quote: Quote = {
      symbol: series.dash,
      currency: series.quote,
      price: last.rate,
      prevClose: prev?.rate ?? last.rate,
      change: Math.round(change * 1e6) / 1e6,
      changePercent: prev?.rate ? Math.round((change / prev.rate) * 1e4) / 100 : 0,
      timestamp: `${last.date}T16:00:00.000Z`, // ECB fixing is ~14:15 CET; EOD-tier
    };
    return withProvenance(quote, this.prov('quotes'));
  }

  override async getQuotes(symbols: string[]): Promise<Envelope<QuoteBatch>> {
    const quotes: Quote[] = [];
    for (const symbol of symbols) {
      try {
        quotes.push((await this.getQuote(symbol)).data);
      } catch {
        // Skip pairs the source can't answer; the batch stays best-effort.
      }
    }
    return withProvenance(quotes, this.prov('batchQuotes'));
  }

  override async getHistory(symbol: string, query: HistoryQuery = {}): Promise<Envelope<HistoricalSeries>> {
    const days = RANGE_DAYS[query.range ?? '6mo'] ?? 186;
    const series = await this.series(symbol, days);
    const data: HistoricalSeries = {
      symbol: series.dash,
      interval: '1d',
      ...(query.range ? { range: query.range } : {}),
      currency: series.quote,
      // One fixing per day: flat candles are the honest representation.
      candles: series.points.map((p) => ({
        t: `${p.date}T16:00:00.000Z`,
        o: p.rate,
        h: p.rate,
        l: p.rate,
        c: p.rate,
      })),
    };
    return withProvenance(data, this.prov('historicalPrices', 'historical'));
  }

  // --- internals -----------------------------------------------------------

  private pair(symbol: string): { base: string; quote: string; dash: string } {
    const dash = symbol.trim().toUpperCase().replace('/', '-');
    const match = PAIR.exec(dash);
    if (!match || !this.servesSymbol(dash)) {
      throw new ProviderError('frankfurter', `"${symbol}" is not an ECB currency pair (use e.g. EUR-USD).`);
    }
    return { base: match[1]!, quote: match[2]!, dash };
  }

  private async series(symbol: string, days: number): Promise<{
    dash: string;
    quote: string;
    points: Array<{ date: string; rate: number }>;
  }> {
    const { base, quote, dash } = this.pair(symbol);
    const key = `frankfurter:${base}:${quote}:${days}`;
    let points = await this.cache.get<Array<{ date: string; rate: number }>>(key);
    if (!points) {
      const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const res = await this.getJson<SeriesResponse>(
        `${BASE_URL}/${start}..?base=${base}&symbols=${quote}`,
      );
      points = Object.entries(res.rates ?? {})
        .map(([date, rates]) => ({ date, rate: Number(rates[quote]) }))
        .filter((p) => Number.isFinite(p.rate) && p.rate > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      await this.cache.set(key, points, SERIES_TTL);
    }
    if (points.length === 0) throw new ProviderError('frankfurter', `No ECB rates for ${dash}.`);
    return { dash, quote, points };
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.throttle(() => this.fetchImpl(url, { headers: { Accept: 'application/json' } }));
    } catch {
      throw new ProviderError('frankfurter', 'Frankfurter request failed.');
    }
    if (!res.ok) throw new ProviderError('frankfurter', `Frankfurter responded ${res.status}.`);
    return (await res.json()) as T;
  }

  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastCallAt = Date.now();
      return fn();
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private prov(capability: ProviderCapability, tier: 'eod' | 'historical' = 'eod'): DataProvenance {
    return makeProvenance({
      provider: 'frankfurter',
      providerMode: 'public',
      capability,
      tier,
      attribution: 'FX reference rates via Frankfurter (European Central Bank)',
      sourceUrl: 'https://frankfurter.dev',
    });
  }
}
