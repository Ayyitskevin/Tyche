import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  AlertRuleSchema,
  NoteExportSchema,
  NoteSchema,
  PortfolioSchema,
  SavedScreenSchema,
  UserPreferencesSchema,
  WatchlistSchema,
  WorkspaceSchema,
} from '@tyche/contracts';
import type { Candle, DataProvenance, Portfolio, PortfolioRisk, PortfolioRiskStats } from '@tyche/contracts';
import { computePortfolioRisk, type HoldingCandles } from '@tyche/analytics';
import type { AppContext } from '../context';
import { currentUser } from '../saas/requestContext';
import { gapProvenance, localProvenance } from './helpers';

function nowIso(): string {
  return new Date().toISOString();
}

export function registerUserRoutes(app: FastifyInstance, ctx: AppContext): void {
  // --- Full account export ---------------------------------------------------
  // One JSON with everything the user owns — the "cancel anytime, take your
  // data" promise, kept. Works in self-host too (exports the local store); in
  // hosted mode ctx.persistence is already scoped to the signed-in account.
  app.get('/api/account/export', async () => {
    const user = currentUser();
    const [preferences, workspaces, watchlists, notes, portfolios, screens, alerts] = await Promise.all([
      ctx.persistence.getPreferences(),
      ctx.persistence.listWorkspaces(),
      ctx.persistence.listWatchlists(),
      ctx.persistence.listNotes(),
      ctx.persistence.listPortfolios(),
      ctx.persistence.listSavedScreens(),
      ctx.persistence.listAlerts(),
    ]);
    ctx.audit.record({ at: nowIso(), actor: user?.email ?? 'local', action: 'account.export', outcome: 'allow' });
    return {
      data: {
        exportedAt: nowIso(),
        account: user ? { email: user.email, createdAt: user.createdAt } : null,
        preferences,
        workspaces,
        watchlists,
        notes,
        portfolios,
        screens,
        alerts,
      },
      provenance: localProvenance('account'),
    };
  });

  // --- Preferences ---------------------------------------------------------
  app.get('/api/preferences', async () => ({
    data: await ctx.persistence.getPreferences(),
    provenance: localProvenance('preferences'),
  }));

  app.post('/api/preferences', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const parsed = UserPreferencesSchema.safeParse({ ...body, updatedAt: nowIso() });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid preferences', detail: parsed.error.issues } });
      return;
    }
    const saved = await ctx.persistence.savePreferences(parsed.data);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'preferences.save', outcome: 'allow' });
    reply.send({ data: saved, provenance: localProvenance('preferences') });
  });

  // --- Watchlists ----------------------------------------------------------
  app.get('/api/watchlists', async () => ({
    data: await ctx.persistence.listWatchlists(),
    provenance: localProvenance('watchlists'),
  }));

  app.post('/api/watchlists', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = nowIso();
    const parsed = WatchlistSchema.safeParse({
      ...body,
      id: body.id ?? `wl_${randomUUID()}`,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid watchlist', detail: parsed.error.issues } });
      return;
    }
    const saved = await ctx.persistence.saveWatchlist(parsed.data);
    ctx.audit.record({ at: now, actor: 'local', action: 'watchlist.save', resource: saved.id, outcome: 'allow' });
    reply.send({ data: saved, provenance: localProvenance('watchlists') });
  });

  app.delete('/api/watchlists/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await ctx.persistence.deleteWatchlist(id);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'watchlist.delete', resource: id, outcome: 'allow', detail: { removed } });
    reply.send({ data: { removed }, provenance: localProvenance('watchlists') });
  });

  // --- Alerts --------------------------------------------------------------
  app.get('/api/alerts', async () => ({
    data: await ctx.persistence.listAlerts(),
    provenance: localProvenance('alerts'),
  }));

  app.post('/api/alerts', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = nowIso();
    const parsed = AlertRuleSchema.safeParse({
      ...body,
      // Normalize the symbol so a lowercase rule still matches uppercase quotes.
      symbol: typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : body.symbol,
      id: body.id ?? `alert_${randomUUID()}`,
      createdAt: body.createdAt ?? now,
    });
    if (parsed.success && parsed.data.symbol.length === 0) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Alert symbol is required' } });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid alert rule', detail: parsed.error.issues } });
      return;
    }
    const saved = await ctx.persistence.saveAlert(parsed.data);
    ctx.audit.record({ at: now, actor: 'local', action: 'alert.save', resource: saved.id, outcome: 'allow' });
    reply.send({ data: saved, provenance: localProvenance('alerts') });
  });

  app.delete('/api/alerts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await ctx.persistence.deleteAlert(id);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'alert.delete', resource: id, outcome: 'allow', detail: { removed } });
    reply.send({ data: { removed }, provenance: localProvenance('alerts') });
  });

  // --- Portfolios ----------------------------------------------------------
  // Persist only durable inputs. Live marks (price, market value, P&L) are
  // recomputed client-side from the quote stream and never stored — so a saved
  // portfolio can't carry stale valuations. Tyche places no orders, period.
  function stripMarks(portfolio: Portfolio): Portfolio {
    return {
      ...portfolio,
      positions: portfolio.positions.map((p) => ({
        symbol: p.symbol,
        ...(p.assetClass !== undefined ? { assetClass: p.assetClass } : {}),
        quantity: p.quantity,
        ...(p.averageCost !== undefined ? { averageCost: p.averageCost } : {}),
        ...(p.costBasis !== undefined ? { costBasis: p.costBasis } : {}),
        ...(p.currency !== undefined ? { currency: p.currency } : {}),
        ...(p.openedAt !== undefined ? { openedAt: p.openedAt } : {}),
      })),
    };
  }

  app.get('/api/portfolios', async () => ({
    data: await ctx.persistence.listPortfolios(),
    provenance: localProvenance('portfolios'),
  }));

  app.get('/api/portfolios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const portfolio = await ctx.persistence.getPortfolio(id);
    if (!portfolio) {
      reply.code(404).send({ error: { kind: 'not_found', message: `Portfolio ${id} not found` } });
      return;
    }
    reply.send({ data: portfolio, provenance: localProvenance('portfolios') });
  });

  // Derived risk analytics for a saved portfolio: fetch each holding's daily
  // history + a benchmark (default SPY), align by date, and compute the risk
  // bundle. Pure analytics over market data Tyche already serves — no new data,
  // no advice, no execution.
  const RISK_PERIODS_PER_YEAR = 252;
  async function fetchDailyHistory(sym: string): Promise<{ candles: Candle[]; provenance: DataProvenance | null }> {
    const provider = ctx.registry.forCapability('historicalPrices', sym);
    if (!provider) return { candles: [], provenance: null };
    try {
      const env = await provider.getHistory(sym, { range: '1y', interval: '1d' });
      return { candles: env.data.candles, provenance: env.provenance };
    } catch {
      return { candles: [], provenance: null };
    }
  }
  const fin = (v: number): number => (Number.isFinite(v) ? v : 0);
  /** Preserve null for undefined ratios — never coerce missing skill ratios to 0. */
  const finOrNull = (v: number | null): number | null => (v === null ? null : fin(v));
  const sanitizeStats = (s: {
    annualizedReturn: number;
    annualizedVolatility: number;
    sharpe: number | null;
    sortino: number | null;
    calmar: number | null;
    maxDrawdown: number;
    valueAtRisk: number;
    beta: number | null;
    trackingError: number | null;
    informationRatio: number | null;
  }): PortfolioRiskStats => ({
    annualizedReturn: fin(s.annualizedReturn),
    annualizedVolatility: fin(s.annualizedVolatility),
    sharpe: finOrNull(s.sharpe),
    sortino: finOrNull(s.sortino),
    calmar: finOrNull(s.calmar),
    maxDrawdown: fin(s.maxDrawdown),
    valueAtRisk: fin(s.valueAtRisk),
    beta: finOrNull(s.beta),
    trackingError: finOrNull(s.trackingError),
    informationRatio: finOrNull(s.informationRatio),
  });

  app.get('/api/portfolios/:id/risk', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { benchmark } = request.query as { benchmark?: string };
    const portfolio = await ctx.persistence.getPortfolio(id);
    if (!portfolio) {
      reply.code(404).send({ error: { kind: 'not_found', message: `Portfolio ${id} not found` } });
      return;
    }
    const benchSym = (benchmark?.trim() || 'SPY').toUpperCase();

    // One history fetch per unique symbol; a symbol held in two lots sums quantity.
    const bySymbol = new Map<string, number>();
    for (const p of portfolio.positions) {
      const s = p.symbol.trim().toUpperCase();
      bySymbol.set(s, (bySymbol.get(s) ?? 0) + p.quantity);
    }
    const symbols = [...bySymbol.keys()];
    const [bench, ...positionHist] = await Promise.all([
      fetchDailyHistory(benchSym),
      ...symbols.map((s) => fetchDailyHistory(s)),
    ]);

    const holdings: HoldingCandles[] = symbols.map((s, i) => ({
      symbol: s,
      quantity: bySymbol.get(s)!,
      candles: positionHist[i]!.candles,
    }));
    const result = computePortfolioRisk(holdings, bench.candles.length >= 2 ? bench.candles : null, {
      periodsPerYear: RISK_PERIODS_PER_YEAR,
    });

    const data: PortfolioRisk = {
      portfolioId: portfolio.id,
      benchmark: benchSym,
      periodsPerYear: RISK_PERIODS_PER_YEAR,
      observations: result.observations,
      coverage: result.coverage,
      stats: sanitizeStats(result.stats),
      holdings: result.holdings.map((h) => ({ symbol: h.symbol, weight: fin(h.weight), beta: h.beta === null ? null : fin(h.beta) })),
    };
    const provenance =
      bench.provenance ?? positionHist.find((p) => p.provenance)?.provenance ?? gapProvenance(ctx.registry, 'historicalPrices');
    reply.send({ data, provenance });
  });

  app.post('/api/portfolios', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = nowIso();
    const parsed = PortfolioSchema.safeParse({
      ...body,
      id: body.id ?? `pf_${randomUUID()}`,
      name: body.name ?? 'My Portfolio',
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid portfolio', detail: parsed.error.issues } });
      return;
    }
    const saved = await ctx.persistence.savePortfolio(stripMarks(parsed.data));
    ctx.audit.record({ at: now, actor: 'local', action: 'portfolio.save', resource: saved.id, outcome: 'allow' });
    reply.send({ data: saved, provenance: localProvenance('portfolios') });
  });

  app.delete('/api/portfolios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await ctx.persistence.deletePortfolio(id);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'portfolio.delete', resource: id, outcome: 'allow', detail: { removed } });
    reply.send({ data: { removed }, provenance: localProvenance('portfolios') });
  });

  // --- Saved screens -------------------------------------------------------
  app.get('/api/screens', async () => ({
    data: await ctx.persistence.listSavedScreens(),
    provenance: localProvenance('savedScreens'),
  }));

  app.post('/api/screens', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = nowIso();
    const parsed = SavedScreenSchema.safeParse({
      ...body,
      id: body.id ?? `screen_${randomUUID()}`,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid saved screen', detail: parsed.error.issues } });
      return;
    }
    const saved = await ctx.persistence.saveSavedScreen(parsed.data);
    ctx.audit.record({ at: now, actor: 'local', action: 'screen.save', resource: saved.id, outcome: 'allow' });
    reply.send({ data: saved, provenance: localProvenance('savedScreens') });
  });

  app.delete('/api/screens/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await ctx.persistence.deleteSavedScreen(id);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'screen.delete', resource: id, outcome: 'allow', detail: { removed } });
    reply.send({ data: { removed }, provenance: localProvenance('savedScreens') });
  });

  // --- Workspaces ----------------------------------------------------------
  app.get('/api/workspaces', async () => ({
    data: await ctx.persistence.listWorkspaces(),
    provenance: localProvenance('workspaces'),
  }));

  app.get('/api/workspaces/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = await ctx.persistence.getWorkspace(id);
    if (!workspace) {
      reply.code(404).send({ error: { kind: 'not_found', message: `Workspace ${id} not found` } });
      return;
    }
    reply.send({ data: workspace, provenance: localProvenance('workspaces') });
  });

  app.post('/api/workspaces', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = nowIso();
    const parsed = WorkspaceSchema.safeParse({
      ...body,
      id: body.id ?? `ws_${randomUUID()}`,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid workspace', detail: parsed.error.issues } });
      return;
    }
    const saved = await ctx.persistence.saveWorkspace(parsed.data);
    ctx.audit.record({ at: now, actor: 'local', action: 'workspace.save', resource: saved.id, outcome: 'allow' });
    reply.send({ data: saved, provenance: localProvenance('workspaces') });
  });

  app.delete('/api/workspaces/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await ctx.persistence.deleteWorkspace(id);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'workspace.delete', resource: id, outcome: 'allow', detail: { removed } });
    reply.send({ data: { removed }, provenance: localProvenance('workspaces') });
  });

  // --- Notes (bonus persistence surface) -----------------------------------
  app.get('/api/notes', async () => ({
    data: await ctx.persistence.listNotes(),
    provenance: localProvenance('notes'),
  }));

  app.get('/api/notes/export', async () => ({
    data: { version: 1, exportedAt: nowIso(), notes: await ctx.persistence.listNotes() },
    provenance: localProvenance('notes'),
  }));

  app.post('/api/notes', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = nowIso();
    const parsed = NoteSchema.safeParse({
      ...body,
      id: body.id ?? `note_${randomUUID()}`,
      title: body.title ?? 'Untitled note',
      body: body.body ?? '',
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid note', detail: parsed.error.issues } });
      return;
    }
    const saved = await ctx.persistence.saveNote(parsed.data);
    ctx.audit.record({ at: now, actor: 'local', action: 'note.save', resource: saved.id, outcome: 'allow' });
    reply.send({ data: saved, provenance: localProvenance('notes') });
  });

  app.post('/api/notes/import', async (request, reply) => {
    const parsed = NoteExportSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid notes export', detail: parsed.error.issues } });
      return;
    }
    for (const note of parsed.data.notes) await ctx.persistence.saveNote(note);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'notes.import', outcome: 'allow' });
    reply.send({ data: { imported: parsed.data.notes.length }, provenance: localProvenance('notes') });
  });

  app.delete('/api/notes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await ctx.persistence.deleteNote(id);
    ctx.audit.record({ at: nowIso(), actor: 'local', action: 'note.delete', resource: id, outcome: 'allow', detail: { removed } });
    reply.send({ data: { removed }, provenance: localProvenance('notes') });
  });
}
