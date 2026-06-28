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
import { FilingsModule } from './FilingsModule';
import { FilingViewerModule } from './FilingViewerModule';
import { FinancialsModule } from './FinancialsModule';
import { AiModule } from './AiModule';
import { SettingsModule } from './SettingsModule';
import { NotesModule } from './NotesModule';

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
  filings: FilingsModule,
  'filing-viewer': FilingViewerModule,
  financials: FinancialsModule,
  ai: AiModule,
  settings: SettingsModule,
  notes: NotesModule,
};
