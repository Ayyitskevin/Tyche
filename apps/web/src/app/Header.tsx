import { useRef, type ReactNode } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useTerminalStore } from '../state/terminalStore';
import { exportWorkspaceJson, importWorkspaceJson, saveCurrentWorkspace } from '../workspace/persistence';

function HeaderBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

export function Header() {
  const name = useWorkspaceStore((s) => s.name);
  const rename = useWorkspaceStore((s) => s.rename);
  const newWorkspace = useWorkspaceStore((s) => s.newWorkspace);
  const undoClose = useWorkspaceStore((s) => s.undoClose);
  const mode = useTerminalStore((s) => s.mode);
  const fileRef = useRef<HTMLInputElement>(null);

  function onExport() {
    const blob = new Blob([exportWorkspaceJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name || 'workspace'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function onImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void file.text().then((text) => {
        if (!importWorkspaceJson(text)) {
          useTerminalStore.getState().pushMessage('error', 'Invalid workspace JSON.');
        }
      });
    }
    event.target.value = '';
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold tracking-tight text-sky-400">Tyche</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">{mode}</span>
      </div>
      <input
        value={name}
        onChange={(e) => rename(e.target.value)}
        aria-label="Workspace name"
        className="w-48 bg-transparent text-zinc-300 focus:outline-none"
      />
      <div className="ml-auto flex items-center gap-1 text-[11px]">
        <HeaderBtn onClick={() => void saveCurrentWorkspace()}>Save</HeaderBtn>
        <HeaderBtn onClick={() => newWorkspace('Untitled workspace')}>New</HeaderBtn>
        <HeaderBtn onClick={undoClose}>Reopen</HeaderBtn>
        <HeaderBtn onClick={onExport}>Export</HeaderBtn>
        <HeaderBtn onClick={() => fileRef.current?.click()}>Import</HeaderBtn>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImportFile} />
      </div>
    </div>
  );
}
