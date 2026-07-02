import {
  NO_CAPABILITIES,
  type AnalystRating,
  type BarInterval,
  type Candle,
  type CorporateEvent,
  type DataProvenance,
  type DexPool,
  type EconomicObservation,
  type EconomicSeries,
  type EconomicSeriesQuery,
  type Envelope,
  type EstimateMetric,
  type EstimatePeriod,
  type EventsQuery,
  type Filing,
  type FinancialStatement,
  type FundingRate,
  type IndexMembership,
  type FreshnessTier,
  type HistoricalSeries,
  type HistoryRange,
  type InstitutionalHolder,
  type Instrument,
  type MarketState,
  type NewsItem,
  type NewsSentiment,
  type OptionChain,
  type OptionContract,
  type OrderBook,
  type ProviderCapabilities,
  type ProviderDescriptor,
  type Quote,
  type QuoteBatch,
  type ScreenQuery,
  type ScreenRow,
  type SearchResult,
  type StatementLineItem,
  type StatementType,
  type TradePrint,
} from '@tyche/contracts';
import { applyScreen } from '@tyche/analytics';
import type {
  DataProvider,
  FinancialsQuery,
  HistoryQuery,
  NewsQuery,
  OptionQuery,
} from './Provider';
import { makeProvenance, withProvenance, type ProvenanceInit } from './provenance';
import {
  gaussian,
  intInRange,
  pick,
  rangeValue,
  round,
  seededRng,
} from './random';
import { SEED_BY_SYMBOL, SEED_INSTRUMENTS, SEED_SYMBOLS, type SeedInstrument } from './seed';

const MASTER_DAYS = 1300;

const RANGE_TO_DAYS: Record<HistoryRange, number> = {
  '1d': 2,
  '5d': 5,
  '1mo': 22,
  '3mo': 66,
  '6mo': 126,
  '1y': 252,
  '2y': 504,
  '5y': 1260,
  max: MASTER_DAYS,
};

const INTERVAL_MINUTES: Partial<Record<BarInterval, number>> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
};

const MOCK_CAPABILITIES: ProviderCapabilities = {
  ...NO_CAPABILITIES,
  quotes: true,
  batchQuotes: true,
  historicalPrices: true,
  intradayPrices: true,
  trades: true,
  orderBook: true,
  news: true,
  filings: true,
  fundamentals: true,
  estimates: true,
  analystRatings: true,
  ownership: true,
  options: true,
  crypto: true,
  fx: true,
  futures: true,
  screener: true,
  economicSeries: true,
  events: true,
  fundingRates: true,
  membership: true,
  dexPools: true,
};

const NEWS_VERBS = [
  'updates guidance on',
  'expands',
  'reports progress in',
  'announces a review of',
  'highlights momentum in',
  'reiterates plans for',
];
const NEWS_TOPICS = [
  'its product roadmap',
  'regional operations',
  'capital allocation',
  'its supply chain',
  'research investments',
  'platform partnerships',
];
const NEWS_SOURCES = ['Tyche Wire', 'Market Mock Daily', 'Demo Newsroom', 'Synthetic Press'];
const SENTIMENTS: NewsSentiment[] = ['positive', 'neutral', 'negative'];

function isCryptoSymbol(symbol: string): boolean {
  return /-(USD|USDT|USDC|BTC|ETH|EUR|GBP)$/.test(symbol.toUpperCase());
}

/** Shape of a synthetic macro series in the mock catalog. */
interface EconSeed {
  title: string;
  units: string;
  unitsShort?: string;
  frequency: string;
  seasonalAdjustment?: string;
  /** Anchor for the most-recent value. */
  base: number;
  /** Multiplicative per-month drift for `level` series. */
  monthlyDrift: number;
  /** Step volatility (relative for `level`, absolute for `rate`). */
  vol: number;
  kind: 'level' | 'rate';
  floor?: number;
  ceil?: number;
  /** Months between observations (1 = monthly, 3 = quarterly). */
  stepMonths: number;
  /** Number of observations to synthesize. */
  points: number;
}

/**
 * A small catalog of well-known FRED-style series so the mock returns
 * recognizable names/units. Unknown ids get a generic synthetic series.
 */
const ECON_CATALOG: Record<string, EconSeed> = {
  GDP: {
    title: 'Gross Domestic Product',
    units: 'Billions of Dollars',
    unitsShort: 'Bil. $',
    frequency: 'Quarterly',
    seasonalAdjustment: 'Seasonally Adjusted Annual Rate',
    base: 27_000,
    monthlyDrift: 0.004,
    vol: 0.004,
    kind: 'level',
    stepMonths: 3,
    points: 100,
  },
  CPIAUCSL: {
    title: 'Consumer Price Index for All Urban Consumers: All Items',
    units: 'Index 1982-1984=100',
    unitsShort: 'Index',
    frequency: 'Monthly',
    seasonalAdjustment: 'Seasonally Adjusted',
    base: 312,
    monthlyDrift: 0.0025,
    vol: 0.0015,
    kind: 'level',
    stepMonths: 1,
    points: 300,
  },
  UNRATE: {
    title: 'Unemployment Rate',
    units: 'Percent',
    unitsShort: '%',
    frequency: 'Monthly',
    seasonalAdjustment: 'Seasonally Adjusted',
    base: 4,
    monthlyDrift: 0,
    vol: 0.18,
    kind: 'rate',
    floor: 2.5,
    ceil: 14,
    stepMonths: 1,
    points: 300,
  },
  FEDFUNDS: {
    title: 'Federal Funds Effective Rate',
    units: 'Percent',
    unitsShort: '%',
    frequency: 'Monthly',
    base: 3.25,
    monthlyDrift: 0,
    vol: 0.22,
    kind: 'rate',
    floor: 0,
    ceil: 9,
    stepMonths: 1,
    points: 300,
  },
  DGS10: {
    title: '10-Year Treasury Constant Maturity Rate',
    units: 'Percent',
    unitsShort: '%',
    frequency: 'Monthly',
    base: 4.1,
    monthlyDrift: 0,
    vol: 0.16,
    kind: 'rate',
    floor: 0.5,
    ceil: 8,
    stepMonths: 1,
    points: 300,
  },
};

function syntheticEconSeed(id: string): EconSeed {
  const rng = seededRng(id, 'econ-seed');
  return {
    title: `${id} (synthetic demo series)`,
    units: 'Index',
    unitsShort: 'Index',
    frequency: 'Monthly',
    base: round(rangeValue(rng, 50, 500), 2),
    monthlyDrift: rangeValue(rng, -0.001, 0.004),
    vol: rangeValue(rng, 0.002, 0.02),
    kind: 'level',
    stepMonths: 1,
    points: 240,
  };
}

/** Deterministic oldest→newest observations anchored so the newest ≈ `base`. */
function buildEconObservations(seed: EconSeed, id: string, end: Date): EconomicObservation[] {
  const rng = seededRng(id, 'econ-obs');
  const dates: string[] = [];
  const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  for (let i = 0; i < seed.points; i++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() - seed.stepMonths);
  }
  dates.reverse();

  const out: EconomicObservation[] = [];
  if (seed.kind === 'level') {
    const g = 1 + seed.monthlyDrift * seed.stepMonths;
    let v = seed.base / Math.pow(g, seed.points - 1);
    for (let i = 0; i < seed.points; i++) {
      out.push({ date: dates[i]!, value: round(Math.max(0.01, v), 2) });
      v = v * g * (1 + seed.vol * gaussian(rng));
    }
  } else {
    let v = seed.base;
    for (let i = 0; i < seed.points; i++) {
      out.push({ date: dates[i]!, value: round(v, 2) });
      const reverted = v + 0.05 * (seed.base - v) + seed.vol * gaussian(rng);
      v = Math.min(seed.ceil ?? Infinity, Math.max(seed.floor ?? -Infinity, reverted));
    }
  }
  return out;
}

function businessDayTimestamps(end: Date, count: number): string[] {
  const out: string[] = [];
  const cursor = new Date(end.getTime());
  while (out.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      out.push(
        new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 20, 0, 0),
        ).toISOString(),
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out.reverse();
}

function downsample(candles: Candle[], factor: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    if (group.length === 0) continue;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const g of group) {
      high = Math.max(high, g.h);
      low = Math.min(low, g.l);
      volume += g.v ?? 0;
    }
    const last = group[group.length - 1]!;
    out.push({ t: last.t, o: group[0]!.o, h: high, l: low, c: last.c, v: volume });
  }
  return out;
}

export interface MockProviderOptions {
  /** Reference "now" for the demo universe; defaults to the current date. */
  referenceDate?: Date;
}

/**
 * Deterministic mock/demo provider. Generates schema-valid, seeded data for the
 * full capability surface so the terminal is fully usable with NO external
 * credentials. All data is SYNTHETIC and clearly marked as such in provenance.
 */
export class MockProvider implements DataProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'mock',
    mode: 'mock',
    capabilities: MOCK_CAPABILITIES,
    freshness: [
      { capability: 'quotes', tier: 'delayed', delaySeconds: 900 },
      { capability: 'historicalPrices', tier: 'historical' },
      { capability: 'intradayPrices', tier: 'delayed', delaySeconds: 900 },
      { capability: 'crypto', tier: 'live', delaySeconds: 0 },
    ],
    attribution: 'Synthetic data generated by the Tyche mock provider.',
    attributionRequired: false,
    description:
      'Deterministic demo provider. All values are synthetic and for demonstration only.',
    requiresConfiguration: false,
  };

  private readonly masterCache = new Map<string, Candle[]>();
  private readonly referenceDate: Date | undefined;

  constructor(options: MockProviderOptions = {}) {
    this.referenceDate = options.referenceDate;
  }

  // --- internals -----------------------------------------------------------

  private asOf(): Date {
    return this.referenceDate ? new Date(this.referenceDate.getTime()) : new Date();
  }

  private seedFor(symbol: string): SeedInstrument {
    const upper = symbol.toUpperCase();
    return SEED_BY_SYMBOL.get(upper) ?? this.synthesize(upper);
  }

  private synthesize(symbol: string): SeedInstrument {
    const rng = seededRng(symbol, 'synthetic');
    const assetClass = isCryptoSymbol(symbol) ? 'crypto' : 'equity';
    const basePrice = round(rangeValue(rng, 20, 400), 2);
    return {
      symbol,
      name: `${symbol} (synthetic demo)`,
      assetClass,
      exchange: 'DEMO',
      mic: 'XXXX',
      currency: 'USD',
      country: 'US',
      sector: 'Demo',
      industry: 'Demo',
      basePrice,
      baseVolume: intInRange(rng, 100_000, 5_000_000),
      annualDrift: rangeValue(rng, -0.05, 0.2),
      annualVol: rangeValue(rng, 0.15, 0.6),
      marketCap: basePrice * intInRange(rng, 100_000_000, 5_000_000_000),
      sharesOutstanding: intInRange(rng, 100_000_000, 5_000_000_000),
      description: `Synthetic demo instrument generated for "${symbol}". Not a real security.`,
      optionable: assetClass === 'equity',
      filer: assetClass === 'equity',
    };
  }

  private master(seed: SeedInstrument, end: Date): Candle[] {
    const key = `${seed.symbol}:${end.toISOString().slice(0, 10)}`;
    const cached = this.masterCache.get(key);
    if (cached) return cached;

    const rng = seededRng(seed.symbol, 'daily-v1');
    const dailyVol = seed.annualVol / Math.sqrt(252);
    const dailyDrift = seed.annualDrift / 252;

    const rets: number[] = [];
    for (let i = 0; i < MASTER_DAYS; i++) rets.push(dailyDrift + dailyVol * gaussian(rng));

    const rel: number[] = [1];
    for (let i = 1; i < MASTER_DAYS; i++) rel.push(rel[i - 1]! * (1 + rets[i]!));
    const scale = seed.basePrice / rel[MASTER_DAYS - 1]!;
    const closeSeries = rel.map((r) => r * scale);

    const dates = businessDayTimestamps(end, MASTER_DAYS);
    const candles: Candle[] = closeSeries.map((close, i) => {
      const prevClose = i > 0 ? closeSeries[i - 1]! : close / (1 + rets[0]!);
      const open = round(prevClose, 2);
      const c = round(close, 2);
      const hi = round(Math.max(open, c) * (1 + Math.abs(gaussian(rng)) * dailyVol * 0.5), 2);
      const lo = round(Math.min(open, c) * (1 - Math.abs(gaussian(rng)) * dailyVol * 0.5), 2);
      const v = Math.round(seed.baseVolume * (0.6 + rng() * 0.8));
      return { t: dates[i]!, o: open, h: Math.max(hi, open, c), l: Math.min(lo, open, c), c, v };
    });
    this.masterCache.set(key, candles);
    return candles;
  }

  private intraday(
    seed: SeedInstrument,
    interval: BarInterval,
    range: HistoryRange,
    end: Date,
  ): Candle[] {
    const stepMin = INTERVAL_MINUTES[interval] ?? 5;
    const bars = Math.min(1500, Math.max(30, Math.round((RANGE_TO_DAYS[range] * 390) / stepMin)));
    const rng = seededRng(seed.symbol, 'intraday', interval);
    const stepMs = stepMin * 60_000;
    const minuteVol = seed.annualVol / Math.sqrt(252 * 390);
    let price = seed.basePrice;
    const candles: Candle[] = [];
    for (let i = 0; i < bars; i++) {
      const t = new Date(end.getTime() - i * stepMs).toISOString();
      const c = price;
      const ret = minuteVol * Math.sqrt(stepMin) * gaussian(rng);
      const open = round(c * (1 - ret), 2);
      const hi = round(Math.max(open, c) * (1 + Math.abs(gaussian(rng)) * minuteVol * 5), 2);
      const lo = round(Math.min(open, c) * (1 - Math.abs(gaussian(rng)) * minuteVol * 5), 2);
      candles.push({
        t,
        o: open,
        h: Math.max(hi, open, c),
        l: Math.min(lo, open, c),
        c: round(c, 2),
        v: Math.round((seed.baseVolume / 390) * (0.5 + rng())),
      });
      price = open;
    }
    return candles.reverse();
  }

  private prov(
    capability: string,
    tier: FreshnessTier,
    extra: Partial<ProvenanceInit> = {},
  ): DataProvenance {
    return makeProvenance({
      provider: this.descriptor.name,
      providerMode: 'mock',
      capability,
      tier,
      attribution: 'Synthetic data — Tyche mock provider',
      notes: 'All values are synthetic and for demonstration only.',
      ...extra,
    });
  }

  private toInstrument(seed: SeedInstrument): Instrument {
    return {
      symbol: seed.symbol,
      assetClass: seed.assetClass,
      exchange: seed.exchange,
      mic: seed.mic,
      currency: seed.currency,
      name: seed.name,
      description: seed.description,
      sector: seed.sector,
      industry: seed.industry,
      country: seed.country,
      employees: seed.employees,
      marketCap: seed.marketCap,
      sharesOutstanding: seed.sharesOutstanding,
      active: true,
    };
  }

  /**
   * Market session by the (UTC) clock — weekends closed, 13:30–20:00 regular
   * (≈ 09:30–16:00 ET), with pre/post windows around it. Crypto trades 24/7.
   */
  private marketStateFor(seed: SeedInstrument): MarketState {
    if (seed.assetClass === 'crypto') return 'regular';
    const at = this.asOf();
    const day = at.getUTCDay();
    if (day === 0 || day === 6) return 'closed';
    const mins = at.getUTCHours() * 60 + at.getUTCMinutes();
    if (mins >= 810 && mins < 1200) return 'regular';
    if (mins >= 480 && mins < 810) return 'pre';
    if (mins >= 1200 && mins < 1440) return 'post';
    return 'closed';
  }

  private quoteFor(seed: SeedInstrument): Quote {
    const master = this.master(seed, this.asOf());
    const last = master[master.length - 1]!;
    const prev = master[master.length - 2] ?? last;
    const price = last.c;
    const change = round(price - prev.c, 2);
    const changePercent = round(prev.c ? (change / prev.c) * 100 : 0, 2);
    const spread = Math.max(0.01, price * 0.0005);
    return {
      symbol: seed.symbol,
      currency: seed.currency,
      price,
      bid: round(price - spread, 2),
      ask: round(price + spread, 2),
      bidSize: 100,
      askSize: 100,
      open: last.o,
      dayHigh: last.h,
      dayLow: last.l,
      prevClose: prev.c,
      change,
      changePercent,
      ytdPercent: round(rangeValue(seededRng(seed.symbol, 'ytd'), -25, 45), 2),
      volume: last.v,
      marketState: this.marketStateFor(seed),
      timestamp: new Date().toISOString(),
    };
  }

  // --- DataProvider --------------------------------------------------------

  searchInstruments(query: string, limit = 12): Promise<Envelope<SearchResult[]>> {
    const q = query.trim().toLowerCase();
    const results: SearchResult[] = [];
    for (const s of SEED_INSTRUMENTS) {
      const haystack = `${s.symbol} ${s.name}`.toLowerCase();
      if (q.length === 0 || haystack.includes(q)) {
        const matchedOn = s.symbol.toLowerCase().includes(q) ? 'symbol' : 'name';
        results.push({
          identifier: {
            symbol: s.symbol,
            assetClass: s.assetClass,
            exchange: s.exchange,
            mic: s.mic,
            currency: s.currency,
          },
          name: s.name,
          score: q.length === 0 ? 0.5 : s.symbol.toLowerCase() === q ? 1 : 0.7,
          matchedOn,
        });
      }
    }
    if (results.length === 0 && /^[A-Za-z][A-Za-z0-9.\-]{0,11}$/.test(query.trim())) {
      const seed = this.synthesize(query.trim().toUpperCase());
      results.push({
        identifier: {
          symbol: seed.symbol,
          assetClass: seed.assetClass,
          exchange: seed.exchange,
          mic: seed.mic,
          currency: seed.currency,
        },
        name: seed.name,
        score: 0.4,
        matchedOn: 'symbol',
      });
    }
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return Promise.resolve(withProvenance(results.slice(0, limit), this.prov('search', 'eod')));
  }

  getInstrument(symbol: string): Promise<Envelope<Instrument>> {
    const seed = this.seedFor(symbol);
    return Promise.resolve(withProvenance(this.toInstrument(seed), this.prov('instruments', 'eod')));
  }

  getQuote(symbol: string): Promise<Envelope<Quote>> {
    const seed = this.seedFor(symbol);
    const crypto = seed.assetClass === 'crypto';
    return Promise.resolve(
      withProvenance(
        this.quoteFor(seed),
        this.prov('quotes', crypto ? 'live' : 'delayed', { delaySeconds: crypto ? 0 : 900 }),
      ),
    );
  }

  getQuotes(symbols: string[]): Promise<Envelope<QuoteBatch>> {
    const data: QuoteBatch = symbols.map((s) => this.quoteFor(this.seedFor(s)));
    return Promise.resolve(withProvenance(data, this.prov('batchQuotes', 'delayed', { delaySeconds: 900 })));
  }

  getHistory(symbol: string, query: HistoryQuery = {}): Promise<Envelope<HistoricalSeries>> {
    const seed = this.seedFor(symbol);
    const end = this.asOf();
    const range = query.range ?? '6mo';
    const interval = query.interval ?? '1d';
    let candles: Candle[];
    let tier: FreshnessTier = 'historical';
    const isIntraday = Boolean(INTERVAL_MINUTES[interval]);
    if (isIntraday) {
      candles = this.intraday(seed, interval, range, end);
      tier = 'delayed';
    } else {
      const count = RANGE_TO_DAYS[range];
      const master = this.master(seed, end);
      let slice = master.slice(Math.max(0, master.length - count));
      if (interval === '1w') slice = downsample(slice, 5);
      else if (interval === '1M') slice = downsample(slice, 21);
      candles = slice;
    }
    const asOf = candles.length > 0 ? candles[candles.length - 1]!.t : end.toISOString();
    const data: HistoricalSeries = {
      symbol: seed.symbol,
      interval,
      range,
      currency: seed.currency,
      candles,
    };
    const capability = isIntraday ? 'intradayPrices' : 'historicalPrices';
    return Promise.resolve(withProvenance(data, this.prov(capability, tier, { asOf })));
  }

  getTrades(symbol: string, limit = 30): Promise<Envelope<TradePrint[]>> {
    const seed = this.seedFor(symbol);
    const rng = seededRng(seed.symbol, 'tas');
    const base = this.quoteFor(seed).price;
    const now = this.asOf().getTime();
    const trades: TradePrint[] = [];
    for (let i = 0; i < limit; i++) {
      const drift = gaussian(rng) * base * 0.0008;
      trades.push({
        symbol: seed.symbol,
        timestamp: new Date(now - i * intInRange(rng, 800, 5000)).toISOString(),
        price: round(base + drift, 2),
        size: intInRange(rng, 1, 1000),
        side: rng() > 0.5 ? 'buy' : 'sell',
        venue: pick(rng, ['XNAS', 'ARCX', 'BATS', 'EDGX']),
      });
    }
    return Promise.resolve(withProvenance(trades, this.prov('trades', 'delayed', { delaySeconds: 900 })));
  }

  getOrderBook(symbol: string, depth = 10): Promise<Envelope<OrderBook>> {
    const seed = this.seedFor(symbol);
    const rng = seededRng(seed.symbol, 'book');
    const mid = this.quoteFor(seed).price;
    const tick = Math.max(0.01, round(mid * 0.0002, 2));
    const bids = [];
    const asks = [];
    for (let i = 0; i < depth; i++) {
      bids.push({ price: round(mid - tick * (i + 1), 2), size: intInRange(rng, 100, 5000) });
      asks.push({ price: round(mid + tick * (i + 1), 2), size: intInRange(rng, 100, 5000) });
    }
    const data: OrderBook = {
      symbol: seed.symbol,
      timestamp: new Date().toISOString(),
      bids,
      asks,
    };
    return Promise.resolve(withProvenance(data, this.prov('orderBook', 'delayed', { delaySeconds: 900 })));
  }

  getFundingRates(symbols?: string[]): Promise<Envelope<FundingRate[]>> {
    // Default board: the seeded crypto pairs; explicit symbols are synthesized
    // like every other unknown symbol, so any pair has a deterministic rate.
    const requested =
      symbols && symbols.length > 0
        ? symbols.map((s) => s.toUpperCase())
        : SEED_INSTRUMENTS.filter((i) => i.assetClass === 'crypto').map((i) => i.symbol);
    const asOf = this.asOf();
    // Next 8h funding boundary (00/08/16 UTC), like most perp venues.
    const next = new Date(asOf);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + (8 - (next.getUTCHours() % 8)));
    const rates: FundingRate[] = requested.map((symbol) => {
      const seed = this.seedFor(symbol);
      const rng = seededRng(seed.symbol, 'funding');
      // Perp funding mostly hovers slightly positive; keep a plausible band.
      const rate = round(-0.0005 + rng() * 0.002, 6);
      const mark = this.quoteFor(seed).price;
      return {
        symbol: seed.symbol,
        venue: 'mock',
        rate,
        intervalHours: 8,
        annualizedPct: round(rate * 3 * 365 * 100, 2),
        markPrice: mark,
        indexPrice: round(mark * (1 - rate / 10), 2),
        nextFundingAt: next.toISOString(),
        asOf: asOf.toISOString(),
      };
    });
    return Promise.resolve(withProvenance(rates, this.prov('fundingRates', 'delayed', { delaySeconds: 900 })));
  }

  getNews(query: NewsQuery = {}): Promise<Envelope<NewsItem[]>> {
    const limit = query.limit ?? 15;
    // An explicit `symbols` set (e.g. a resolved watchlist) is used as-is, even
    // when empty (an empty watchlist yields no news). Otherwise: a single symbol,
    // or the global feed (all seed symbols) when none is given.
    const requested =
      query.symbols !== undefined
        ? query.symbols.map((s) => s.toUpperCase())
        : query.symbol
          ? [query.symbol.toUpperCase()]
          : SEED_SYMBOLS;
    const single = requested.length === 1;
    const keyword = (query.keyword ?? query.query)?.trim().toLowerCase();
    const sinceMs = query.since ? Date.parse(query.since) : undefined;
    const untilMs = query.until ? Date.parse(query.until) : undefined;
    const now = this.asOf().getTime();
    const items: NewsItem[] = [];
    let counter = 0;
    // Generate a little extra per symbol so post-filtering still yields enough.
    for (const symbol of requested) {
      const seed = this.seedFor(symbol);
      const rng = seededRng(symbol, 'news', query.query ?? query.keyword ?? '');
      const perSymbol = single ? limit * 2 : Math.max(3, Math.ceil((limit * 2) / requested.length));
      for (let i = 0; i < perSymbol; i++) {
        const verb = pick(rng, NEWS_VERBS);
        const topic = pick(rng, NEWS_TOPICS);
        items.push({
          id: `mock-news-${symbol}-${i}`,
          headline: `${seed.name} ${verb} ${topic}`,
          summary: `Synthetic demo news for ${seed.symbol}. ${seed.name} ${verb} ${topic}. This content is generated for demonstration only.`,
          source: pick(rng, NEWS_SOURCES),
          publishedAt: new Date(now - intInRange(rng, 0, 72) * 3_600_000 - counter * 60_000).toISOString(),
          symbols: [seed.symbol],
          sentiment: pick(rng, SENTIMENTS),
          tags: [seed.sector ?? 'markets'],
        });
        counter++;
      }
    }
    let filtered = items;
    if (query.source) {
      const src = query.source.toLowerCase();
      filtered = filtered.filter((it) => it.source.toLowerCase() === src);
    }
    if (keyword) {
      filtered = filtered.filter((it) => `${it.headline} ${it.summary ?? ''}`.toLowerCase().includes(keyword));
    }
    if (sinceMs !== undefined && !Number.isNaN(sinceMs)) {
      filtered = filtered.filter((it) => Date.parse(it.publishedAt) >= sinceMs);
    }
    if (untilMs !== undefined && !Number.isNaN(untilMs)) {
      filtered = filtered.filter((it) => Date.parse(it.publishedAt) <= untilMs);
    }
    filtered.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return Promise.resolve(withProvenance(filtered.slice(0, limit), this.prov('news', 'delayed')));
  }

  getFilings(symbol: string, limit = 20): Promise<Envelope<Filing[]>> {
    const seed = this.seedFor(symbol);
    if (!seed.filer) {
      return Promise.resolve(withProvenance([], this.prov('filings', 'eod')));
    }
    const rng = seededRng(seed.symbol, 'filings');
    const now = this.asOf().getTime();
    const forms: Array<{ form: string; title: string }> = [
      { form: '10-K', title: 'Annual report' },
      { form: '10-Q', title: 'Quarterly report' },
      { form: '10-Q', title: 'Quarterly report' },
      { form: '10-Q', title: 'Quarterly report' },
      { form: '8-K', title: 'Current report' },
      { form: '8-K', title: 'Current report' },
      { form: 'DEF 14A', title: 'Proxy statement' },
    ];
    const filings: Filing[] = forms.slice(0, limit).map((f, i) => {
      const filedAt = new Date(now - (i * 70 + intInRange(rng, 0, 20)) * 86_400_000);
      return {
        id: `mock-filing-${seed.symbol}-${i}`,
        symbol: seed.symbol,
        form: f.form,
        title: `${seed.name} — ${f.title} (${f.form})`,
        filedAt: filedAt.toISOString(),
        periodOfReport: new Date(filedAt.getTime() - 30 * 86_400_000).toISOString().slice(0, 10),
        accessionNumber: `0000${intInRange(rng, 100000, 999999)}-${filedAt.getUTCFullYear()}-${String(i + 1).padStart(6, '0')}`,
        documents: [{ type: 'primary', description: `${f.form} primary document` }],
      };
    });
    return Promise.resolve(withProvenance(filings, this.prov('filings', 'eod')));
  }

  getFinancials(
    symbol: string,
    query: FinancialsQuery = {},
  ): Promise<Envelope<FinancialStatement[]>> {
    const seed = this.seedFor(symbol);
    if (seed.assetClass !== 'equity') {
      return Promise.resolve(withProvenance([], this.prov('fundamentals', 'eod')));
    }
    const period = query.period ?? 'annual';
    const statements = this.buildStatements(seed, period === 'quarterly' ? 'quarterly' : 'annual');
    const filtered = query.type ? statements.filter((s) => s.type === query.type) : statements;
    return Promise.resolve(withProvenance(filtered, this.prov('fundamentals', 'eod')));
  }

  private buildStatements(
    seed: SeedInstrument,
    period: 'annual' | 'quarterly',
  ): FinancialStatement[] {
    const rng = seededRng(seed.symbol, 'fin', period);
    const count = period === 'annual' ? 3 : 4;
    const baseRevenue = seed.marketCap * rangeValue(rng, 0.2, 0.4);
    const netMargin = rangeValue(rng, 0.12, 0.28);
    const periodScale = period === 'annual' ? 1 : 0.25;
    const year = this.asOf().getUTCFullYear();
    const out: FinancialStatement[] = [];

    for (let i = 0; i < count; i++) {
      const growth = (1 - i * 0.08) * (period === 'annual' ? 1 : 1 - i * 0.02);
      const revenue = round(baseRevenue * growth * periodScale, 0);
      const netIncome = round(revenue * netMargin, 0);
      const fiscalYear = period === 'annual' ? year - i : year;
      const fiscalQuarter = period === 'quarterly' ? ((4 - i + 4 - 1) % 4) + 1 : undefined;
      const fiscalDate = new Date(Date.UTC(fiscalYear, period === 'annual' ? 11 : 11 - i * 3, 28))
        .toISOString()
        .slice(0, 10);

      const make = (
        type: StatementType,
        lineItems: StatementLineItem[],
      ): FinancialStatement => ({
        symbol: seed.symbol,
        type,
        period: period === 'annual' ? 'annual' : 'quarterly',
        fiscalDate,
        fiscalYear,
        ...(fiscalQuarter ? { fiscalQuarter } : {}),
        currency: seed.currency,
        lineItems,
      });

      const grossProfit = round(revenue * rangeValue(rng, 0.4, 0.6), 0);
      const operatingIncome = round(revenue * rangeValue(rng, 0.2, 0.35), 0);
      const eps = round(netIncome / seed.sharesOutstanding, 2);

      out.push(
        make('income', [
          { key: 'totalRevenue', label: 'Total revenue', value: revenue, unit: seed.currency, order: 1 },
          { key: 'costOfRevenue', label: 'Cost of revenue', value: round(revenue - grossProfit, 0), unit: seed.currency, order: 2 },
          { key: 'grossProfit', label: 'Gross profit', value: grossProfit, unit: seed.currency, order: 3 },
          { key: 'operatingIncome', label: 'Operating income', value: operatingIncome, unit: seed.currency, order: 4 },
          { key: 'netIncome', label: 'Net income', value: netIncome, unit: seed.currency, order: 5 },
          { key: 'eps', label: 'Diluted EPS', value: eps, unit: seed.currency, order: 6 },
        ]),
      );

      const totalAssets = round(revenue * rangeValue(rng, 1.5, 2.5), 0);
      const totalLiabilities = round(totalAssets * rangeValue(rng, 0.4, 0.6), 0);
      out.push(
        make('balance', [
          { key: 'totalAssets', label: 'Total assets', value: totalAssets, unit: seed.currency, order: 1 },
          { key: 'totalLiabilities', label: 'Total liabilities', value: totalLiabilities, unit: seed.currency, order: 2 },
          { key: 'totalEquity', label: 'Total equity', value: round(totalAssets - totalLiabilities, 0), unit: seed.currency, order: 3 },
          { key: 'cashAndEquivalents', label: 'Cash & equivalents', value: round(totalAssets * rangeValue(rng, 0.1, 0.25), 0), unit: seed.currency, order: 4 },
          { key: 'totalDebt', label: 'Total debt', value: round(totalLiabilities * rangeValue(rng, 0.3, 0.6), 0), unit: seed.currency, order: 5 },
        ]),
      );

      const operatingCashFlow = round(netIncome * rangeValue(rng, 1.1, 1.5), 0);
      const capex = round(revenue * rangeValue(rng, 0.05, 0.12), 0);
      out.push(
        make('cash_flow', [
          { key: 'operatingCashFlow', label: 'Operating cash flow', value: operatingCashFlow, unit: seed.currency, order: 1 },
          { key: 'capitalExpenditures', label: 'Capital expenditures', value: -capex, unit: seed.currency, order: 2 },
          { key: 'freeCashFlow', label: 'Free cash flow', value: round(operatingCashFlow - capex, 0), unit: seed.currency, order: 3 },
          { key: 'dividendsPaid', label: 'Dividends paid', value: round(-netIncome * rangeValue(rng, 0, 0.3), 0), unit: seed.currency, order: 4 },
        ]),
      );
    }
    return out;
  }

  getEstimates(symbol: string): Promise<Envelope<EstimateMetric[]>> {
    const seed = this.seedFor(symbol);
    if (seed.assetClass !== 'equity') {
      return Promise.resolve(withProvenance([], this.prov('estimates', 'eod')));
    }
    const rng = seededRng(seed.symbol, 'estimates');
    const periods: EstimatePeriod[] = [
      'current_quarter',
      'next_quarter',
      'current_year',
      'next_year',
    ];
    const year = this.asOf().getUTCFullYear();
    const baseEps = round((seed.marketCap * 0.02) / seed.sharesOutstanding, 2);
    const baseRev = round(seed.marketCap * 0.3, 0);
    const metrics: EstimateMetric[] = [];
    periods.forEach((period, i) => {
      const epsMean = round(baseEps * (period.includes('year') ? 4 : 1) * (1 + i * 0.03), 2);
      metrics.push({
        metric: 'eps',
        period,
        fiscalLabel: period.includes('year') ? `FY ${year + (period === 'next_year' ? 1 : 0)}` : `Q${(i % 4) + 1} ${year}`,
        mean: epsMean,
        median: epsMean,
        high: round(epsMean * 1.1, 2),
        low: round(epsMean * 0.9, 2),
        numAnalysts: intInRange(rng, 8, 38),
        actual: null,
        currency: seed.currency,
      });
      const revMean = round(baseRev * (period.includes('year') ? 1 : 0.25) * (1 + i * 0.03), 0);
      metrics.push({
        metric: 'revenue',
        period,
        mean: revMean,
        high: round(revMean * 1.08, 0),
        low: round(revMean * 0.92, 0),
        numAnalysts: intInRange(rng, 8, 38),
        actual: null,
        currency: seed.currency,
      });
    });
    return Promise.resolve(withProvenance(metrics, this.prov('estimates', 'eod')));
  }

  getAnalystRatings(symbol: string): Promise<Envelope<AnalystRating[]>> {
    const seed = this.seedFor(symbol);
    if (seed.assetClass !== 'equity') {
      return Promise.resolve(withProvenance([], this.prov('analystRatings', 'eod')));
    }
    const rng = seededRng(seed.symbol, 'ratings');
    const firms = ['Demo Securities', 'Mockenzie', 'Synthetic Capital', 'Pseudo Partners', 'Terminal Research'];
    const ratings = ['buy', 'overweight', 'hold', 'neutral', 'sell'];
    const actions = ['initiate', 'upgrade', 'downgrade', 'maintain', 'reiterate'] as const;
    const price = this.quoteFor(seed).price;
    const now = this.asOf().getTime();
    const data: AnalystRating[] = firms.map((firm, i) => ({
      symbol: seed.symbol,
      firm,
      rating: pick(rng, ratings),
      action: actions[intInRange(rng, 0, actions.length - 1)]!,
      priceTarget: round(price * rangeValue(rng, 0.85, 1.3), 2),
      previousPriceTarget: round(price * rangeValue(rng, 0.8, 1.25), 2),
      date: new Date(now - i * intInRange(rng, 5, 30) * 86_400_000).toISOString().slice(0, 10),
    }));
    return Promise.resolve(withProvenance(data, this.prov('analystRatings', 'eod')));
  }

  getOwnership(symbol: string): Promise<Envelope<InstitutionalHolder[]>> {
    const seed = this.seedFor(symbol);
    if (seed.assetClass !== 'equity') {
      return Promise.resolve(withProvenance([], this.prov('ownership', 'eod')));
    }
    const rng = seededRng(seed.symbol, 'ownership');
    const holders = ['Demo Asset Mgmt', 'Mock Vanguard', 'Synthetic State Street', 'Pseudo BlackRock', 'Terminal Index Fund', 'Quant Demo LP'];
    const price = this.quoteFor(seed).price;
    const reportDate = new Date(this.asOf().getTime() - 45 * 86_400_000).toISOString().slice(0, 10);
    const data: InstitutionalHolder[] = holders.map((holder) => {
      const shares = intInRange(rng, 1_000_000, Math.max(2_000_000, Math.floor(seed.sharesOutstanding * 0.08)));
      return {
        holder,
        shares,
        marketValue: round(shares * price, 0),
        percentOfShares: round((shares / seed.sharesOutstanding) * 100, 2),
        changeShares: intInRange(rng, -500_000, 800_000),
        reportDate,
      };
    });
    return Promise.resolve(withProvenance(data, this.prov('ownership', 'eod')));
  }

  getOptionChain(symbol: string, query: OptionQuery = {}): Promise<Envelope<OptionChain>> {
    const seed = this.seedFor(symbol);
    if (!seed.optionable) {
      return Promise.resolve(
        withProvenance(
          { underlying: seed.symbol, expirations: [], strikes: [], contracts: [] },
          this.prov('options', 'delayed'),
        ),
      );
    }
    const rng = seededRng(seed.symbol, 'options');
    const spot = this.quoteFor(seed).price;
    const now = this.asOf();
    const expirations = [30, 60].map((days) =>
      new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10),
    );
    const selected = query.expiry && expirations.includes(query.expiry) ? [query.expiry] : expirations;
    const strikeStep = Math.max(1, round(spot * 0.05, 0));
    const strikes: number[] = [];
    for (let i = -5; i <= 5; i++) strikes.push(round(spot + i * strikeStep, 2));
    const contracts: OptionContract[] = [];
    for (const expiry of selected) {
      const yymmdd = expiry.replace(/-/g, '').slice(2);
      for (const strike of strikes) {
        for (const type of ['call', 'put'] as const) {
          const iv = round(rangeValue(rng, 0.2, 0.8), 4);
          const intrinsic = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
          const last = round(intrinsic + rangeValue(rng, 0.5, 6), 2);
          contracts.push({
            contractSymbol: `${seed.symbol.replace('-', '')}${yymmdd}${type === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`,
            underlying: seed.symbol,
            type,
            strike,
            expiry,
            bid: round(last * 0.97, 2),
            ask: round(last * 1.03, 2),
            last,
            volume: intInRange(rng, 0, 5000),
            openInterest: intInRange(rng, 0, 20000),
            impliedVolatility: iv,
            inTheMoney: intrinsic > 0,
            greeks: {
              delta: round(type === 'call' ? rangeValue(rng, 0.1, 0.9) : -rangeValue(rng, 0.1, 0.9), 3),
              gamma: round(rangeValue(rng, 0.001, 0.05), 4),
              theta: round(-rangeValue(rng, 0.01, 0.2), 4),
              vega: round(rangeValue(rng, 0.01, 0.3), 4),
            },
          });
        }
      }
    }
    const data: OptionChain = { underlying: seed.symbol, expirations: selected, strikes, contracts };
    return Promise.resolve(withProvenance(data, this.prov('options', 'delayed', { delaySeconds: 900 })));
  }

  screen(query: ScreenQuery): Promise<Envelope<ScreenRow[]>> {
    // Value the whole synthetic universe, then apply the screen (filter/sort/limit).
    const rows: ScreenRow[] = SEED_INSTRUMENTS.map((seed) => {
      const quote = this.quoteFor(seed);
      return {
        symbol: seed.symbol,
        name: seed.name,
        assetClass: seed.assetClass,
        sector: seed.sector ?? null,
        price: quote.price,
        changePercent: quote.changePercent ?? null,
        marketCap: seed.marketCap,
        volume: quote.volume ?? null,
      };
    });
    return Promise.resolve(withProvenance(applyScreen(rows, query), this.prov('screener', 'delayed', { delaySeconds: 900 })));
  }

  getMembership(symbol: string): Promise<Envelope<IndexMembership>> {
    const upper = symbol.trim().toUpperCase();
    // Synthetic benchmark definitions over the demo universe. ETF tickers map
    // to the index they track; weights are market-cap shares of the members.
    const boards: Record<string, { name: string; members: string[] }> = {
      SPX: { name: 'Synthetic Large-Cap 500 (demo)', members: ['AAPL', 'MSFT', 'NVDA', 'TSLA'] },
      SPY: { name: 'Synthetic Large-Cap 500 ETF (demo)', members: ['AAPL', 'MSFT', 'NVDA', 'TSLA'] },
      NDX: { name: 'Synthetic Tech 100 (demo)', members: ['AAPL', 'MSFT', 'NVDA'] },
      QQQ: { name: 'Synthetic Tech 100 ETF (demo)', members: ['AAPL', 'MSFT', 'NVDA'] },
      DJI: { name: 'Synthetic Industrial 30 (demo)', members: ['AAPL', 'MSFT'] },
    };
    const board = boards[upper];
    const members = board ? board.members.map((m) => this.seedFor(m)) : [];
    const totalCap = members.reduce((sum, m) => sum + m.marketCap, 0);
    const data: IndexMembership = {
      symbol: upper,
      name: board?.name ?? `${upper} (no synthetic membership defined)`,
      asOf: this.asOf().toISOString(),
      constituents: members
        .map((m) => ({
          symbol: m.symbol,
          name: m.name,
          weightPct: totalCap > 0 ? Math.round((m.marketCap / totalCap) * 10000) / 100 : 0,
          sector: m.sector ?? null,
        }))
        .sort((a, b) => b.weightPct - a.weightPct),
    };
    return Promise.resolve(withProvenance(data, this.prov('membership', 'eod')));
  }

  getDexPools(query: string, limit = 12): Promise<Envelope<DexPool[]>> {
    // Deterministic synthetic pools for any token query: a fixed venue set with
    // per-token seeded liquidity/volume, priced off the token's mock quote when
    // one exists (`ETH` → the ETH-USD seed) so panels stay consistent.
    const token = query.trim().toUpperCase().split(/[-/\s]/)[0] || 'ETH';
    const known = SEED_BY_SYMBOL.get(`${token}-USD`);
    const basePrice = known
      ? this.quoteFor(known).price
      : round(rangeValue(seededRng(token, 'dex-price'), 0.0001, 250), 6);
    const venues = [
      { chain: 'ethereum', dex: 'uniswap', quote: 'WETH' },
      { chain: 'ethereum', dex: 'uniswap', quote: 'USDC' },
      { chain: 'base', dex: 'aerodrome', quote: 'USDC' },
      { chain: 'arbitrum', dex: 'camelot', quote: 'USDT' },
      { chain: 'solana', dex: 'raydium', quote: 'SOL' },
      { chain: 'bsc', dex: 'pancakeswap', quote: 'WBNB' },
    ];
    const rng = seededRng(token, 'dex-pools');
    const hexAddress = () => `0x${Array.from({ length: 40 }, () => Math.floor(rng() * 16).toString(16)).join('')}`;
    const asOf = this.asOf().toISOString();
    const pools: DexPool[] = venues
      .slice(0, Math.max(1, Math.min(limit, venues.length)))
      .map((v) => {
        const liquidity = Math.round(rangeValue(rng, 50_000, 40_000_000));
        return {
          pairAddress: hexAddress(),
          chain: v.chain,
          dex: v.dex,
          baseToken: {
            symbol: token,
            name: known?.name ?? `${token} (synthetic demo)`,
            address: hexAddress(),
          },
          quoteToken: { symbol: v.quote, name: null, address: null },
          // Small per-venue dispersion around one price, like real fragmentation.
          priceUsd: round(basePrice * (1 + (rng() - 0.5) * 0.004), 6),
          change24hPct: round(rangeValue(rng, -18, 18), 2),
          volume24hUsd: Math.round(liquidity * rangeValue(rng, 0.05, 1.8)),
          liquidityUsd: liquidity,
          fdvUsd: Math.round(liquidity * rangeValue(rng, 5, 400)),
          buys24h: intInRange(rng, 50, 4000),
          sells24h: intInRange(rng, 50, 4000),
          url: null,
          asOf,
        };
      })
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    return Promise.resolve(withProvenance(pools, this.prov('dexPools', 'delayed', { delaySeconds: 900 })));
  }

  getEvents(query: EventsQuery = {}): Promise<Envelope<CorporateEvent[]>> {
    const asOf = this.asOf();
    const dayMs = 86_400_000;
    const from = asOf.getTime() - 30 * dayMs;
    const to = asOf.getTime() + (query.days ?? 30) * dayMs;
    const symbols = query.symbol
      ? [query.symbol.toUpperCase()]
      : SEED_INSTRUMENTS.filter((s) => s.filer).map((s) => s.symbol);

    const events: CorporateEvent[] = [];
    for (const symbol of symbols) {
      const seed = this.seedFor(symbol);
      if (!seed.filer) continue; // crypto/indices publish no corporate events
      const rng = seededRng(seed.symbol, 'events');
      const price = this.quoteFor(seed).price;

      // Quarterly earnings anchored to a per-symbol offset so the cycle is
      // deterministic for any asOf date; ±2 cycles cover the window.
      const anchor = intInRange(rng, 0, 90);
      const dayIndex = Math.floor(asOf.getTime() / dayMs);
      const untilNext = (anchor - dayIndex) % 91;
      const nextEarnings = dayIndex + ((untilNext % 91) + 91) % 91;
      const baseEps = round((seed.marketCap * 0.02) / seed.sharesOutstanding, 2);
      for (let cycle = -2; cycle <= 1; cycle++) {
        const eventDay = nextEarnings + cycle * 91;
        const at = eventDay * dayMs;
        if (at < from || at > to) continue;
        const daysOut = eventDay - dayIndex;
        events.push({
          id: `mock-evt-${seed.symbol}-earn-${eventDay}`,
          symbol: seed.symbol,
          type: 'earnings',
          date: new Date(at).toISOString().slice(0, 10),
          status: daysOut <= 14 ? 'confirmed' : 'estimated',
          title: `${seed.name} — quarterly earnings`,
          epsEstimate: daysOut >= 0 ? round(baseEps * rangeValue(rng, 0.9, 1.1), 2) : null,
        });
      }

      // ~60% of filers pay a quarterly dividend on their own offset cycle.
      if (rng() < 0.6) {
        const divAnchor = intInRange(rng, 0, 90);
        const untilDiv = (((divAnchor - dayIndex) % 91) + 91) % 91;
        const amount = round(price * rangeValue(rng, 0.002, 0.008), 2);
        for (let cycle = -2; cycle <= 1; cycle++) {
          const eventDay = dayIndex + untilDiv + cycle * 91;
          const at = eventDay * dayMs;
          if (at < from || at > to || amount <= 0) continue;
          events.push({
            id: `mock-evt-${seed.symbol}-div-${eventDay}`,
            symbol: seed.symbol,
            type: 'dividend',
            date: new Date(at).toISOString().slice(0, 10),
            status: eventDay - dayIndex <= 30 ? 'confirmed' : 'estimated',
            title: `${seed.name} — ex-dividend`,
            amount,
          });
        }
      }

      // A rare historical split inside the trailing window.
      if (rng() < 0.15) {
        const daysAgo = intInRange(rng, 3, 28);
        const at = (dayIndex - daysAgo) * dayMs;
        if (at >= from && at <= to) {
          events.push({
            id: `mock-evt-${seed.symbol}-split`,
            symbol: seed.symbol,
            type: 'split',
            date: new Date(at).toISOString().slice(0, 10),
            status: 'confirmed',
            title: `${seed.name} — stock split`,
            ratio: pick(rng, ['2:1', '3:1', '4:1']),
          });
        }
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
    return Promise.resolve(withProvenance(events, this.prov('events', 'eod')));
  }

  getEconomicSeries(
    seriesId: string,
    query: EconomicSeriesQuery = {},
  ): Promise<Envelope<EconomicSeries>> {
    const id = seriesId.trim().toUpperCase();
    const seed = ECON_CATALOG[id] ?? syntheticEconSeed(id);
    let observations = buildEconObservations(seed, id, this.asOf());
    if (query.start) {
      const startMs = Date.parse(query.start);
      if (!Number.isNaN(startMs)) observations = observations.filter((o) => Date.parse(o.date) >= startMs);
    }
    if (query.end) {
      const endMs = Date.parse(query.end);
      if (!Number.isNaN(endMs)) observations = observations.filter((o) => Date.parse(o.date) <= endMs);
    }
    if (query.limit && observations.length > query.limit) {
      observations = observations.slice(observations.length - query.limit);
    }
    const first = observations[0];
    const last = observations[observations.length - 1];
    const data: EconomicSeries = {
      seriesId: id,
      title: seed.title,
      units: seed.units,
      ...(seed.unitsShort ? { unitsShort: seed.unitsShort } : {}),
      frequency: seed.frequency,
      ...(seed.seasonalAdjustment ? { seasonalAdjustment: seed.seasonalAdjustment } : {}),
      ...(first ? { observationStart: first.date } : {}),
      ...(last ? { observationEnd: last.date } : {}),
      observations,
    };
    return Promise.resolve(withProvenance(data, this.prov('economicSeries', 'eod')));
  }
}
