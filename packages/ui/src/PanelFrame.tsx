import type { ReactNode } from 'react';
import type { DataProvenance, Maturity } from '@tyche/contracts';
import { ProvenanceBadge } from './ProvenanceBadge';

export interface PanelFrameProps {
  title: string;
  symbol?: string | null;
  maturity?: Maturity;
  provenance?: DataProvenance | null;
  /** Link-group color (panel linking); null = unlinked. */
  linkColor?: string | null;
  active?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  minimized?: boolean;
  maximized?: boolean;
  /** Extra header controls (e.g. range selector). */
  actions?: ReactNode;
  /** Class used by the workspace as a drag handle. */
  dragHandleClassName?: string;
  children: ReactNode;
}

const MATURITY_CLASS: Record<Maturity, string> = {
  stable: 'hidden',
  beta: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  stub: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

function HeaderButton({ label, glyph, onClick }: { label: string; glyph: string; onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="no-drag flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
    >
      {glyph}
    </button>
  );
}

export function PanelFrame({
  title,
  symbol,
  maturity = 'stable',
  provenance,
  linkColor,
  active = false,
  onClose,
  onMinimize,
  onMaximize,
  minimized = false,
  maximized = false,
  actions,
  dragHandleClassName = 'panel-drag-handle',
  children,
}: PanelFrameProps) {
  return (
    <section
      className={`flex h-full w-full flex-col overflow-hidden rounded-md border bg-zinc-950/80 ${
        active ? 'border-sky-500/50 shadow-lg shadow-sky-500/5' : 'border-zinc-800'
      }`}
      data-testid="panel-frame"
    >
      <header
        className={`${dragHandleClassName} flex cursor-move items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-2 py-1`}
      >
        {linkColor && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: linkColor }}
            title="Linked panel group"
          />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {symbol && (
            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
              {symbol}
            </span>
          )}
          <span className="truncate text-xs font-medium text-zinc-300">{title}</span>
          <span
            className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-medium uppercase ${MATURITY_CLASS[maturity]}`}
          >
            {maturity}
          </span>
        </div>
        <div className="no-drag flex items-center gap-0.5">
          {actions}
          <HeaderButton label="Minimize" glyph={minimized ? '▣' : '–'} onClick={onMinimize} />
          <HeaderButton label="Maximize" glyph={maximized ? '❐' : '▢'} onClick={onMaximize} />
          <HeaderButton label="Close" glyph="✕" onClick={onClose} />
        </div>
      </header>

      {!minimized && (
        <>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          <footer className="flex shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-2 py-1">
            <ProvenanceBadge provenance={provenance ?? null} />
          </footer>
        </>
      )}
    </section>
  );
}
