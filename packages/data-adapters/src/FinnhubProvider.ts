import {
  NO_CAPABILITIES,
  type DataProvenance,
  type Envelope,
  type ProviderDescriptor,
  type Quote,
  type QuoteBatch,
} from '@tyche/contracts';
import { StubProvider } from './Provider';
import { ProviderError } from './errors';
import { MemoryCache, type CacheStore } from './cache';
import { makeProvenance, withProvenance } from './provenance';

/** Minimal JSON fetch surface so the provider is testable with an injected stub. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const BASE = 'https://finnhub.io/api/v1';
/** Real-time tier: keep the cache tiny so quotes stay live, but still coalesce bursts. */
const QUOTE_TTL = 10 * 1000;

/** Crypto / FX pairs (e.g. BTC-USDT, EUR-USD) route to their venue adapters, not Finnhub. */
const PAIR = /^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}$/;
/** US equity / ETF tickers Finnhub serves on the free tier (AAPL, SPY, BRK.B). No `^` indices. */
const EQUITY = /^[A-Z][A-Z0-9.]{0,9}$/;

/** Finnhub `/quote` payload (all fields optional/nullable; 0/null ⇒ no data). */
interface FinnhubQuote {
  c?: number; // current price
  d?: number | null; // change
  dp?: number | null; // percent change
  h?: number; // day high
  l?: number; // day low
  o?: number; // day open
  pc?: number; // previous close
  t?: number; // unix seconds
}

function num(v: unknown): number | undefined {
  // null/undefined ⇒ no data. Guard BEFORE Number(): Number(null) === 0 is finite, which
  // would mask an explicit null delta and defeat the change/changePercent fallback below.
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
/** A finite, strictly-positive number, or undefined — the schema shape for OHLC prices. */
function posNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface FinnhubProviderOptions {
  /** Finnhub API key (FINNHUB_API_KEY). Required — the provider refuses without it. */
  apiKey: string;
  cache?: CacheStore;
  fetchImpl?: FetchLike;
  /** Minimum spacing between Finnhub requests (free tier is ~60/min ≈ one per second). */
  minIntervalMs?: number;
}

/**
 * Finnhub provider — **real-time** US equity quotes over the public Finnhub HTTP
 * API, using the operator's own free API key. This is the bring-your-own-key
 * upgrade the {@link StooqProvider} docstring points at: keyed and registered
 * ahead of Stooq, so `Q` / watchlists show a live last price instead of Stooq's
 * end-of-day close. Only `quotes` + `batchQuotes` — Finnhub's free tier gates
 * candles behind premium, so history honestly stays with the keyless EOD
 * adapter. {@link servesSymbol} scopes it to equity-shaped tickers, so crypto
 * (`BTC-USDT` → Binance) and FX (`EUR-USD` → Frankfurter) keep routing to their
 * keyless venue adapters rather than being forced through a key.
 *
 * The key is sent only as the `token` request parameter; it is never written
 * into provenance or error messages. `providerMode` is `user_supplied` — this is
 * the user's own licensed feed, never data Tyche bundles or resells.
 * Research-only; not investment advice.
 */
export class FinnhubProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'finnhub',
    mode: 'user_supplied',
    capabilities: { ...NO_CAPABILITIES, quotes: true, batchQuotes: true },
    freshness: [
      { capability: 'quotes', tier: 'live' },
      { capability: 'batchQuotes', tier: 'live' },
    ],
    attribution: 'Real-time quotes via Finnhub (your API key)',
    attributionRequired: true,
    homepage: 'https://finnhub.io',
    description: 'Real-time US equity quotes via your own Finnhub API key (bring-your-own-key).',
    requiresConfiguration: true,
    rateLimit: { requestsPerMinute: 60, notes: 'Finnhub free tier' },
  };

  private readonly apiKey: string;
  private readonly cache: CacheStore;
  private readonly fetchImpl: FetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: FinnhubProviderOptions) {
    super();
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new ProviderError('finnhub', 'Finnhub requires an API key (FINNHUB_API_KEY).');
    }
    this.apiKey = options.apiKey.trim();
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 1100;
  }

  servesSymbol(symbol: string): boolean {
    const s = symbol.trim().toUpperCase();
    if (PAIR.test(s)) return false; // crypto/FX pairs handled by venue adapters
    return EQUITY.test(s);
  }

  override async getQuote(symbol: string): Promise<Envelope<Quote>> {
    const quote = await this.quote(symbol);
    return withProvenance(quote, this.prov('quotes'));
  }

  override async getQuotes(symbols: string[]): Promise<Envelope<QuoteBatch>> {
    const quotes: Quote[] = [];
    for (const symbol of symbols) {
      try {
        quotes.push(await this.quote(symbol));
      } catch {
        // Best-effort batch: Finnhub's free tier has no batch endpoint, so we
        // fetch per symbol and skip any the key can't answer.
      }
    }
    return withProvenance(quotes, this.prov('batchQuotes'));
  }

  // --- internals -----------------------------------------------------------

  private async quote(symbol: string): Promise<Quote> {
    const sym = symbol.trim().toUpperCase();
    const key = `finnhub:q:${sym}`;
    let raw = await this.cache.get<FinnhubQuote>(key);
    if (raw === undefined) {
      raw = await this.getJson<FinnhubQuote>(this.url('/quote', { symbol: sym }));
      await this.cache.set(key, raw, QUOTE_TTL);
    }

    const price = posNum(raw.c);
    // Finnhub answers an unknown/closed-before-first-print symbol with all zeros.
    if (price === undefined) throw new ProviderError('finnhub', `No quote for ${sym}.`);

    const prevClose = posNum(raw.pc);
    const change =
      num(raw.d) ?? (prevClose !== undefined ? Math.round((price - prevClose) * 1e6) / 1e6 : undefined);
    const changePercent =
      num(raw.dp) ??
      (prevClose !== undefined ? Math.round(((price - prevClose) / prevClose) * 1e4) / 100 : undefined);
    // Guard the epoch: only trust a sane, in-range unix-seconds value; anything else
    // (missing, non-positive, or so large it would overflow `Date`) falls back to now,
    // so a garbage upstream timestamp can't throw a RangeError out of toISOString().
    const tsMs =
      raw.t !== undefined && Number.isFinite(raw.t) && raw.t > 0 && raw.t < 8.64e12
        ? raw.t * 1000
        : Date.now();

    return {
      symbol: sym,
      currency: 'USD',
      price,
      ...(posNum(raw.o) !== undefined ? { open: posNum(raw.o)! } : {}),
      ...(posNum(raw.h) !== undefined ? { dayHigh: posNum(raw.h)! } : {}),
      ...(posNum(raw.l) !== undefined ? { dayLow: posNum(raw.l)! } : {}),
      ...(prevClose !== undefined ? { prevClose } : {}),
      ...(change !== undefined ? { change } : {}),
      ...(changePercent !== undefined ? { changePercent } : {}),
      timestamp: new Date(tsMs).toISOString(),
    };
  }

  /** Build a Finnhub API URL. The token is added here and never surfaced in provenance. */
  private url(path: string, params: Record<string, string>): string {
    const search = new URLSearchParams({ ...params, token: this.apiKey });
    return `${BASE}${path}?${search.toString()}`;
  }

  private async getJson<T>(url: string): Promise<T> {
    // Never let the token-bearing URL escape in an error: a non-ok response gets
    // a status-only error; a transport rejection (whose `.cause` may carry the
    // URL) is replaced with a generic ProviderError.
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.throttle(() => this.fetchImpl(url, { headers: { Accept: 'application/json' } }));
    } catch {
      throw new ProviderError('finnhub', 'Finnhub request failed.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('finnhub', 'Finnhub rejected the API key (check FINNHUB_API_KEY).');
    }
    if (res.status === 429) {
      throw new ProviderError('finnhub', 'Finnhub rate limit reached (free tier is ~60/min).');
    }
    if (!res.ok) throw new ProviderError('finnhub', `Finnhub responded ${res.status}.`);
    return (await res.json()) as T;
  }

  /** Serialize Finnhub calls and enforce a minimum spacing between them. */
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

  private prov(capability: 'quotes' | 'batchQuotes'): DataProvenance {
    return makeProvenance({
      provider: 'finnhub',
      providerMode: 'user_supplied',
      capability,
      tier: 'live',
      attribution: 'Real-time quotes via Finnhub',
      sourceUrl: 'https://finnhub.io',
    });
  }
}
