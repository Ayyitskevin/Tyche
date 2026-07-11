import { lazy } from 'react';
import type { ModuleComponent } from './types';

/**
 * Fully-implemented module components keyed by moduleId. Every module is
 * code-split via `React.lazy` — its chunk loads the first time a panel opens —
 * so the entry bundle stays small. Each entry keeps a literal `import()` so
 * the bundler can build one chunk per module.
 */
export const moduleComponents: Record<string, ModuleComponent> = {
  help: lazy(() => import('./HelpModule').then((m) => ({ default: m.HelpModule }))),
  changelog: lazy(() => import('./ChangelogModule').then((m) => ({ default: m.ChangelogModule }))),
  tour: lazy(() => import('./TourModule').then((m) => ({ default: m.TourModule }))),
  search: lazy(() => import('./SearchModule').then((m) => ({ default: m.SearchModule }))),
  description: lazy(() => import('./DescriptionModule').then((m) => ({ default: m.DescriptionModule }))),
  chart: lazy(() => import('./ChartModule').then((m) => ({ default: m.ChartModule }))),
  'history-table': lazy(() => import('./HistoryTableModule').then((m) => ({ default: m.HistoryTableModule }))),
  'quote-monitor': lazy(() => import('./QuoteMonitorModule').then((m) => ({ default: m.QuoteMonitorModule }))),
  focus: lazy(() => import('./FocusModule').then((m) => ({ default: m.FocusModule }))),
  watchlist: lazy(() => import('./WatchlistModule').then((m) => ({ default: m.WatchlistModule }))),
  news: lazy(() => import('./NewsModule').then((m) => ({ default: m.NewsModule }))),
  'top-news': lazy(() => import('./TopNewsModule').then((m) => ({ default: m.TopNewsModule }))),
  filings: lazy(() => import('./FilingsModule').then((m) => ({ default: m.FilingsModule }))),
  'filing-viewer': lazy(() => import('./FilingViewerModule').then((m) => ({ default: m.FilingViewerModule }))),
  'filing-search': lazy(() => import('./FilingSearchModule').then((m) => ({ default: m.FilingSearchModule }))),
  insiders: lazy(() => import('./InsiderModule').then((m) => ({ default: m.InsiderModule }))),
  financials: lazy(() => import('./FinancialsModule').then((m) => ({ default: m.FinancialsModule }))),
  estimates: lazy(() => import('./EstimatesModule').then((m) => ({ default: m.EstimatesModule }))),
  earnings: lazy(() => import('./EarningsModule').then((m) => ({ default: m.EarningsModule }))),
  'analyst-ratings': lazy(() => import('./AnalystRatingsModule').then((m) => ({ default: m.AnalystRatingsModule }))),
  holders: lazy(() => import('./HoldersModule').then((m) => ({ default: m.HoldersModule }))),
  'options-monitor': lazy(() => import('./OptionsMonitorModule').then((m) => ({ default: m.OptionsMonitorModule }))),
  'time-and-sales': lazy(() => import('./TimeAndSalesModule').then((m) => ({ default: m.TimeAndSalesModule }))),
  compare: lazy(() => import('./ComparisonModule').then((m) => ({ default: m.ComparisonModule }))),
  'world-indices': lazy(() => import('./WorldIndicesModule').then((m) => ({ default: m.WorldIndicesModule }))),
  ai: lazy(() => import('./AiModule').then((m) => ({ default: m.AiModule }))),
  settings: lazy(() => import('./SettingsModule').then((m) => ({ default: m.SettingsModule }))),
  notes: lazy(() => import('./NotesModule').then((m) => ({ default: m.NotesModule }))),
  alerts: lazy(() => import('./AlertsModule').then((m) => ({ default: m.AlertsModule }))),
  portfolio: lazy(() => import('./PortfolioModule').then((m) => ({ default: m.PortfolioModule }))),
  screener: lazy(() => import('./ScreenerModule').then((m) => ({ default: m.ScreenerModule }))),
  movers: lazy(() => import('./MoversModule').then((m) => ({ default: m.MoversModule }))),
  economics: lazy(() => import('./EconomicsModule').then((m) => ({ default: m.EconomicsModule }))),
  'option-pricer': lazy(() => import('./OptionPricerModule').then((m) => ({ default: m.OptionPricerModule }))),
  calculator: lazy(() => import('./CalculatorModule').then((m) => ({ default: m.CalculatorModule }))),
  'intraday-chart': lazy(() => import('./IntradayChartModule').then((m) => ({ default: m.IntradayChartModule }))),
  'layout-manager': lazy(() => import('./LayoutManagerModule').then((m) => ({ default: m.LayoutManagerModule }))),
  events: lazy(() => import('./EventsModule').then((m) => ({ default: m.EventsModule }))),
  account: lazy(() => import('./AccountModule').then((m) => ({ default: m.AccountModule }))),
  admin: lazy(() => import('./AdminModule').then((m) => ({ default: m.AdminModule }))),
  'order-book': lazy(() => import('./OrderBookModule').then((m) => ({ default: m.OrderBookModule }))),
  funding: lazy(() => import('./FundingModule').then((m) => ({ default: m.FundingModule }))),
  heatmap: lazy(() => import('./HeatmapModule').then((m) => ({ default: m.HeatmapModule }))),
  membership: lazy(() => import('./MembershipModule').then((m) => ({ default: m.MembershipModule }))),
  fx: lazy(() => import('./FxModule').then((m) => ({ default: m.FxModule }))),
  dex: lazy(() => import('./DexModule').then((m) => ({ default: m.DexModule }))),
  commodities: lazy(() => import('./CommoditiesModule').then((m) => ({ default: m.CommoditiesModule }))),
};
