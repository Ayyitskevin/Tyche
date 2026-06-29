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
};
