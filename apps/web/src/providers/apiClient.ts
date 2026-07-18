import type {
  AIChatRequest,
  AIChatResponse,
  AlertRule,
  AnalystRating,
  AuditEvent,
  CorporateEvent,
  DataProvenance,
  DexPool,
  EconomicSeries,
  EconomicRelease,
  EstimateMetric,
  Filing,
  FilingSearchHit,
  InsiderTransaction,
  InstitutionalPortfolio,
  FundingRate,
  InstitutionalHolder,
  Note,
  NoteExport,
  FinancialStatement,
  HistoricalSeries,
  IndexMembership,
  Instrument,
  NewsItem,
  OptionChain,
  OrderBook,
  PluginInfo,
  Portfolio,
  PortfolioRisk,
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

export interface AuthUser {
  id: string;
  email: string;
  admin: boolean;
  createdAt: string;
  billing: { plan: 'trial' | 'pro' | 'none'; trialEndsAt: string; currentPeriodEnd?: string };
  /** Whether the account's email has been confirmed (nudge-only; nothing is gated on it). */
  emailVerified?: boolean;
}

export interface AdminMetrics {
  users: number;
  activeTrials: number;
  pro: number;
  expired: number;
  trialsEndingSoon: number;
  activeToday: number;
  activeWeek: number;
  priceMonthly: number;
  mrr: number;
  billingProvider: 'none' | 'mock' | 'stripe';
  signupsByDay: Array<{ date: string; count: number }>;
  latest: Array<{ email: string; createdAt: string; entitlement: 'trial' | 'pro' | 'expired'; admin: boolean }>;
  /** Seats used (accounts + outstanding invites) vs the configured limit (null = unlimited). */
  seats: { used: number; limit: number | null };
  /** Outstanding seat invites awaiting acceptance. */
  pendingInvites: Array<{ email: string; createdAt: string; expiresAt: string }>;
}

export interface BillingSummary {
  provider: 'mock' | 'stripe';
  plan: 'trial' | 'pro' | 'none';
  entitlement: 'trial' | 'pro' | 'expired';
  trialEndsAt: string;
  trialDaysLeft: number;
  currentPeriodEnd: string | null;
  /** Billing cadence when subscribed; null on trial/none. */
  interval: 'month' | 'year' | null;
  /** Whether an annual plan is offered on this deployment. */
  annualAvailable: boolean;
}

export interface HealthResponse {
  status: string;
  time: string;
  /** selfhost (no accounts) or hosted (multi-user SaaS). */
  appMode: 'selfhost' | 'hosted';
  /** Read-only public demo mode. */
  demo?: boolean;
  /** Active billing driver, or `none` when billing is disabled. */
  billing: 'none' | 'mock' | 'stripe';
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
      credentials: 'include',
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
      const res = await fetch(`${API_BASE_URL}/api/health`, { credentials: 'include' });
      if (!res.ok) return null;
      return (await res.json()) as HealthResponse;
    } catch {
      return null;
    }
  },

  authMe: () => fetchEnvelope<{ user: AuthUser }>('/api/auth/me'),
  authRegister: (email: string, password: string) =>
    fetchEnvelope<{ user: AuthUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  authLogin: (email: string, password: string) =>
    fetchEnvelope<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  authLogout: () => fetchEnvelope<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  authChangePassword: (currentPassword: string, newPassword: string) =>
    fetchEnvelope<{ ok: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  authDeleteAccount: (password: string) =>
    fetchEnvelope<{ ok: boolean }>('/api/auth/delete', { method: 'POST', body: JSON.stringify({ password }) }),
  exportAccount: () => fetchEnvelope<Record<string, unknown>>('/api/account/export'),

  getBilling: () => fetchEnvelope<BillingSummary>('/api/billing'),
  billingCheckout: (interval: 'month' | 'year' = 'month') =>
    fetchEnvelope<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ interval }) }),
  billingPortal: () => fetchEnvelope<{ url: string }>('/api/billing/portal', { method: 'POST' }),
  getAdminMetrics: () => fetchEnvelope<AdminMetrics>('/api/admin/metrics'),
  adminInvite: (email: string) =>
    fetchEnvelope<{ ok: boolean; email: string }>('/api/admin/invite', { method: 'POST', body: JSON.stringify({ email }) }),
  adminRevokeInvite: (email: string) =>
    fetchEnvelope<{ revoked: boolean }>('/api/admin/invite/revoke', { method: 'POST', body: JSON.stringify({ email }) }),

  getProviders: () => fetchEnvelope<ProviderDescriptor[]>('/api/providers'),
  getPlugins: () => fetchEnvelope<PluginInfo[]>('/api/plugins'),
  getAudit: (limit = 50) => fetchEnvelope<AuditEvent[]>(`/api/audit${qs({ limit: String(limit) })}`),

  search: (q: string) => fetchEnvelope<SearchResult[]>(`/api/search${qs({ q })}`),
  getInstrument: (id: string) => fetchEnvelope<Instrument>(`/api/instruments/${encodeURIComponent(id)}`),
  getQuote: (symbol: string) => fetchEnvelope<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),
  getQuotes: (symbols: string[]) => fetchEnvelope<QuoteBatch>(`/api/quotes${qs({ symbols: symbols.join(',') })}`),
  getHistory: (symbol: string, opts: { range?: string; interval?: string } = {}) =>
    fetchEnvelope<HistoricalSeries>(
      `/api/history/${encodeURIComponent(symbol)}${qs({ range: opts.range, interval: opts.interval })}`,
    ),
  getTrades: (symbol: string) => fetchEnvelope<TradePrint[]>(`/api/trades/${encodeURIComponent(symbol)}`),
  getOrderBook: (symbol: string, depth = 20) =>
    fetchEnvelope<OrderBook>(`/api/book/${encodeURIComponent(symbol)}${qs({ depth: String(depth) })}`),
  getMembership: (symbol: string) =>
    fetchEnvelope<IndexMembership>(`/api/membership/${encodeURIComponent(symbol)}`),
  getFunding: (symbols: string[] = []) =>
    fetchEnvelope<FundingRate[]>(`/api/funding${qs({ symbols: symbols.length > 0 ? symbols.join(',') : undefined })}`),
  getDexPools: (query: string, limit = 12) =>
    fetchEnvelope<DexPool[]>(`/api/dex${qs({ q: query, limit: String(limit) })}`),
  getIntraday: (symbol: string, opts: { interval?: string; range?: string } = {}) =>
    fetchEnvelope<HistoricalSeries>(
      `/api/intraday/${encodeURIComponent(symbol)}${qs({ interval: opts.interval, range: opts.range })}`,
    ),
  getEconomicSeries: (seriesId: string, opts: { start?: string; end?: string; limit?: number } = {}) =>
    fetchEnvelope<EconomicSeries>(
      `/api/economics/${encodeURIComponent(seriesId)}${qs({
        start: opts.start,
        end: opts.end,
        limit: opts.limit !== undefined ? String(opts.limit) : undefined,
      })}`,
    ),
  getEconomicReleases: (
    opts: { from?: string; to?: string; importance?: string; limit?: number } = {},
  ) =>
    fetchEnvelope<EconomicRelease[]>(
      `/api/econ-releases${qs({
        from: opts.from,
        to: opts.to,
        importance: opts.importance,
        limit: opts.limit !== undefined ? String(opts.limit) : undefined,
      })}`,
    ),
  getInstitutionalHoldings: (manager: string, limit?: number) =>
    fetchEnvelope<InstitutionalPortfolio>(
      `/api/institutional/${encodeURIComponent(manager)}${qs({
        limit: limit !== undefined ? String(limit) : undefined,
      })}`,
    ),
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
  searchFilings: (
    query: string,
    opts: { forms?: string[]; dateFrom?: string; dateTo?: string; limit?: number } = {},
  ) =>
    fetchEnvelope<FilingSearchHit[]>(
      `/api/filings-search${qs({
        q: query,
        forms: opts.forms && opts.forms.length > 0 ? opts.forms.join(',') : undefined,
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
        limit: opts.limit !== undefined ? String(opts.limit) : undefined,
      })}`,
    ),
  getInsiderTransactions: (symbol: string) =>
    fetchEnvelope<InsiderTransaction[]>(`/api/insiders/${encodeURIComponent(symbol)}`),
  getEvents: (opts: { symbol?: string; days?: number } = {}) =>
    fetchEnvelope<CorporateEvent[]>(
      `/api/events${qs({ symbol: opts.symbol, days: opts.days !== undefined ? String(opts.days) : undefined })}`,
    ),
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
  getPortfolioRisk: (id: string, benchmark?: string) =>
    fetchEnvelope<PortfolioRisk>(`/api/portfolios/${encodeURIComponent(id)}/risk${qs({ benchmark })}`),

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
        credentials: 'include',
        body: JSON.stringify(request),
      });
      if (!res.ok) return null;
      return (await res.json()) as AIChatResponse;
    } catch {
      return null;
    }
  },
};
