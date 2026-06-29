import type {
  AIChatRequest,
  AIChatResponse,
  AlertRule,
  AnalystRating,
  DataProvenance,
  EstimateMetric,
  Filing,
  InstitutionalHolder,
  Note,
  NoteExport,
  FinancialStatement,
  HistoricalSeries,
  Instrument,
  NewsItem,
  OptionChain,
  PluginInfo,
  Portfolio,
  ProviderCapabilities,
  ProviderDescriptor,
  Quote,
  QuoteBatch,
  SavedScreen,
  ScreenQuery,
  ScreenRow,
  SearchResult,
  TradePrint,
  UserPreferences,
  Watchlist,
  Workspace,
} from '@tyche/contracts';
import { API_BASE_URL } from '../constants';

export interface ApiError {
  kind: string;
  message: string;
  capability?: string;
  detail?: unknown;
}

export type EnvelopeResult<T> =
  | { ok: true; data: T; provenance: DataProvenance | null }
  // Even a gap/error response can carry provenance naming the would-be provider.
  | { ok: false; error: ApiError; provenance: DataProvenance | null };

export interface HealthResponse {
  status: string;
  time: string;
  mode: string;
  providers: Array<{ name: string; mode: string; requiresConfiguration: boolean }>;
  capabilities: ProviderCapabilities;
}

function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

async function fetchEnvelope<T>(path: string, init?: RequestInit): Promise<EnvelopeResult<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const json = (await res.json().catch(() => null)) as
      | { data?: T; provenance?: DataProvenance | null; error?: ApiError }
      | null;
    if (json && typeof json === 'object' && json.error) {
      return { ok: false, error: json.error, provenance: json.provenance ?? null };
    }
    if (!res.ok) {
      return { ok: false, error: { kind: 'http_error', message: `HTTP ${res.status}` }, provenance: null };
    }
    return { ok: true, data: (json?.data as T), provenance: json?.provenance ?? null };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'network_error', message: err instanceof Error ? err.message : String(err) },
      provenance: null,
    };
  }
}

export const api = {
  async getHealth(): Promise<HealthResponse | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/health`);
      if (!res.ok) return null;
      return (await res.json()) as HealthResponse;
    } catch {
      return null;
    }
  },

  getProviders: () => fetchEnvelope<ProviderDescriptor[]>('/api/providers'),
  getPlugins: () => fetchEnvelope<PluginInfo[]>('/api/plugins'),

  search: (q: string) => fetchEnvelope<SearchResult[]>(`/api/search${qs({ q })}`),
  getInstrument: (id: string) => fetchEnvelope<Instrument>(`/api/instruments/${encodeURIComponent(id)}`),
  getQuote: (symbol: string) => fetchEnvelope<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),
  getQuotes: (symbols: string[]) => fetchEnvelope<QuoteBatch>(`/api/quotes${qs({ symbols: symbols.join(',') })}`),
  getHistory: (symbol: string, opts: { range?: string; interval?: string } = {}) =>
    fetchEnvelope<HistoricalSeries>(
      `/api/history/${encodeURIComponent(symbol)}${qs({ range: opts.range, interval: opts.interval })}`,
    ),
  getTrades: (symbol: string) => fetchEnvelope<TradePrint[]>(`/api/trades/${encodeURIComponent(symbol)}`),
  getNews: (
    opts: {
      symbol?: string;
      keyword?: string;
      source?: string;
      since?: string;
      until?: string;
      watchlistId?: string;
      limit?: number;
    } = {},
  ) =>
    fetchEnvelope<NewsItem[]>(
      `/api/news${qs({
        symbol: opts.symbol,
        keyword: opts.keyword,
        source: opts.source,
        since: opts.since,
        until: opts.until,
        watchlistId: opts.watchlistId,
        limit: opts.limit !== undefined ? String(opts.limit) : undefined,
      })}`,
    ),
  getFilings: (symbol: string) => fetchEnvelope<Filing[]>(`/api/filings/${encodeURIComponent(symbol)}`),
  getEstimates: (symbol: string) => fetchEnvelope<EstimateMetric[]>(`/api/estimates/${encodeURIComponent(symbol)}`),
  getRatings: (symbol: string) => fetchEnvelope<AnalystRating[]>(`/api/ratings/${encodeURIComponent(symbol)}`),
  getOwnership: (symbol: string) =>
    fetchEnvelope<InstitutionalHolder[]>(`/api/ownership/${encodeURIComponent(symbol)}`),
  getFinancials: (symbol: string, opts: { type?: string; period?: string } = {}) =>
    fetchEnvelope<FinancialStatement[]>(
      `/api/financials/${encodeURIComponent(symbol)}${qs({ type: opts.type, period: opts.period })}`,
    ),
  getOptions: (symbol: string, opts: { expiry?: string } = {}) =>
    fetchEnvelope<OptionChain>(`/api/options/${encodeURIComponent(symbol)}${qs({ expiry: opts.expiry })}`),
  screen: (query: ScreenQuery) =>
    fetchEnvelope<ScreenRow[]>('/api/screen', { method: 'POST', body: JSON.stringify(query) }),
  getSavedScreens: () => fetchEnvelope<SavedScreen[]>('/api/screens'),
  saveScreen: (screen: { name: string; query: ScreenQuery }) =>
    fetchEnvelope<SavedScreen>('/api/screens', { method: 'POST', body: JSON.stringify(screen) }),
  deleteScreen: (id: string) =>
    fetchEnvelope<{ removed: boolean }>(`/api/screens/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getWatchlists: () => fetchEnvelope<Watchlist[]>('/api/watchlists'),
  saveWatchlist: (watchlist: Partial<Watchlist>) =>
    fetchEnvelope<Watchlist>('/api/watchlists', { method: 'POST', body: JSON.stringify(watchlist) }),
  deleteWatchlist: (id: string) =>
    fetchEnvelope<{ removed: boolean }>(`/api/watchlists/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getWorkspaces: () => fetchEnvelope<Workspace[]>('/api/workspaces'),
  getWorkspace: (id: string) => fetchEnvelope<Workspace>(`/api/workspaces/${encodeURIComponent(id)}`),
  saveWorkspace: (workspace: Workspace) =>
    fetchEnvelope<Workspace>('/api/workspaces', { method: 'POST', body: JSON.stringify(workspace) }),
  deleteWorkspace: (id: string) =>
    fetchEnvelope<{ removed: boolean }>(`/api/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getPreferences: () => fetchEnvelope<UserPreferences>('/api/preferences'),
  savePreferences: (prefs: Partial<UserPreferences>) =>
    fetchEnvelope<UserPreferences>('/api/preferences', { method: 'POST', body: JSON.stringify(prefs) }),

  getPortfolios: () => fetchEnvelope<Portfolio[]>('/api/portfolios'),
  savePortfolio: (portfolio: Partial<Portfolio>) =>
    fetchEnvelope<Portfolio>('/api/portfolios', { method: 'POST', body: JSON.stringify(portfolio) }),
  deletePortfolio: (id: string) =>
    fetchEnvelope<{ removed: boolean }>(`/api/portfolios/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getAlerts: () => fetchEnvelope<AlertRule[]>('/api/alerts'),
  saveAlert: (rule: Partial<AlertRule>) =>
    fetchEnvelope<AlertRule>('/api/alerts', { method: 'POST', body: JSON.stringify(rule) }),
  deleteAlert: (id: string) =>
    fetchEnvelope<{ removed: boolean }>(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getNotes: () => fetchEnvelope<Note[]>('/api/notes'),
  saveNote: (note: Partial<Note>) =>
    fetchEnvelope<Note>('/api/notes', { method: 'POST', body: JSON.stringify(note) }),
  deleteNote: (id: string) =>
    fetchEnvelope<{ removed: boolean }>(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  exportNotes: () => fetchEnvelope<NoteExport>('/api/notes/export'),
  importNotes: (payload: NoteExport) =>
    fetchEnvelope<{ imported: number }>('/api/notes/import', { method: 'POST', body: JSON.stringify(payload) }),

  async aiChat(request: AIChatRequest): Promise<AIChatResponse | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) return null;
      return (await res.json()) as AIChatResponse;
    } catch {
      return null;
    }
  },
};
