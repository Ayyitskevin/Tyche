import type { ReactNode } from 'react';

export interface TerminalShellProps {
  header?: ReactNode;
  commandBar?: ReactNode;
  statusBar?: ReactNode;
  children: ReactNode;
}

/**
 * The outermost terminal chrome: a full-height column with a header, the command
 * bar, the workspace surface (children), and a status bar. Purely structural —
 * the dark terminal aesthetic comes from the host's theme tokens.
 */
export function TerminalShell({ header, commandBar, statusBar, children }: TerminalShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-200">
      {header && (
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/60">{header}</div>
      )}
      {commandBar && <div className="shrink-0 px-3 py-2">{commandBar}</div>}
      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
      {statusBar && (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] text-zinc-500">
          {statusBar}
        </div>
      )}
    </div>
  );
}
