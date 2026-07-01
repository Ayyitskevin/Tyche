import type {
  AnalystRating,
  BarInterval,
  CorporateEvent,
  EconomicSeries,
  EconomicSeriesQuery,
  Envelope,
  EventsQuery,
  EstimateMetric,
  Filing,
  FinancialStatement,
  FiscalPeriod,
  HistoricalSeries,
  HistoryRange,
  InstitutionalHolder,
  Instrument,
  NewsItem,
  OptionChain,
  OrderBook,
  ProviderDescriptor,
  Quote,
  QuoteBatch,
  ScreenQuery,
  ScreenRow,
  SearchResult,
  StatementType,
  TradePrint,
} from '@tyche/contracts';
import { ProviderError } from './errors';

export interface HistoryQuery {
  range?: HistoryRange;
  interval?: BarInterval;
}

export interface NewsQuery {
  symbol?: string;
  /** Explicit symbol set (e.g. a resolved watchlist). Empty/absent ⇒ global feed. */
  symbols?: string[];
  /** Backward-compatible free-text alias for `keyword`. */
  query?: string;
  source?: string;
  keyword?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface FinancialsQuery {
  type?: StatementType;
  period?: FiscalPeriod;
}

export interface OptionQuery {
  expiry?: string;
}

/**
 * The provider contract. Every method returns an {@link Envelope} pairing the
 * normalized data with its {@link DataProvenance}. Providers that lack a
 * capability should throw {@link CapabilityError} rather than return empty data
 * silently — the API layer translates that into a graceful UI state.
 */
export interface DataProvider {
  readonly descriptor: ProviderDescriptor;

  searchInstruments(query: string, limit?: number): Promise<Envelope<SearchResult[]>>;
  getInstrument(symbol: string): Promise<Envelope<Instrument>>;

  getQuote(symbol: string): Promise<Envelope<Quote>>;
  getQuotes(symbols: string[]): Promise<Envelope<QuoteBatch>>;
  getHistory(symbol: string, query?: HistoryQuery): Promise<Envelope<HistoricalSeries>>;
  getTrades(symbol: string, limit?: number): Promise<Envelope<TradePrint[]>>;
  getOrderBook(symbol: string, depth?: number): Promise<Envelope<OrderBook>>;

  getNews(query?: NewsQuery): Promise<Envelope<NewsItem[]>>;
  getFilings(symbol: string, limit?: number): Promise<Envelope<Filing[]>>;
  getFinancials(symbol: string, query?: FinancialsQuery): Promise<Envelope<FinancialStatement[]>>;
  getEstimates(symbol: string): Promise<Envelope<EstimateMetric[]>>;
  getAnalystRatings(symbol: string): Promise<Envelope<AnalystRating[]>>;
  getOwnership(symbol: string): Promise<Envelope<InstitutionalHolder[]>>;
  getOptionChain(symbol: string, query?: OptionQuery): Promise<Envelope<OptionChain>>;
  screen(query: ScreenQuery): Promise<Envelope<ScreenRow[]>>;
  getEconomicSeries(
    seriesId: string,
    query?: EconomicSeriesQuery,
  ): Promise<Envelope<EconomicSeries>>;
  getEvents(query?: EventsQuery): Promise<Envelope<CorporateEvent[]>>;
}

/**
 * Base class for provider stubs/scaffolds. Every method rejects with a clear
 * "not implemented" error so an accidentally-enabled adapter fails loudly and
 * informatively instead of returning garbage. Concrete providers (e.g. the mock
 * provider) implement {@link DataProvider} directly.
 */
export abstract class StubProvider implements DataProvider {
  abstract readonly descriptor: ProviderDescriptor;

  private fail(capability: string): Promise<never> {
    return Promise.reject(
      new ProviderError(
        this.descriptor.name,
        `Capability "${capability}" is not implemented by the ${this.descriptor.name} adapter yet. ` +
          `See DATA_PROVIDERS.md to wire it up; this adapter ships as a scaffold.`,
      ),
    );
  }

  searchInstruments(): Promise<Envelope<SearchResult[]>> {
    return this.fail('search');
  }
  getInstrument(): Promise<Envelope<Instrument>> {
    return this.fail('instruments');
  }
  getQuote(): Promise<Envelope<Quote>> {
    return this.fail('quotes');
  }
  getQuotes(): Promise<Envelope<QuoteBatch>> {
    return this.fail('batchQuotes');
  }
  getHistory(): Promise<Envelope<HistoricalSeries>> {
    return this.fail('historicalPrices');
  }
  getTrades(): Promise<Envelope<TradePrint[]>> {
    return this.fail('trades');
  }
  getOrderBook(): Promise<Envelope<OrderBook>> {
    return this.fail('orderBook');
  }
  getNews(): Promise<Envelope<NewsItem[]>> {
    return this.fail('news');
  }
  getFilings(_symbol: string, _limit?: number): Promise<Envelope<Filing[]>> {
    return this.fail('filings');
  }
  getFinancials(): Promise<Envelope<FinancialStatement[]>> {
    return this.fail('fundamentals');
  }
  getEstimates(): Promise<Envelope<EstimateMetric[]>> {
    return this.fail('estimates');
  }
  getAnalystRatings(): Promise<Envelope<AnalystRating[]>> {
    return this.fail('analystRatings');
  }
  getOwnership(): Promise<Envelope<InstitutionalHolder[]>> {
    return this.fail('ownership');
  }
  getOptionChain(): Promise<Envelope<OptionChain>> {
    return this.fail('options');
  }
  screen(): Promise<Envelope<ScreenRow[]>> {
    return this.fail('screener');
  }
  getEconomicSeries(
    _seriesId: string,
    _query?: EconomicSeriesQuery,
  ): Promise<Envelope<EconomicSeries>> {
    return this.fail('economicSeries');
  }
  getEvents(_query?: EventsQuery): Promise<Envelope<CorporateEvent[]>> {
    return this.fail('events');
  }
}
