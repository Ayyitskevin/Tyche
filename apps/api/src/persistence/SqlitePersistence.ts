import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  UserPreferencesSchema,
  type AlertRule,
  type Portfolio,
  type UserPreferences,
  type Watchlist,
  type Workspace,
} from '@tyche/contracts';
import { PERSISTENCE_VERSION, type Note, type PersistedState, type PersistenceStore } from './types';
import { defaultState } from './defaults';

type JsonTable = 'workspaces' | 'watchlists' | 'notes' | 'portfolios' | 'alerts';

/**
 * SQLite persistence using Node's built-in `node:sqlite` (no native dependency
 * to compile). Each contract object is stored as a validated JSON column keyed
 * by id, mirroring {@link FilePersistence}'s collections so the two adapters are
 * behaviourally identical (one shared `defaultState()` seed). The module is
 * imported lazily in `init()` so a runtime without `node:sqlite` can fall back
 * to the file store rather than failing to boot.
 */
export class SqlitePersistence implements PersistenceStore {
  private db: DatabaseSync | null = null;

  constructor(private readonly path: string) {}

  private get database(): DatabaseSync {
    if (!this.db) throw new Error('SqlitePersistence used before init()');
    return this.db;
  }

  async init(): Promise<void> {
    if (this.path !== ':memory:') await mkdir(dirname(this.path), { recursive: true }).catch(() => {});
    // require() rather than dynamic import: avoids bundler transforms of the
    // `node:sqlite` builtin while still loading lazily (so a runtime without it
    // can be caught and fall back to the file store).
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(this.path);
    // If schema setup throws (e.g. the path can't be opened), close the handle
    // before bubbling up so the caller's fallback doesn't leak an open db.
    try {
      db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS watchlists (id TEXT PRIMARY KEY, json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, symbol TEXT, json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS portfolios (id TEXT PRIMARY KEY, json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, json TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_notes_symbol ON notes (symbol);
      `);
      this.db = db;
      // Seed defaults only for a brand-new store (no version row) — idempotent.
      const versionRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('version') as
        | { value: string }
        | undefined;
      if (!versionRow) this.seed(defaultState());
    } catch (err) {
      db.close();
      this.db = null;
      throw err;
    }
  }

  private seed(state: PersistedState): void {
    const db = this.database;
    db.exec('BEGIN');
    try {
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('version', String(state.version));
      db.prepare('INSERT OR REPLACE INTO preferences (id, json) VALUES (1, ?)').run(JSON.stringify(state.preferences));
      const wl = db.prepare('INSERT OR REPLACE INTO watchlists (id, json) VALUES (?, ?)');
      for (const w of state.watchlists) wl.run(w.id, JSON.stringify(w));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // --- JSON-column helpers -------------------------------------------------
  private allJson<T>(table: JsonTable): T[] {
    return (this.database.prepare(`SELECT json FROM ${table}`).all() as Array<{ json: string }>).map(
      (r) => JSON.parse(r.json) as T,
    );
  }

  private getJson<T>(table: JsonTable, id: string): T | undefined {
    const row = this.database.prepare(`SELECT json FROM ${table} WHERE id = ?`).get(id) as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as T) : undefined;
  }

  private del(table: JsonTable, id: string): boolean {
    const info = this.database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  // --- Preferences ---------------------------------------------------------
  getPreferences(): Promise<UserPreferences> {
    const row = this.database.prepare('SELECT json FROM preferences WHERE id = 1').get() as
      | { json: string }
      | undefined;
    return Promise.resolve(row ? UserPreferencesSchema.parse(JSON.parse(row.json)) : defaultState().preferences);
  }

  savePreferences(preferences: UserPreferences): Promise<UserPreferences> {
    this.database
      .prepare('INSERT OR REPLACE INTO preferences (id, json) VALUES (1, ?)')
      .run(JSON.stringify(preferences));
    return Promise.resolve(preferences);
  }

  // --- Workspaces ----------------------------------------------------------
  listWorkspaces(): Promise<Workspace[]> {
    return Promise.resolve(this.allJson<Workspace>('workspaces'));
  }

  getWorkspace(id: string): Promise<Workspace | undefined> {
    return Promise.resolve(this.getJson<Workspace>('workspaces', id));
  }

  saveWorkspace(workspace: Workspace): Promise<Workspace> {
    this.database
      .prepare('INSERT OR REPLACE INTO workspaces (id, json) VALUES (?, ?)')
      .run(workspace.id, JSON.stringify(workspace));
    return Promise.resolve(workspace);
  }

  deleteWorkspace(id: string): Promise<boolean> {
    return Promise.resolve(this.del('workspaces', id));
  }

  // --- Watchlists ----------------------------------------------------------
  listWatchlists(): Promise<Watchlist[]> {
    return Promise.resolve(this.allJson<Watchlist>('watchlists'));
  }

  saveWatchlist(watchlist: Watchlist): Promise<Watchlist> {
    this.database
      .prepare('INSERT OR REPLACE INTO watchlists (id, json) VALUES (?, ?)')
      .run(watchlist.id, JSON.stringify(watchlist));
    return Promise.resolve(watchlist);
  }

  deleteWatchlist(id: string): Promise<boolean> {
    return Promise.resolve(this.del('watchlists', id));
  }

  // --- Notes ---------------------------------------------------------------
  listNotes(): Promise<Note[]> {
    return Promise.resolve(this.allJson<Note>('notes'));
  }

  saveNote(note: Note): Promise<Note> {
    this.database
      .prepare('INSERT OR REPLACE INTO notes (id, symbol, json) VALUES (?, ?, ?)')
      .run(note.id, note.symbol, JSON.stringify(note));
    return Promise.resolve(note);
  }

  deleteNote(id: string): Promise<boolean> {
    return Promise.resolve(this.del('notes', id));
  }

  // --- Portfolios ----------------------------------------------------------
  listPortfolios(): Promise<Portfolio[]> {
    return Promise.resolve(this.allJson<Portfolio>('portfolios'));
  }

  getPortfolio(id: string): Promise<Portfolio | undefined> {
    return Promise.resolve(this.getJson<Portfolio>('portfolios', id));
  }

  savePortfolio(portfolio: Portfolio): Promise<Portfolio> {
    this.database
      .prepare('INSERT OR REPLACE INTO portfolios (id, json) VALUES (?, ?)')
      .run(portfolio.id, JSON.stringify(portfolio));
    return Promise.resolve(portfolio);
  }

  deletePortfolio(id: string): Promise<boolean> {
    return Promise.resolve(this.del('portfolios', id));
  }

  // --- Alerts --------------------------------------------------------------
  listAlerts(): Promise<AlertRule[]> {
    return Promise.resolve(this.allJson<AlertRule>('alerts'));
  }

  saveAlert(rule: AlertRule): Promise<AlertRule> {
    this.database
      .prepare('INSERT OR REPLACE INTO alerts (id, json) VALUES (?, ?)')
      .run(rule.id, JSON.stringify(rule));
    return Promise.resolve(rule);
  }

  deleteAlert(id: string): Promise<boolean> {
    return Promise.resolve(this.del('alerts', id));
  }

  markAlertTriggered(id: string, firedAt: string, deactivate: boolean): Promise<boolean> {
    // node:sqlite is synchronous and single-threaded, so this read-check-write is
    // an atomic compare-and-set: a oneShot rule fires exactly once.
    const rule = this.getJson<AlertRule>('alerts', id);
    if (!rule || !rule.active) return Promise.resolve(false);
    rule.lastTriggeredAt = firedAt;
    if (deactivate) rule.active = false;
    this.database.prepare('UPDATE alerts SET json = ? WHERE id = ?').run(JSON.stringify(rule), id);
    return Promise.resolve(true);
  }

  // --- Snapshot ------------------------------------------------------------
  snapshot(): Promise<PersistedState> {
    const db = this.database;
    const versionRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('version') as
      | { value: string }
      | undefined;
    const prefRow = db.prepare('SELECT json FROM preferences WHERE id = 1').get() as { json: string } | undefined;
    return Promise.resolve({
      version: versionRow ? Number(versionRow.value) : PERSISTENCE_VERSION,
      preferences: prefRow ? UserPreferencesSchema.parse(JSON.parse(prefRow.json)) : defaultState().preferences,
      workspaces: this.allJson<Workspace>('workspaces'),
      watchlists: this.allJson<Watchlist>('watchlists'),
      notes: this.allJson<Note>('notes'),
      alerts: this.allJson<AlertRule>('alerts'),
      portfolios: this.allJson<Portfolio>('portfolios'),
    });
  }

  /** Close the underlying database handle (tests / graceful shutdown). */
  close(): void {
    this.db?.close();
    this.db = null;
  }
}
