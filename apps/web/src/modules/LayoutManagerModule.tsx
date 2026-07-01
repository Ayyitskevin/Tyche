import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Workspace } from '@tyche/contracts';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useWorkspaceStore } from '../state/workspaceStore';
import {
  saveCurrentWorkspace,
  saveWorkspaceAs,
  switchWorkspace,
} from '../workspace/persistence';
import { ModuleBody } from './common';

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * LAYOUT — named workspace layouts. Lists every saved workspace; open switches
 * the whole terminal to it, Save as… forks the current panels under a new
 * name, New empty starts clean. The active layout cannot be deleted.
 */
export function LayoutManagerModule({ missingCapabilities }: ModulePanelProps) {
  const layouts = useApiData(() => api.getWorkspaces(), []);
  const currentId = useWorkspaceStore((s) => s.id);
  const currentName = useWorkspaceStore((s) => s.name);
  const newWorkspace = useWorkspaceStore((s) => s.newWorkspace);

  async function saveAs() {
    const name = window.prompt('Save current layout as…', `${currentName} copy`);
    if (!name || !name.trim()) return;
    await saveWorkspaceAs(name.trim());
    layouts.reload();
  }

  async function newEmpty() {
    const name = window.prompt('New empty layout name', 'Untitled workspace');
    if (!name || !name.trim()) return;
    newWorkspace(name.trim());
    await saveCurrentWorkspace();
    layouts.reload();
  }

  async function open(id: string) {
    const res = await api.getWorkspace(id);
    if (res.ok && res.data) switchWorkspace(res.data);
  }

  async function remove(workspace: Workspace) {
    if (!window.confirm(`Delete layout "${workspace.name}"? This cannot be undone.`)) return;
    await api.deleteWorkspace(workspace.id);
    layouts.reload();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        <button
          type="button"
          onClick={() => void saveCurrentWorkspace().then(() => layouts.reload())}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          Save current
        </button>
        <button
          type="button"
          onClick={() => void saveAs()}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          Save as…
        </button>
        <button
          type="button"
          onClick={() => void newEmpty()}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          New empty
        </button>
        <span className="ml-auto text-[10px] text-zinc-600">JSON export/import lives in the header</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        <ModuleBody
          state={layouts}
          missingCapabilities={missingCapabilities}
          emptyMessage="No saved layouts yet — Save current or Save as… to create one."
        >
          {(list) => (
            <ul className="space-y-0.5">
              {[...list]
                .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
                .map((ws) => {
                  const active = ws.id === currentId;
                  return (
                    <li
                      key={ws.id}
                      className={`flex items-center gap-2 rounded px-2 py-1 ${
                        active ? 'bg-sky-500/10' : 'hover:bg-zinc-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void open(ws.id)}
                        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                      >
                        <span className={`truncate text-xs ${active ? 'text-sky-300' : 'text-zinc-200'}`}>
                          {ws.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-zinc-600">
                          {ws.panels.length} panel{ws.panels.length === 1 ? '' : 's'} ·{' '}
                          {relativeTime(ws.updatedAt)}
                        </span>
                        {active && (
                          <span className="ml-auto shrink-0 rounded bg-sky-500/20 px-1 text-[9px] uppercase text-sky-300">
                            current
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${ws.name}`}
                        disabled={active}
                        onClick={() => void remove(ws)}
                        className="shrink-0 rounded px-1 text-[11px] text-zinc-600 hover:text-red-400 disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
