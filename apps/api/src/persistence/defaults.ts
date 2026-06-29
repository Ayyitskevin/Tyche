import { UserPreferencesSchema, type Watchlist } from '@tyche/contracts';
import { SEED_SYMBOLS } from '@tyche/data-adapters';
import { PERSISTENCE_VERSION, type PersistedState } from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * The seed state every persistence adapter starts from when its store is empty:
 * a default watchlist over the seed symbols, default preferences, and the
 * current schema version. Shared so the file and SQLite adapters are identical.
 */
export function defaultState(): PersistedState {
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
