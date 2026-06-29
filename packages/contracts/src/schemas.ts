import type { z } from 'zod';

import { InstrumentSchema, InstrumentIdentifierSchema, SearchResultSchema } from './instruments';
import {
  QuoteSchema,
  QuoteBatchSchema,
  CandleSchema,
  HistoricalSeriesSchema,
  TradePrintSchema,
  OrderBookSchema,
  VenueQuoteSchema,
} from './market';
import { NewsItemSchema, NewsQuerySchema } from './news';
import { FilingSchema, FilingDocumentSchema } from './filings';
import {
  FinancialStatementSchema,
  StatementLineItemSchema,
  EstimateMetricSchema,
  AnalystRatingSchema,
  InstitutionalHolderSchema,
} from './fundamentals';
import { OptionContractSchema, OptionChainSchema } from './options';
import { PortfolioSchema, PositionSchema, WatchlistSchema } from './portfolio';
import { AlertRuleSchema } from './alerts';
import { WorkspaceSchema, PanelSchema, UserPreferencesSchema } from './workspace';
import { ProviderDescriptorSchema, ProviderCapabilitiesSchema } from './provider';
import { DataProvenanceSchema, DataFreshnessSchema } from './provenance';
import { CommandDescriptorSchema, CommandParseResultSchema } from './terminal';
import { ModuleManifestSchema } from './module';
import { AIContextPacketSchema, AIChatRequestSchema, AIChatResponseSchema } from './ai';

/**
 * A central registry of the domain schemas, keyed by stable name. Useful for
 * generic validation, contract tests, and tooling that needs to enumerate the
 * domain surface.
 */
export const Schemas = {
  Instrument: InstrumentSchema,
  InstrumentIdentifier: InstrumentIdentifierSchema,
  SearchResult: SearchResultSchema,
  Quote: QuoteSchema,
  QuoteBatch: QuoteBatchSchema,
  Candle: CandleSchema,
  HistoricalSeries: HistoricalSeriesSchema,
  TradePrint: TradePrintSchema,
  OrderBook: OrderBookSchema,
  VenueQuote: VenueQuoteSchema,
  NewsItem: NewsItemSchema,
  NewsQuery: NewsQuerySchema,
  Filing: FilingSchema,
  FilingDocument: FilingDocumentSchema,
  FinancialStatement: FinancialStatementSchema,
  StatementLineItem: StatementLineItemSchema,
  EstimateMetric: EstimateMetricSchema,
  AnalystRating: AnalystRatingSchema,
  InstitutionalHolder: InstitutionalHolderSchema,
  OptionContract: OptionContractSchema,
  OptionChain: OptionChainSchema,
  Portfolio: PortfolioSchema,
  Position: PositionSchema,
  Watchlist: WatchlistSchema,
  AlertRule: AlertRuleSchema,
  Workspace: WorkspaceSchema,
  Panel: PanelSchema,
  UserPreferences: UserPreferencesSchema,
  ProviderDescriptor: ProviderDescriptorSchema,
  ProviderCapabilities: ProviderCapabilitiesSchema,
  DataProvenance: DataProvenanceSchema,
  DataFreshness: DataFreshnessSchema,
  CommandDescriptor: CommandDescriptorSchema,
  CommandParseResult: CommandParseResultSchema,
  ModuleManifest: ModuleManifestSchema,
  AIContextPacket: AIContextPacketSchema,
  AIChatRequest: AIChatRequestSchema,
  AIChatResponse: AIChatResponseSchema,
} as const satisfies Record<string, z.ZodTypeAny>;

export type SchemaName = keyof typeof Schemas;
