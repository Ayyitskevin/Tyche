import { AsyncLocalStorage } from 'node:async_hooks';
import type { PersistenceStore } from '../persistence/types';
import type { AuditSink } from '../security/audit';
import type { UserRecord } from './users';

/** Per-request context in hosted mode: the authenticated user and their store. */
export interface RequestScope {
  user: UserRecord;
  store: PersistenceStore;
}

export const requestScope = new AsyncLocalStorage<RequestScope>();

export function currentUser(): UserRecord | undefined {
  return requestScope.getStore()?.user;
}

/**
 * A PersistenceStore that delegates every call to the request's user store when
 * a hosted-mode scope is active, and to the root (self-host) store otherwise.
 * Existing routes keep calling `ctx.persistence` unchanged.
 */
export function scopedPersistence(root: PersistenceStore): PersistenceStore {
  const target = () => requestScope.getStore()?.store ?? root;
  return {
    init: () => root.init(),
    getPreferences: () => target().getPreferences(),
    savePreferences: (p) => target().savePreferences(p),
    listWorkspaces: () => target().listWorkspaces(),
    getWorkspace: (id) => target().getWorkspace(id),
    saveWorkspace: (w) => target().saveWorkspace(w),
    deleteWorkspace: (id) => target().deleteWorkspace(id),
    listWatchlists: () => target().listWatchlists(),
    saveWatchlist: (w) => target().saveWatchlist(w),
    deleteWatchlist: (id) => target().deleteWatchlist(id),
    listNotes: () => target().listNotes(),
    saveNote: (n) => target().saveNote(n),
    deleteNote: (id) => target().deleteNote(id),
    listPortfolios: () => target().listPortfolios(),
    getPortfolio: (id) => target().getPortfolio(id),
    savePortfolio: (p) => target().savePortfolio(p),
    deletePortfolio: (id) => target().deletePortfolio(id),
    listSavedScreens: () => target().listSavedScreens(),
    saveSavedScreen: (s) => target().saveSavedScreen(s),
    deleteSavedScreen: (id) => target().deleteSavedScreen(id),
    listAlerts: () => target().listAlerts(),
    saveAlert: (r) => target().saveAlert(r),
    deleteAlert: (id) => target().deleteAlert(id),
    markAlertTriggered: (id, firedAt, deactivate) => target().markAlertTriggered(id, firedAt, deactivate),
    snapshot: () => target().snapshot(),
    close: () => root.close?.(),
  };
}

/** An AuditSink whose actor is the authenticated user (email) when one exists. */
export function scopedAudit(root: AuditSink): AuditSink {
  return {
    record: (event) => {
      const user = currentUser();
      root.record(user ? { ...event, actor: user.email } : event);
    },
    recent: (limit) => root.recent(limit),
  };
}
