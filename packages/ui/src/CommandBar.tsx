import { forwardRef, useState, type KeyboardEvent } from 'react';

export interface CommandSuggestion {
  id: string;
  label: string;
  hint?: string;
}

export interface CommandBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  activeSymbol?: string | null;
  suggestions?: CommandSuggestion[];
  onSelectSuggestion?: (suggestion: CommandSuggestion) => void;
  history?: string[];
}

/**
 * Keyboard-first command input. Enter submits; Up/Down walks command history.
 * Suggestions render below and are click-to-fill. The host wires this to the
 * terminal kernel (parse + execute).
 */
export const CommandBar = forwardRef<HTMLInputElement, CommandBarProps>(function CommandBar(
  {
    value,
    onChange,
    onSubmit,
    placeholder = 'Enter a command — e.g. AAPL DES, QM, N, HELP',
    activeSymbol,
    suggestions = [],
    onSelectSuggestion,
    history = [],
  },
  ref,
) {
  const [historyIndex, setHistoryIndex] = useState(-1);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (value.trim().length > 0) {
        onSubmit(value);
        setHistoryIndex(-1);
      }
      return;
    }
    if (event.key === 'ArrowUp' && history.length > 0) {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      onChange(history[next] ?? '');
      return;
    }
    if (event.key === 'ArrowDown' && history.length > 0) {
      event.preventDefault();
      const next = historyIndex - 1;
      if (next < 0) {
        setHistoryIndex(-1);
        onChange('');
      } else {
        setHistoryIndex(next);
        onChange(history[next] ?? '');
      }
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 focus-within:border-sky-500/60">
        <span className="select-none font-mono text-sm text-sky-400">›</span>
        {activeSymbol && (
          <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
            {activeSymbol}
          </span>
        )}
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label="Command input"
          className="w-full bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 sm:block">
          ⌘K
        </kbd>
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectSuggestion?.(s)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-800"
              >
                <span className="font-mono text-zinc-200">{s.label}</span>
                {s.hint && <span className="truncate text-zinc-500">{s.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
