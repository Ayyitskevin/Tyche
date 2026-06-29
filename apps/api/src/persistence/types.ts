import type {
  AlertRule,
  Portfolio,
  UserPreferences,
  Watchlist,
  Workspace,
} from '@tyche/contracts';

/** Current persisted-schema version. Bump + migrate when the shape changes. */
export const PERSISTENCE_VERSION = 1 as const;

export interface Note {
  id: string;
  symbol: string | null;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedState {
  version: number;
  preferences: UserPreferences;
  workspaces: Workspace[];
  watchlists: Watchlist[];
  notes: Note[];
  alerts: AlertRule[];
  portfolios: Portfolio[];
}

/**
 * Persistence abstraction. The foundation ships a JSON-file implementation; the
 * interface is deliberately collection-oriented so a SQLite/Postgres adapter can
 * be added without touching routes.
 */
export interface PersistenceStore {
  init(): Promise<void>;

  getPreferences(): Promise<UserPreferences>;
  savePreferences(preferences: UserPreferences): Promise<UserPreferences>;

  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  saveWorkspace(workspace: Workspace): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<boolean>;

  listWatchlists(): Promise<Watchlist[]>;
  saveWatchlist(watchlist: Watchlist): Promise<Watchlist>;
  deleteWatchlist(id: string): Promise<boolean>;

  listNotes(): Promise<Note[]>;
  saveNote(note: Note): Promise<Note>;
  deleteNote(id: string): Promise<boolean>;

  listAlerts(): Promise<AlertRule[]>;
  saveAlert(rule: AlertRule): Promise<AlertRule>;
  deleteAlert(id: string): Promise<boolean>;

  /** Full snapshot, for import/export + diagnostics. */
  snapshot(): Promise<PersistedState>;
}
