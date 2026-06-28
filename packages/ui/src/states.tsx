import type { ReactNode } from 'react';

export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-zinc-500">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-400" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export interface EmptyStateProps {
  title?: string;
  message: string;
  /** Capabilities the panel needs but the active providers don't supply. */
  capabilities?: string[];
  action?: ReactNode;
}

/**
 * The canonical "nothing here, and here's why" state. Used heavily for
 * capability gaps so a missing provider explains itself instead of crashing.
 */
export function EmptyState({ title = 'Nothing to show', message, capabilities, action }: EmptyStateProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-sm font-medium text-zinc-300">{title}</div>
      <p className="max-w-sm text-xs leading-relaxed text-zinc-500">{message}</p>
      {capabilities && capabilities.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
            >
              {cap}
            </span>
          ))}
        </div>
      )}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-sm font-medium text-red-300">{title}</div>
      <p className="max-w-sm text-xs leading-relaxed text-zinc-500">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Retry
        </button>
      )}
    </div>
  );
}
