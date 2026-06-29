import type {
  AlertRule,
  Note,
  Portfolio,
  UserPreferences,
  Watchlist,
  Workspace,
} from '@tyche/contracts';

/** Current persisted-schema version. Bump + migrate when the shape changes. */
export const PERSISTENCE_VERSION = 2 as const;

// `Note` is now a shared contract type (markdown body, tags, pinned). Re-export
// so existing persistence/route importers keep their `./types` import path.
export type { Note };

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
  /**
   * Atomically record a fire on a rule: stamp `lastTriggeredAt` and, when
   * `deactivate` is set (oneShot), flip `active` to false. Returns false if the
   * rule is missing or already inactive — the compare-and-set the stream relies
   * on so a oneShot rule fires exactly once even across concurrent connections.
   * Mutates only those two fields, so it never clobbers a concurrent user edit.
   */
  markAlertTriggered(id: string, firedAt: string, deactivate: boolean): Promise<boolean>;

  /** Full snapshot, for import/export + diagnostics. */
  snapshot(): Promise<PersistedState>;
}
