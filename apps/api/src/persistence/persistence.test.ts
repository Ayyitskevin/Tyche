import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  AlertRuleSchema,
  NoteSchema,
  PortfolioSchema,
  SavedScreenSchema,
  WatchlistSchema,
  WorkspaceSchema,
} from '@tyche/contracts';
import { FilePersistence } from './FilePersistence';
import { SqlitePersistence } from './SqlitePersistence';
import type { PersistenceStore } from './types';

const iso = '2026-06-29T00:00:00.000Z';
const workspace = (id: string) => WorkspaceSchema.parse({ id, name: id, panels: [], createdAt: iso, updatedAt: iso });
const watchlist = (id: string) =>
  WatchlistSchema.parse({ id, name: id, symbols: ['AAPL'], createdAt: iso, updatedAt: iso });
const note = (id: string, symbol: string | null) =>
  NoteSchema.parse({ id, symbol, title: 't', body: 'b', createdAt: iso, updatedAt: iso });
const portfolio = (id: string) =>
  PortfolioSchema.parse({ id, name: id, positions: [{ symbol: 'AAPL', quantity: 1 }], createdAt: iso, updatedAt: iso });
const alert = (id: string, over: Record<string, unknown> = {}) =>
  AlertRuleSchema.parse({ id, symbol: 'AAPL', operator: 'gt', threshold: 100, createdAt: iso, ...over });
const savedScreen = (id: string) =>
  SavedScreenSchema.parse({ id, name: id, query: { filters: [{ field: 'price', op: 'gt', value: 10 }], limit: 50 }, createdAt: iso, updatedAt: iso });

const backends: Array<{ name: string; make: () => PersistenceStore }> = [
  { name: 'FilePersistence', make: () => new FilePersistence(join(tmpdir(), `tyche-par-file-${randomUUID()}`)) },
  { name: 'SqlitePersistence', make: () => new SqlitePersistence(join(tmpdir(), `tyche-par-sqlite-${randomUUID()}.db`)) },
];

describe.each(backends)('PersistenceStore parity: $name', ({ make }) => {
  let store: PersistenceStore;
  beforeAll(async () => {
    store = make();
    await store.init();
  });

  it('seeds a single default watchlist', async () => {
    const ids = (await store.listWatchlists()).map((w) => w.id);
    expect(ids).toContain('wl_default');
    expect(ids.filter((id) => id === 'wl_default')).toHaveLength(1);
  });

  it('round-trips and deletes a workspace (get by id)', async () => {
    await store.saveWorkspace(workspace('ws1'));
    expect((await store.getWorkspace('ws1'))?.id).toBe('ws1');
    expect((await store.listWorkspaces()).map((w) => w.id)).toContain('ws1');
    expect(await store.deleteWorkspace('ws1')).toBe(true);
    expect(await store.getWorkspace('ws1')).toBeUndefined();
    expect(await store.deleteWorkspace('ws1')).toBe(false); // already gone
  });

  it('upserts a watchlist by id (no duplicate)', async () => {
    await store.saveWatchlist(watchlist('wl_x'));
    await store.saveWatchlist({ ...watchlist('wl_x'), name: 'renamed' });
    const matches = (await store.listWatchlists()).filter((w) => w.id === 'wl_x');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.name).toBe('renamed');
  });

  it('round-trips notes with a nullable symbol', async () => {
    await store.saveNote(note('n1', 'AAPL'));
    await store.saveNote(note('n2', null));
    const ids = (await store.listNotes()).map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['n1', 'n2']));
    expect((await store.listNotes()).find((n) => n.id === 'n2')!.symbol).toBeNull();
    expect(await store.deleteNote('n1')).toBe(true);
  });

  it('round-trips and deletes a portfolio (get by id)', async () => {
    await store.savePortfolio(portfolio('pf1'));
    expect((await store.getPortfolio('pf1'))?.positions[0]!.symbol).toBe('AAPL');
    expect(await store.deletePortfolio('pf1')).toBe(true);
  });

  it('round-trips a saved screen with its query', async () => {
    await store.saveSavedScreen(savedScreen('sc1'));
    const restored = (await store.listSavedScreens()).find((s) => s.id === 'sc1');
    expect(restored?.query.filters[0]).toEqual({ field: 'price', op: 'gt', value: 10 });
    expect(await store.deleteSavedScreen('sc1')).toBe(true);
  });

  it('fires a oneShot alert exactly once (compare-and-set)', async () => {
    await store.saveAlert(alert('a1', { oneShot: true }));
    expect(await store.markAlertTriggered('a1', iso, true)).toBe(true);
    expect(await store.markAlertTriggered('a1', iso, true)).toBe(false); // now inactive
    const stored = (await store.listAlerts()).find((a) => a.id === 'a1')!;
    expect(stored.active).toBe(false);
    expect(stored.lastTriggeredAt).toBe(iso);
    expect(await store.markAlertTriggered('missing', iso, true)).toBe(false);
  });

  it('re-fires a non-oneShot alert and keeps it active', async () => {
    await store.saveAlert(alert('a2', { oneShot: false }));
    expect(await store.markAlertTriggered('a2', '2026-06-29T00:00:01.000Z', false)).toBe(true);
    expect(await store.markAlertTriggered('a2', '2026-06-29T00:00:02.000Z', false)).toBe(true);
    const stored = (await store.listAlerts()).find((a) => a.id === 'a2')!;
    expect(stored.active).toBe(true);
    expect(stored.lastTriggeredAt).toBe('2026-06-29T00:00:02.000Z');
  });

  it('round-trips preferences', async () => {
    const prefs = await store.getPreferences();
    await store.savePreferences({ ...prefs, theme: 'midnight' });
    expect((await store.getPreferences()).theme).toBe('midnight');
  });

  it('snapshot reflects the mutations and carries the version', async () => {
    const snap = await store.snapshot();
    expect(snap.version).toBeGreaterThanOrEqual(2);
    expect(snap.watchlists.map((w) => w.id)).toContain('wl_default');
    expect(snap.notes.map((n) => n.id)).toContain('n2');
  });
});
