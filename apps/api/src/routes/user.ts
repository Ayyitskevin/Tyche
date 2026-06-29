import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AlertRuleSchema, UserPreferencesSchema, WatchlistSchema, WorkspaceSchema } from '@tyche/contracts';
import type { AppContext } from '../context';
import { localProvenance } from './helpers';
import type { Note } from '../persistence/types';

function nowIso(): string {
  return new Date().toISOString();
}

export function registerUserRoutes(app: FastifyInstance, ctx: AppContext): void {
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
      id: body.id ?? `alert_${randomUUID()}`,
      createdAt: body.createdAt ?? now,
    });
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
    reply.send({ data: { removed }, provenance: localProvenance('alerts') });
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
    reply.send({ data: { removed }, provenance: localProvenance('workspaces') });
  });

  // --- Notes (bonus persistence surface) -----------------------------------
  app.get('/api/notes', async () => ({
    data: await ctx.persistence.listNotes(),
    provenance: localProvenance('notes'),
  }));

  app.post('/api/notes', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<Note>;
    const now = nowIso();
    const note: Note = {
      id: body.id ?? `note_${randomUUID()}`,
      symbol: body.symbol ?? null,
      title: body.title ?? 'Untitled note',
      body: body.body ?? '',
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    };
    const saved = await ctx.persistence.saveNote(note);
    reply.send({ data: saved, provenance: localProvenance('notes') });
  });

  app.delete('/api/notes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await ctx.persistence.deleteNote(id);
    reply.send({ data: { removed }, provenance: localProvenance('notes') });
  });
}
