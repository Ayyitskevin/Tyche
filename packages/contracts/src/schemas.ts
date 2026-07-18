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
import { FilingSearchHitSchema, FilingSearchQuerySchema } from './filingSearch';
import {
  FinancialStatementSchema,
  StatementLineItemSchema,
  EstimateMetricSchema,
  AnalystRatingSchema,
  InstitutionalHolderSchema,
} from './fundamentals';
import { OptionContractSchema, OptionChainSchema } from './options';
import { PortfolioSchema, PositionSchema, WatchlistSchema } from './portfolio';
import { NoteSchema, NoteExportSchema } from './notes';
import { PluginManifestSchema, PluginInfoSchema } from './plugin';
import { ScreenQuerySchema, ScreenRowSchema, SavedScreenSchema } from './screener';
import { EconomicSeriesSchema, EconomicObservationSchema, EconomicSeriesQuerySchema } from './economics';
import { EconomicReleaseSchema, EconomicReleaseQuerySchema } from './economicReleases';
import {
  InstitutionalHoldingSchema,
  InstitutionalPortfolioSchema,
  InstitutionalHoldingsQuerySchema,
} from './institutional';
import { AuditEventSchema } from './audit';
import { CorporateEventSchema, EventsQuerySchema } from './events';
import { FundingRateSchema } from './funding';
import { IndexMembershipSchema, ConstituentSchema } from './membership';
import { DexPoolSchema, DexTokenSchema } from './dexpool';
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
  FilingSearchHit: FilingSearchHitSchema,
  FilingSearchQuery: FilingSearchQuerySchema,
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
  Note: NoteSchema,
  NoteExport: NoteExportSchema,
  PluginManifest: PluginManifestSchema,
  PluginInfo: PluginInfoSchema,
  ScreenQuery: ScreenQuerySchema,
  ScreenRow: ScreenRowSchema,
  SavedScreen: SavedScreenSchema,
  EconomicSeries: EconomicSeriesSchema,
  EconomicObservation: EconomicObservationSchema,
  EconomicSeriesQuery: EconomicSeriesQuerySchema,
  EconomicRelease: EconomicReleaseSchema,
  EconomicReleaseQuery: EconomicReleaseQuerySchema,
  InstitutionalHolding: InstitutionalHoldingSchema,
  InstitutionalPortfolio: InstitutionalPortfolioSchema,
  InstitutionalHoldingsQuery: InstitutionalHoldingsQuerySchema,
  AuditEvent: AuditEventSchema,
  CorporateEvent: CorporateEventSchema,
  EventsQuery: EventsQuerySchema,
  FundingRate: FundingRateSchema,
  IndexMembership: IndexMembershipSchema,
  Constituent: ConstituentSchema,
  DexPool: DexPoolSchema,
  DexToken: DexTokenSchema,
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
