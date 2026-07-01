import type { ModuleComponent } from './types';
import { HelpModule } from './HelpModule';
import { SearchModule } from './SearchModule';
import { DescriptionModule } from './DescriptionModule';
import { ChartModule } from './ChartModule';
import { HistoryTableModule } from './HistoryTableModule';
import { QuoteMonitorModule } from './QuoteMonitorModule';
import { FocusModule } from './FocusModule';
import { WatchlistModule } from './WatchlistModule';
import { NewsModule } from './NewsModule';
import { TopNewsModule } from './TopNewsModule';
import { FilingsModule } from './FilingsModule';
import { FilingViewerModule } from './FilingViewerModule';
import { FinancialsModule } from './FinancialsModule';
import { OptionsMonitorModule } from './OptionsMonitorModule';
import { TimeAndSalesModule } from './TimeAndSalesModule';
import { EstimatesModule } from './EstimatesModule';
import { AnalystRatingsModule } from './AnalystRatingsModule';
import { HoldersModule } from './HoldersModule';
import { ComparisonModule } from './ComparisonModule';
import { WorldIndicesModule } from './WorldIndicesModule';
import { AiModule } from './AiModule';
import { SettingsModule } from './SettingsModule';
import { NotesModule } from './NotesModule';
import { AlertsModule } from './AlertsModule';
import { PortfolioModule } from './PortfolioModule';
import { ScreenerModule } from './ScreenerModule';
import { MoversModule } from './MoversModule';
import { EconomicsModule } from './EconomicsModule';
import { OptionPricerModule } from './OptionPricerModule';
import { CalculatorModule } from './CalculatorModule';
import { IntradayChartModule } from './IntradayChartModule';
import { LayoutManagerModule } from './LayoutManagerModule';
import { EventsModule } from './EventsModule';
import { AccountModule } from './AccountModule';
import { AdminModule } from './AdminModule';
import { OrderBookModule } from './OrderBookModule';
import { FundingModule } from './FundingModule';

/** Fully-implemented module components keyed by moduleId. */
export const moduleComponents: Record<string, ModuleComponent> = {
  help: HelpModule,
  search: SearchModule,
  description: DescriptionModule,
  chart: ChartModule,
  'history-table': HistoryTableModule,
  'quote-monitor': QuoteMonitorModule,
  focus: FocusModule,
  watchlist: WatchlistModule,
  news: NewsModule,
  'top-news': TopNewsModule,
  filings: FilingsModule,
  'filing-viewer': FilingViewerModule,
  financials: FinancialsModule,
  estimates: EstimatesModule,
  'analyst-ratings': AnalystRatingsModule,
  holders: HoldersModule,
  'options-monitor': OptionsMonitorModule,
  'time-and-sales': TimeAndSalesModule,
  compare: ComparisonModule,
  'world-indices': WorldIndicesModule,
  ai: AiModule,
  settings: SettingsModule,
  notes: NotesModule,
  alerts: AlertsModule,
  portfolio: PortfolioModule,
  screener: ScreenerModule,
  movers: MoversModule,
  economics: EconomicsModule,
  'option-pricer': OptionPricerModule,
  calculator: CalculatorModule,
  'intraday-chart': IntradayChartModule,
  'layout-manager': LayoutManagerModule,
  events: EventsModule,
  account: AccountModule,
  admin: AdminModule,
  'order-book': OrderBookModule,
  funding: FundingModule,
};
