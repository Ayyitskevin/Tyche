import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UserPreferencesSchema, type AlertRule, type Portfolio, type Watchlist, type Workspace } from '@tyche/contracts';
import { SEED_SYMBOLS } from '@tyche/data-adapters';
import { PERSISTENCE_VERSION, type Note, type PersistedState, type PersistenceStore } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function defaultState(): PersistedState {
  const now = nowIso();
  const watchlist: Watchlist = {
    id: 'wl_default',
    name: 'My Watchlist',
    symbols: [...SEED_SYMBOLS],
    createdAt: now,
    updatedAt: now,
  };
  return {
    version: PERSISTENCE_VERSION,
    preferences: UserPreferencesSchema.parse({ updatedAt: now }),
    workspaces: [],
    watchlists: [watchlist],
    notes: [],
    alerts: [],
    portfolios: [],
  };
}

/**
 * JSON-file persistence. Reads the whole document into memory on init and
 * writes atomically (temp file + rename) on every mutation. Suitable for a
 * single-operator, self-hosted deployment; swap for SQLite/Postgres at scale.
 */
export class FilePersistence implements PersistenceStore {
  private state: PersistedState = defaultState();
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly dir: string) {}

  private get file(): string {
    return join(this.dir, 'tyche-db.json');
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as PersistedState;
      this.state = this.migrate(parsed);
    } catch {
      this.state = defaultState();
      await this.persist();
    }
  }

  /** Forward-compatible migration hook. v1→v2 backfills note tags/pinned. */
  private migrate(state: PersistedState): PersistedState {
    if (!state || typeof state !== 'object' || !('version' in state)) return defaultState();
    const merged = { ...defaultState(), ...state, version: PERSISTENCE_VERSION };
    merged.notes = (merged.notes ?? []).map((n) => {
      const legacy = n as Partial<Note>;
      return { ...n, tags: legacy.tags ?? [], pinned: legacy.pinned ?? false };
    });
    return merged;
  }

  private persist(): Promise<void> {
    const tmp = `${this.file}.tmp`;
    const data = JSON.stringify(this.state, null, 2);
    this.writing = this.writing.then(async () => {
      await writeFile(tmp, data, 'utf8');
      await rename(tmp, this.file);
    });
    return this.writing;
  }

  getPreferences() {
    return Promise.resolve(this.state.preferences);
  }

  async savePreferences(preferences: PersistedState['preferences']) {
    this.state.preferences = preferences;
    await this.persist();
    return preferences;
  }

  listWorkspaces() {
    return Promise.resolve(this.state.workspaces);
  }

  getWorkspace(id: string) {
    return Promise.resolve(this.state.workspaces.find((w) => w.id === id));
  }

  async saveWorkspace(workspace: Workspace) {
    const index = this.state.workspaces.findIndex((w) => w.id === workspace.id);
    if (index >= 0) this.state.workspaces[index] = workspace;
    else this.state.workspaces.push(workspace);
    await this.persist();
    return workspace;
  }

  async deleteWorkspace(id: string) {
    const before = this.state.workspaces.length;
    this.state.workspaces = this.state.workspaces.filter((w) => w.id !== id);
    const removed = this.state.workspaces.length < before;
    if (removed) await this.persist();
    return removed;
  }

  listWatchlists() {
    return Promise.resolve(this.state.watchlists);
  }

  async saveWatchlist(watchlist: Watchlist) {
    const index = this.state.watchlists.findIndex((w) => w.id === watchlist.id);
    if (index >= 0) this.state.watchlists[index] = watchlist;
    else this.state.watchlists.push(watchlist);
    await this.persist();
    return watchlist;
  }

  async deleteWatchlist(id: string) {
    const before = this.state.watchlists.length;
    this.state.watchlists = this.state.watchlists.filter((w) => w.id !== id);
    const removed = this.state.watchlists.length < before;
    if (removed) await this.persist();
    return removed;
  }

  listNotes() {
    return Promise.resolve(this.state.notes);
  }

  async saveNote(note: Note) {
    const index = this.state.notes.findIndex((n) => n.id === note.id);
    if (index >= 0) this.state.notes[index] = note;
    else this.state.notes.push(note);
    await this.persist();
    return note;
  }

  async deleteNote(id: string) {
    const before = this.state.notes.length;
    this.state.notes = this.state.notes.filter((n) => n.id !== id);
    const removed = this.state.notes.length < before;
    if (removed) await this.persist();
    return removed;
  }

  listPortfolios() {
    return Promise.resolve(this.state.portfolios);
  }

  getPortfolio(id: string) {
    return Promise.resolve(this.state.portfolios.find((p) => p.id === id));
  }

  async savePortfolio(portfolio: Portfolio) {
    const index = this.state.portfolios.findIndex((p) => p.id === portfolio.id);
    if (index >= 0) this.state.portfolios[index] = portfolio;
    else this.state.portfolios.push(portfolio);
    await this.persist();
    return portfolio;
  }

  async deletePortfolio(id: string) {
    const before = this.state.portfolios.length;
    this.state.portfolios = this.state.portfolios.filter((p) => p.id !== id);
    const removed = this.state.portfolios.length < before;
    if (removed) await this.persist();
    return removed;
  }

  listAlerts() {
    return Promise.resolve(this.state.alerts);
  }

  async saveAlert(rule: AlertRule) {
    const index = this.state.alerts.findIndex((a) => a.id === rule.id);
    if (index >= 0) this.state.alerts[index] = rule;
    else this.state.alerts.push(rule);
    await this.persist();
    return rule;
  }

  async deleteAlert(id: string) {
    const before = this.state.alerts.length;
    this.state.alerts = this.state.alerts.filter((a) => a.id !== id);
    const removed = this.state.alerts.length < before;
    if (removed) await this.persist();
    return removed;
  }

  async markAlertTriggered(id: string, firedAt: string, deactivate: boolean) {
    const rule = this.state.alerts.find((a) => a.id === id);
    // Compare-and-set: the active check + in-memory flip run synchronously before
    // the await, so two concurrent connections cannot both "win" a oneShot fire.
    if (!rule || !rule.active) return false;
    rule.lastTriggeredAt = firedAt;
    if (deactivate) rule.active = false;
    await this.persist();
    return true;
  }

  snapshot() {
    return Promise.resolve(structuredClone(this.state));
  }
}
