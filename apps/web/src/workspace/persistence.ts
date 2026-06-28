import type { Workspace } from '@tyche/contracts';
import { api } from '../providers/apiClient';
import { STORAGE_KEYS } from '../constants';
import { useTerminalStore } from '../state/terminalStore';
import { useWorkspaceStore } from '../state/workspaceStore';

function currentWorkspace(): Workspace {
  const activeInstrument = useTerminalStore.getState().activeInstrument;
  return useWorkspaceStore.getState().toWorkspace(activeInstrument);
}

function applyWorkspace(workspace: Workspace): void {
  useWorkspaceStore.getState().loadWorkspace(workspace);
  useTerminalStore.getState().setActiveInstrument(workspace.activeInstrument ?? null);
}

/** Persist the current workspace to the API and mirror it to localStorage. */
export async function saveCurrentWorkspace(): Promise<void> {
  const workspace = currentWorkspace();
  try {
    localStorage.setItem(STORAGE_KEYS.workspace, JSON.stringify(workspace));
    localStorage.setItem(STORAGE_KEYS.lastWorkspaceId, workspace.id);
  } catch {
    // localStorage may be unavailable; the API save is the source of truth.
  }
  await api.saveWorkspace(workspace);
  useTerminalStore.getState().pushMessage('info', `Workspace "${workspace.name}" saved.`);
}

/** Restore the last workspace: localStorage mirror first, then the API. */
export async function restoreWorkspace(): Promise<void> {
  try {
    const local = localStorage.getItem(STORAGE_KEYS.workspace);
    if (local) {
      const workspace = JSON.parse(local) as Workspace;
      if (Array.isArray(workspace.panels)) {
        applyWorkspace(workspace);
        return;
      }
    }
  } catch {
    // fall through to the API
  }
  try {
    const lastId = localStorage.getItem(STORAGE_KEYS.lastWorkspaceId);
    if (lastId) {
      const result = await api.getWorkspace(lastId);
      if (result.ok && result.data) applyWorkspace(result.data);
    }
  } catch {
    // ignore — start with an empty workspace
  }
}

export function exportWorkspaceJson(): string {
  return JSON.stringify(currentWorkspace(), null, 2);
}

export function importWorkspaceJson(text: string): boolean {
  try {
    const workspace = JSON.parse(text) as Workspace;
    if (!Array.isArray(workspace.panels)) return false;
    applyWorkspace(workspace);
    return true;
  } catch {
    return false;
  }
}
