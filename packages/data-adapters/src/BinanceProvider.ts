import {
  NO_CAPABILITIES,
  type DataProvenance,
  type Envelope,
  type FundingRate,
  type HistoricalSeries,
  type Instrument,
  type OrderBook,
  type ProviderCapability,
  type ProviderDescriptor,
  type Quote,
  type QuoteBatch,
  type SearchResult,
  type TradePrint,
} from '@tyche/contracts';
import { StubProvider, type HistoryQuery } from './Provider';
import { ProviderError } from './errors';
import { MemoryCache, type CacheStore } from './cache';
import { makeProvenance, withProvenance } from './provenance';
import type { FetchLike } from './stubs/FredProvider';

const SPOT = 'https://api.binance.com/api/v3';
const PERP = 'https://fapi.binance.com/fapi/v1';

/** Spot quote assets we accept in `BASE-QUOTE` symbols. Deliberately no `USD`:
 * Binance spot quotes in stablecoins; mapping USD→USDT silently would misstate
 * the instrument, so `BTC-USD` stays with the mock and `BTC-USDT` goes live. */
const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'TUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'GBP', 'BRL', 'JPY'];
const PAIR_PATTERN = new RegExp(`^[A-Z0-9]{1,15}-(${QUOTE_ASSETS.join('|')})$`);

const EXCHANGE_INFO_TTL = 60 * 60 * 1000;
const QUOTE_TTL = 5 * 1000;
const KLINES_TTL = 60 * 1000;
const FUNDING_TTL = 30 * 1000;

/** Bars per day for each supported interval (limit computation). */
const BARS_PER_DAY: Record<string, number> = {
  '1m': 1440,
  '5m': 288,
  '15m': 96,
  '30m': 48,
  '1h': 24,
  '4h': 6,
  '1d': 1,
  '1w': 1 / 7,
  '1M': 1 / 30,
};
const RANGE_DAYS: Record<string, number> = {
  '1d': 1,
  '5d': 5,
  '1mo': 31,
  '3mo': 93,
  '6mo': 186,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
  max: 3650,
};
/** Binance /depth accepts only these limits; snap up, then slice down. */
const DEPTH_LIMITS = [5, 10, 20, 50, 100, 500, 1000];

interface BinanceSymbol {
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  status?: string;
}
interface Ticker24h {
  symbol?: string;
  lastPrice?: string;
  bidPrice?: string;
  askPrice?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  prevClosePrice?: string;
  priceChange?: string;
  priceChangePercent?: string;
  volume?: string;
  closeTime?: number;
}
interface PremiumIndex {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  lastFundingRate?: string;
  nextFundingTime?: number;
  time?: number;
}

export interface BinanceProviderOptions {
  cache?: CacheStore;
  fetchImpl?: FetchLike;
  /** Minimum spacing between requests (politeness throttle). */
  minIntervalMs?: number;
}

/**
 * Binance public market-data adapter — real crypto `quotes`, candles, trades,
 * order books, and perp `fundingRates` over the keyless public REST API. Pairs
 * use Tyche's dash notation (`BTC-USDT` ⇄ Binance `BTCUSDT`); {@link servesSymbol}
 * confines this provider to those pairs so the registry keeps routing equities
 * (and `-USD` mock pairs) elsewhere. No API key is used or accepted — this
 * adapter reads only public endpoints, and enabling it (TYCHE_PROVIDERS=binance)
 * is the operator's acceptance of Binance's data terms.
 */
export class BinanceProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'binance',
    mode: 'public',
    capabilities: {
      ...NO_CAPABILITIES,
      quotes: true,
      batchQuotes: true,
      historicalPrices: true,
      intradayPrices: true,
      trades: true,
      orderBook: true,
      crypto: true,
      fundingRates: true,
    },
    freshness: [
      { capability: 'quotes', tier: 'live', delaySeconds: 0 },
      { capability: 'orderBook', tier: 'live', delaySeconds: 0 },
      { capability: 'trades', tier: 'live', delaySeconds: 0 },
      { capability: 'fundingRates', tier: 'live', delaySeconds: 0 },
      { capability: 'historicalPrices', tier: 'historical' },
    ],
    attribution: 'Market data from Binance public endpoints',
    attributionRequired: true,
    homepage: 'https://www.binance.com',
    description:
      'Live crypto pairs (BTC-USDT, …): quotes, candles, trades, order book, perp funding. ' +
      'Public keyless endpoints; review Binance data terms before enabling.',
    requiresConfiguration: false,
  };

  private readonly cache: CacheStore;
  private readonly fetchImpl: FetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: BinanceProviderOptions = {}) {
    super();
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 100;
  }

  servesSymbol(symbol: string): boolean {
    return PAIR_PATTERN.test(symbol.trim().toUpperCase());
  }

  override async searchInstruments(query: string, limit = 12): Promise<Envelope<SearchResult[]>> {
    const q = query.trim().toUpperCase().replace('/', '-');
    if (!q) return withProvenance([], this.prov('quotes', 'live'));
    const symbols = await this.exchangeInfo();
    const hits: SearchResult[] = [];
    for (const s of symbols) {
      if (!s.symbol || !s.baseAsset || !s.quoteAsset || s.status !== 'TRADING') continue;
      const dash = `${s.baseAsset}-${s.quoteAsset}`;
      const matches =
        s.baseAsset.startsWith(q.split('-')[0] ?? q) || dash.startsWith(q) || s.symbol.startsWith(q.replace('-', ''));
      if (!matches) continue;
      hits.push({
        identifier: {
          symbol: dash,
          assetClass: 'crypto',
          exchange: 'BINANCE',
          currency: s.quoteAsset,
        },
        name: `${s.baseAsset} / ${s.quoteAsset}`,
        matchedOn: 'symbol',
      });
      if (hits.length >= limit) break;
    }
    return withProvenance(hits, this.prov('quotes', 'live'));
  }

  override async getInstrument(symbol: string): Promise<Envelope<Instrument>> {
    const pair = this.pair(symbol);
    const symbols = await this.exchangeInfo();
    const found = symbols.find((s) => s.symbol === pair.compact);
    if (!found || !found.baseAsset || !found.quoteAsset) {
      throw new ProviderError('binance', `Unknown Binance pair "${symbol}".`);
    }
    const data: Instrument = {
      symbol: pair.dash,
      assetClass: 'crypto',
      exchange: 'BINANCE',
      currency: found.quoteAsset,
      name: `${found.baseAsset} / ${found.quoteAsset}`,
      description: `${found.baseAsset} priced in ${found.quoteAsset} on Binance spot. 24/7 market.`,
      active: found.status === 'TRADING',
    };
    return withProvenance(data, this.prov('quotes', 'live'));
  }

  override async getQuote(symbol: string): Promise<Envelope<Quote>> {
    const pair = this.pair(symbol);
    const key = `binance:quote:${pair.compact}`;
    let raw = await this.cache.get<Ticker24h>(key);
    const cacheHit = raw !== undefined;
    if (!raw) {
      raw = await this.getJson<Ticker24h>(`${SPOT}/ticker/24hr?symbol=${pair.compact}`);
      await this.cache.set(key, raw, QUOTE_TTL);
    }
    return withProvenance(this.toQuote(pair.dash, raw), this.prov('quotes', 'live', cacheHit));
  }

  override async getQuotes(symbols: string[]): Promise<Envelope<QuoteBatch>> {
    const pairs = symbols.map((s) => this.pair(s));
    const encoded = encodeURIComponent(JSON.stringify(pairs.map((p) => p.compact)));
    const raw = await this.getJson<Ticker24h[]>(`${SPOT}/ticker/24hr?symbols=${encoded}`);
    const bySymbol = new Map(raw.map((t) => [t.symbol, t]));
    const quotes: Quote[] = [];
    for (const pair of pairs) {
      const t = bySymbol.get(pair.compact);
      if (t) quotes.push(this.toQuote(pair.dash, t));
    }
    return withProvenance(quotes, this.prov('batchQuotes', 'live'));
  }

  override async getHistory(symbol: string, query: HistoryQuery = {}): Promise<Envelope<HistoricalSeries>> {
    const pair = this.pair(symbol);
    const interval = query.interval ?? '1d';
    const days = RANGE_DAYS[query.range ?? '6mo'] ?? 186;
    const perDay = BARS_PER_DAY[interval] ?? 1;
    const limit = Math.min(1000, Math.max(2, Math.ceil(days * perDay)));
    const key = `binance:klines:${pair.compact}:${interval}:${limit}`;
    let raw = await this.cache.get<unknown[][]>(key);
    const cacheHit = raw !== undefined;
    if (!raw) {
      raw = await this.getJson<unknown[][]>(`${SPOT}/klines?symbol=${pair.compact}&interval=${interval}&limit=${limit}`);
      await this.cache.set(key, raw, KLINES_TTL);
    }
    const candles = raw
      .map((k) => ({
        t: new Date(Number(k[0])).toISOString(),
        o: Number(k[1]),
        h: Number(k[2]),
        l: Number(k[3]),
        c: Number(k[4]),
        v: Number(k[5]),
      }))
      .filter((c) => [c.o, c.h, c.l, c.c].every((n) => Number.isFinite(n) && n > 0));
    const data: HistoricalSeries = {
      symbol: pair.dash,
      interval,
      ...(query.range ? { range: query.range } : {}),
      currency: pair.quote,
      candles,
    };
    const capability: ProviderCapability = (BARS_PER_DAY[interval] ?? 1) > 1 ? 'intradayPrices' : 'historicalPrices';
    return withProvenance(data, this.prov(capability, 'historical', cacheHit));
  }

  override async getTrades(symbol: string, limit = 60): Promise<Envelope<TradePrint[]>> {
    const pair = this.pair(symbol);
    const raw = await this.getJson<Array<{ p?: string; q?: string; T?: number; m?: boolean }>>(
      `${SPOT}/aggTrades?symbol=${pair.compact}&limit=${Math.min(200, Math.max(1, limit))}`,
    );
    const prints: TradePrint[] = raw
      .map((t) => ({
        symbol: pair.dash,
        timestamp: new Date(Number(t.T ?? Date.now())).toISOString(),
        price: Number(t.p),
        size: Number(t.q),
        // `m` = buyer is maker ⇒ the aggressor sold.
        side: (t.m ? 'sell' : 'buy') as TradePrint['side'],
        venue: 'BINANCE',
      }))
      .filter((t) => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.size))
      .reverse(); // newest first, like the mock
    return withProvenance(prints, this.prov('trades', 'live'));
  }

  override async getOrderBook(symbol: string, depth = 20): Promise<Envelope<OrderBook>> {
    const pair = this.pair(symbol);
    const snapped = DEPTH_LIMITS.find((l) => l >= depth) ?? 1000;
    const raw = await this.getJson<{ bids?: [string, string][]; asks?: [string, string][] }>(
      `${SPOT}/depth?symbol=${pair.compact}&limit=${snapped}`,
    );
    const level = ([price, size]: [string, string]) => ({ price: Number(price), size: Number(size) });
    const data: OrderBook = {
      symbol: pair.dash,
      timestamp: new Date().toISOString(),
      bids: (raw.bids ?? []).map(level).filter((l) => l.price > 0).slice(0, depth),
      asks: (raw.asks ?? []).map(level).filter((l) => l.price > 0).slice(0, depth),
    };
    return withProvenance(data, this.prov('orderBook', 'live'));
  }

  override async getFundingRates(symbols?: string[]): Promise<Envelope<FundingRate[]>> {
    const key = 'binance:funding';
    let raw = await this.cache.get<PremiumIndex[]>(key);
    const cacheHit = raw !== undefined;
    if (!raw) {
      const res = await this.getJson<PremiumIndex | PremiumIndex[]>(`${PERP}/premiumIndex`);
      raw = Array.isArray(res) ? res : [res];
      await this.cache.set(key, raw, FUNDING_TTL);
    }
    const wanted =
      symbols && symbols.length > 0 ? new Set(symbols.map((s) => this.pair(s).compact)) : null;
    const rates: FundingRate[] = [];
    for (const row of raw) {
      if (!row.symbol) continue;
      if (wanted && !wanted.has(row.symbol)) continue;
      const rate = Number(row.lastFundingRate);
      const mark = Number(row.markPrice);
      const index = Number(row.indexPrice);
      if (!Number.isFinite(rate)) continue;
      rates.push({
        symbol: this.dashify(row.symbol),
        venue: 'BINANCE',
        rate,
        // premiumIndex does not expose the interval; 8h is the venue default.
        intervalHours: 8,
        annualizedPct: Math.round(rate * 3 * 365 * 100 * 100) / 100,
        ...(Number.isFinite(mark) && mark > 0 ? { markPrice: mark } : {}),
        ...(Number.isFinite(index) && index > 0 ? { indexPrice: index } : {}),
        ...(row.nextFundingTime ? { nextFundingAt: new Date(row.nextFundingTime).toISOString() } : {}),
        asOf: new Date(row.time ?? Date.now()).toISOString(),
      });
    }
    rates.sort((a, b) => Math.abs(b.annualizedPct) - Math.abs(a.annualizedPct));
    return withProvenance(wanted ? rates : rates.slice(0, 50), this.prov('fundingRates', 'live', cacheHit));
  }

  // --- internals -----------------------------------------------------------

  /** `BTC-USDT` → { dash: 'BTC-USDT', compact: 'BTCUSDT', quote: 'USDT' }. */
  private pair(symbol: string): { dash: string; compact: string; quote: string } {
    const dash = symbol.trim().toUpperCase().replace('/', '-');
    if (!PAIR_PATTERN.test(dash)) {
      throw new ProviderError('binance', `"${symbol}" is not a crypto pair this adapter serves (use e.g. BTC-USDT).`);
    }
    const [base, quote] = dash.split('-') as [string, string];
    return { dash, compact: `${base}${quote}`, quote };
  }

  /** `BTCUSDT` → `BTC-USDT` (longest known quote-asset suffix wins). */
  private dashify(compact: string): string {
    const quote = [...QUOTE_ASSETS].sort((a, b) => b.length - a.length).find((qa) => compact.endsWith(qa));
    return quote ? `${compact.slice(0, compact.length - quote.length)}-${quote}` : compact;
  }

  private async exchangeInfo(): Promise<BinanceSymbol[]> {
    const key = 'binance:exchangeInfo';
    let symbols = await this.cache.get<BinanceSymbol[]>(key);
    if (!symbols) {
      const raw = await this.getJson<{ symbols?: BinanceSymbol[] }>(`${SPOT}/exchangeInfo`);
      symbols = (raw.symbols ?? []).map(({ symbol, baseAsset, quoteAsset, status }) => ({
        symbol,
        baseAsset,
        quoteAsset,
        status,
      }));
      await this.cache.set(key, symbols, EXCHANGE_INFO_TTL);
    }
    return symbols;
  }

  private toQuote(dashSymbol: string, t: Ticker24h): Quote {
    const num = (v: string | undefined): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const price = num(t.lastPrice);
    if (!price) throw new ProviderError('binance', `No price for ${dashSymbol}.`);
    const change = Number(t.priceChange);
    const changePct = Number(t.priceChangePercent);
    return {
      symbol: dashSymbol,
      currency: dashSymbol.split('-')[1] ?? 'USDT',
      price,
      ...(num(t.bidPrice) ? { bid: num(t.bidPrice) } : {}),
      ...(num(t.askPrice) ? { ask: num(t.askPrice) } : {}),
      ...(num(t.openPrice) ? { open: num(t.openPrice) } : {}),
      ...(num(t.highPrice) ? { dayHigh: num(t.highPrice) } : {}),
      ...(num(t.lowPrice) ? { dayLow: num(t.lowPrice) } : {}),
      ...(num(t.prevClosePrice) ? { prevClose: num(t.prevClosePrice) } : {}),
      ...(Number.isFinite(change) ? { change } : {}),
      ...(Number.isFinite(changePct) ? { changePercent: changePct } : {}),
      ...(Number(t.volume) >= 0 ? { volume: Number(t.volume) } : {}),
      marketState: 'regular', // crypto trades 24/7
      timestamp: new Date(t.closeTime ?? Date.now()).toISOString(),
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.throttle(() => this.fetchImpl(url, { headers: { Accept: 'application/json' } }));
    } catch {
      throw new ProviderError('binance', 'Binance request failed.');
    }
    if (!res.ok) throw new ProviderError('binance', `Binance responded ${res.status}.`);
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

  private prov(capability: ProviderCapability, tier: 'live' | 'historical', cacheHit = false): DataProvenance {
    return makeProvenance({
      provider: 'binance',
      providerMode: 'public',
      capability,
      tier,
      attribution: 'Market data from Binance public endpoints',
      cacheHit,
      sourceUrl: 'https://www.binance.com',
    });
  }
}
