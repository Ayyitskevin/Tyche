import {
  NO_CAPABILITIES,
  type Candle,
  type DataProvenance,
  type Envelope,
  type HistoricalSeries,
  type ProviderCapability,
  type ProviderDescriptor,
  type Quote,
  type QuoteBatch,
} from '@tyche/contracts';
import { StubProvider, type HistoryQuery } from './Provider';
import { ProviderError } from './errors';
import { MemoryCache, type CacheStore } from './cache';
import { makeProvenance, withProvenance } from './provenance';

/** Text (CSV) fetch surface — Stooq serves CSV, not JSON. */
export type TextFetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const BASE = 'https://stooq.com';
const DAILY_TTL = 30 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Crypto / FX pairs (e.g. BTC-USDT, EUR-USD) route to their venue adapters, not Stooq. */
const PAIR = /^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}$/;
/** Equity / ETF / index tickers Stooq covers (AAPL, SPY, ^SPX, BRK.B). */
const EQUITY = /^\^?[A-Z][A-Z0-9.]{0,9}$/;

const RANGE_DAYS: Record<string, number> = {
  '1d': 7,
  '5d': 10,
  '1mo': 31,
  '3mo': 93,
  '6mo': 186,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
  max: 36_500,
};

/** Map a Tyche ticker to a Stooq symbol (US equities get the `.us` market suffix). */
function toStooqSymbol(symbol: string): string {
  const s = symbol.trim().toLowerCase();
  if (s.startsWith('^') || s.includes('.')) return s; // index, or already market-qualified
  return `${s}.us`;
}

/** Parse Stooq's ascending daily CSV (`Date,Open,High,Low,Close,Volume`) into candles. */
function parseDailyCsv(csv: string): Candle[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0]!.toLowerCase().startsWith('date,')) return []; // error/empty guard
  const out: Candle[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i]!.split(',');
    if (cols.length < 5) continue;
    const [date, o, h, l, c, v] = cols;
    const open = Number(o);
    const high = Number(h);
    const low = Number(l);
    const close = Number(c);
    if (![open, high, low, close].every((n) => Number.isFinite(n) && n > 0)) continue; // skip N/D rows
    const vol = Number(v);
    out.push({
      t: `${date}T00:00:00.000Z`,
      o: open,
      h: high,
      l: low,
      c: close,
      ...(Number.isFinite(vol) && vol >= 0 ? { v: vol } : {}),
    });
  }
  return out;
}

export interface StooqProviderOptions {
  cache?: CacheStore;
  fetchImpl?: TextFetchLike;
  minIntervalMs?: number;
}

/**
 * Stooq market-data adapter — real, keyless **end-of-day** OHLCV for equities, ETFs
 * and indices, so `GP` / `HP` / `QM` show real prices instead of the mock walk. One
 * fixing per trading day, so everything is EOD-tier; quotes are derived from the two
 * most recent daily closes. {@link servesSymbol} scopes the adapter to equity-shaped
 * tickers, so crypto (`BTC-USDT` → Binance) and FX (`EUR-USD` → Frankfurter) keep
 * routing to their venue adapters. Real-time equity quotes are a bring-your-own-key
 * upgrade (a keyed provider), not this adapter. Research-only; not investment advice.
 */
export class StooqProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'stooq',
    mode: 'public',
    capabilities: { ...NO_CAPABILITIES, quotes: true, batchQuotes: true, historicalPrices: true },
    freshness: [
      { capability: 'quotes', tier: 'eod' },
      { capability: 'historicalPrices', tier: 'historical' },
    ],
    attribution: 'End-of-day market data via Stooq',
    attributionRequired: true,
    homepage: 'https://stooq.com',
    description: 'Keyless end-of-day OHLCV for equities, ETFs and indices (one fixing per trading day).',
    requiresConfiguration: false,
  };

  private readonly cache: CacheStore;
  private readonly fetchImpl: TextFetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: StooqProviderOptions = {}) {
    super();
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as TextFetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 200;
  }

  servesSymbol(symbol: string): boolean {
    const s = symbol.trim().toUpperCase();
    if (PAIR.test(s)) return false; // crypto/FX pairs handled by venue adapters
    return EQUITY.test(s);
  }

  override async getHistory(symbol: string, query: HistoryQuery = {}): Promise<Envelope<HistoricalSeries>> {
    const candles = await this.candles(symbol);
    const days = RANGE_DAYS[query.range ?? '6mo'] ?? 186;
    const cutoff = Date.now() - days * DAY_MS;
    const windowed = candles.filter((c) => Date.parse(c.t) >= cutoff);
    const data: HistoricalSeries = {
      symbol: symbol.trim().toUpperCase(),
      interval: '1d',
      ...(query.range ? { range: query.range } : {}),
      currency: 'USD',
      candles: windowed.length > 0 ? windowed : candles.slice(-2),
    };
    return withProvenance(data, this.prov('historicalPrices', 'historical'));
  }

  override async getQuote(symbol: string): Promise<Envelope<Quote>> {
    const candles = await this.candles(symbol);
    const last = candles[candles.length - 1];
    if (!last) throw new ProviderError('stooq', `No data for ${symbol}.`);
    const prev = candles[candles.length - 2] ?? last;
    const change = last.c - prev.c;
    const quote: Quote = {
      symbol: symbol.trim().toUpperCase(),
      currency: 'USD',
      price: last.c,
      open: last.o,
      dayHigh: last.h,
      dayLow: last.l,
      prevClose: prev.c,
      change: Math.round(change * 1e6) / 1e6,
      changePercent: prev.c ? Math.round((change / prev.c) * 1e4) / 100 : 0,
      ...(last.v !== undefined ? { volume: last.v } : {}),
      timestamp: last.t,
    };
    return withProvenance(quote, this.prov('quotes'));
  }

  override async getQuotes(symbols: string[]): Promise<Envelope<QuoteBatch>> {
    const quotes: Quote[] = [];
    for (const symbol of symbols) {
      try {
        quotes.push((await this.getQuote(symbol)).data);
      } catch {
        // Best-effort batch: skip symbols Stooq can't answer.
      }
    }
    return withProvenance(quotes, this.prov('batchQuotes'));
  }

  // --- internals -----------------------------------------------------------

  private async candles(symbol: string): Promise<Candle[]> {
    const s = toStooqSymbol(symbol);
    const key = `stooq:d:${s}`;
    let candles = await this.cache.get<Candle[]>(key);
    if (candles === undefined) {
      const csv = await this.getText(`${BASE}/q/d/l/?s=${encodeURIComponent(s)}&i=d`);
      candles = parseDailyCsv(csv);
      if (candles.length === 0) throw new ProviderError('stooq', `No EOD data for ${symbol}.`);
      await this.cache.set(key, candles, DAILY_TTL);
    }
    return candles;
  }

  private async getText(url: string): Promise<string> {
    let res: Awaited<ReturnType<TextFetchLike>>;
    try {
      res = await this.throttle(() => this.fetchImpl(url, { headers: { Accept: 'text/csv' } }));
    } catch {
      throw new ProviderError('stooq', 'Stooq request failed.');
    }
    if (!res.ok) throw new ProviderError('stooq', `Stooq responded ${res.status}.`);
    return res.text();
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
      provider: 'stooq',
      providerMode: 'public',
      capability,
      tier,
      attribution: 'End-of-day market data via Stooq',
      sourceUrl: 'https://stooq.com',
    });
  }
}
