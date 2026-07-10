import { WorkspaceSchema, type Workspace } from '@tyche/contracts';
import { api } from '../providers/apiClient';
import { STORAGE_KEYS } from '../constants';
import { useTerminalStore } from '../state/terminalStore';
import { useWorkspaceStore } from '../state/workspaceStore';

function currentWorkspace(): Workspace {
  const activeInstrument = useTerminalStore.getState().activeInstrument;
  return useWorkspaceStore.getState().toWorkspace(activeInstrument);
}

/** Validate (and normalize) untrusted workspace JSON against the contract. */
function parseWorkspace(value: unknown): Workspace | null {
  const result = WorkspaceSchema.safeParse(value);
  return result.success ? result.data : null;
}

function applyWorkspace(workspace: Workspace): void {
  useWorkspaceStore.getState().loadWorkspace(workspace);
  useTerminalStore.getState().setActiveInstrument(workspace.activeInstrument ?? null);
}

/**
 * The localStorage mirror keys, namespaced by the signed-in user in hosted mode.
 * On a shared browser the mirror is only a per-account boot cache — a global key
 * would let one account's workspace load into (and be re-saved under) another.
 * Self-host (single user, no session) keeps the bare keys.
 */
function workspaceKeys(): { workspace: string; lastId: string } {
  const userId = useTerminalStore.getState().user?.id;
  const suffix = userId ? `:${userId}` : '';
  return {
    workspace: `${STORAGE_KEYS.workspace}${suffix}`,
    lastId: `${STORAGE_KEYS.lastWorkspaceId}${suffix}`,
  };
}

function writeMirror(workspace: Workspace): void {
  const keys = workspaceKeys();
  try {
    localStorage.setItem(keys.workspace, JSON.stringify(workspace));
    localStorage.setItem(keys.lastId, workspace.id);
  } catch {
    // localStorage may be unavailable; the API remains the source of truth.
  }
}

/** Persist the current workspace to the API and mirror it to localStorage. */
export async function saveCurrentWorkspace(): Promise<void> {
  const workspace = currentWorkspace();
  // Optimistic mirror so a fire-and-forget save (Cmd+S / Save button, then a
  // quick reload) restores immediately without waiting on the round-trip. The
  // mirror is a per-user local cache the next successful save overwrites; we do
  // NOT roll it back on failure — a reload aborts the in-flight fetch (arriving
  // as { ok:false }), and clearing here would race the navigation and wipe the
  // user's just-made layout. Cross-account safety comes from namespacing the
  // key by user, not from clearing.
  writeMirror(workspace);
  const res = await api.saveWorkspace(workspace);
  if (!res.ok) {
    // fetchEnvelope never throws — a blocked demo write, expired session, or a
    // down API arrives as { ok:false }. Surface it instead of a false "saved".
    useTerminalStore
      .getState()
      .pushMessage('error', `Couldn't save workspace: ${res.error.message}`);
    return;
  }
  useTerminalStore.getState().pushMessage('info', `Workspace "${workspace.name}" saved.`);
}

/** Restore the last workspace: localStorage mirror first, then the API. */
export async function restoreWorkspace(): Promise<void> {
  const keys = workspaceKeys();
  try {
    const local = localStorage.getItem(keys.workspace);
    if (local) {
      const workspace = parseWorkspace(JSON.parse(local));
      if (workspace) {
        applyWorkspace(workspace);
        return;
      }
    }
  } catch {
    // fall through to the API
  }
  try {
    const lastId = localStorage.getItem(keys.lastId);
    if (lastId) {
      const result = await api.getWorkspace(lastId);
      const workspace = result.ok && result.data ? parseWorkspace(result.data) : null;
      if (workspace) applyWorkspace(workspace);
    }
  } catch {
    // ignore — start with an empty workspace
  }
}

/** Load a saved workspace into the terminal and remember it as the last-open one. */
export function switchWorkspace(workspace: Workspace): void {
  applyWorkspace(workspace);
  writeMirror(workspace);
  useTerminalStore.getState().pushMessage('info', `Switched to layout "${workspace.name}".`);
}

/**
 * Stable creation order for the mod+1..9 layout chords (oldest first), so a
 * layout's number never shifts as it's used or re-saved. Pure — shared by the
 * chord handler and the LAYOUT panel's ⌘N badges so the two always agree.
 */
export function orderLayoutsForChords<T extends { createdAt: string }>(workspaces: readonly T[]): T[] {
  return [...workspaces].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Switch to the Nth saved layout (1-based, creation order). No-op if out of range. */
export async function switchToNthLayout(n: number): Promise<void> {
  const list = await api.getWorkspaces();
  if (!list.ok || !list.data) return;
  const target = orderLayoutsForChords(list.data)[n - 1];
  if (!target) return;
  const full = await api.getWorkspace(target.id);
  if (full.ok && full.data) switchWorkspace(full.data);
}

/** Persist the current panels under a NEW workspace id/name and switch to it. */
export async function saveWorkspaceAs(name: string): Promise<void> {
  const now = new Date().toISOString();
  const copy: Workspace = {
    ...currentWorkspace(),
    id: `ws_${crypto.randomUUID()}`,
    name,
    createdAt: now,
    updatedAt: now,
  };
  useWorkspaceStore.getState().loadWorkspace(copy);
  await saveCurrentWorkspace();
}

export function exportWorkspaceJson(): string {
  return JSON.stringify(currentWorkspace(), null, 2);
}

export function importWorkspaceJson(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    useTerminalStore.getState().pushMessage('error', 'Invalid workspace file: not valid JSON.');
    return false;
  }
  const workspace = parseWorkspace(parsed);
  if (!workspace) {
    useTerminalStore
      .getState()
      .pushMessage('error', 'Invalid workspace file: does not match the expected format.');
    return false;
  }
  applyWorkspace(workspace);
  return true;
}
