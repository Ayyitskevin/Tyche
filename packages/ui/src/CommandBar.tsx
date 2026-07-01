import { forwardRef, useState, type KeyboardEvent } from 'react';

export interface CommandSuggestion {
  /** The full input line the suggestion completes to (what Enter executes). */
  id: string;
  label: string;
  hint?: string;
  kind?: 'command' | 'symbol';
}

export interface CommandBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  activeSymbol?: string | null;
  suggestions?: CommandSuggestion[];
  /** Fill the input with the suggestion (Tab / hover affordance). */
  onSelectSuggestion?: (suggestion: CommandSuggestion) => void;
  /** Execute the suggestion immediately (Enter on a selection / click). */
  onRunSuggestion?: (suggestion: CommandSuggestion) => void;
  history?: string[];
}

/**
 * Keyboard-first command input. While suggestions are open: ↓/↑ moves the
 * selection, Tab fills the input with it, Enter executes it, Esc dismisses the
 * popup (a second Esc blurs the bar via the app-level handler). With no
 * suggestions, ↑/↓ walks command history. Enter submits the raw line.
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
    onRunSuggestion,
    history = [],
  },
  ref,
) {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selected, setSelected] = useState(-1);
  const [dismissed, setDismissed] = useState(false);

  const open = !dismissed && suggestions.length > 0;
  const sel = open ? Math.min(selected, suggestions.length - 1) : -1;

  function change(next: string) {
    setDismissed(false);
    setSelected(-1);
    onChange(next);
  }

  function run(s: CommandSuggestion) {
    (onRunSuggestion ?? onSelectSuggestion)?.(s);
    setSelected(-1);
    setHistoryIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && sel >= 0) {
        run(suggestions[sel]!);
        return;
      }
      if (value.trim().length > 0) {
        onSubmit(value);
        setHistoryIndex(-1);
        setSelected(-1);
      }
      return;
    }
    if (event.key === 'Tab' && open) {
      event.preventDefault();
      const pick = suggestions[Math.max(0, sel)];
      if (pick) onSelectSuggestion?.(pick);
      setSelected(-1);
      return;
    }
    if (event.key === 'Escape' && open) {
      // First Esc closes the popup; the next one reaches the app handler (blur).
      event.stopPropagation();
      setDismissed(true);
      setSelected(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (open) {
        setSelected((sel + 1) % suggestions.length);
        return;
      }
      if (history.length > 0) {
        const next = historyIndex - 1;
        if (next < 0) {
          setHistoryIndex(-1);
          onChange('');
        } else {
          setHistoryIndex(next);
          onChange(history[next] ?? '');
        }
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (open) {
        setSelected(sel <= 0 ? suggestions.length - 1 : sel - 1);
        return;
      }
      if (history.length > 0) {
        const next = Math.min(historyIndex + 1, history.length - 1);
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
          onChange={(e) => change(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label="Command input"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="command-suggestions"
          className="w-full bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 sm:block">
          ⌘K
        </kbd>
      </div>

      {open && (
        <ul
          id="command-suggestions"
          role="listbox"
          aria-label="Command suggestions"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.kind ?? 'command'}:${s.id}`} role="option" aria-selected={i === sel}>
              <button
                type="button"
                // Fires before the input's blur so the click always lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  run(s);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  i === sel ? 'bg-zinc-800 text-sky-300' : 'hover:bg-zinc-800'
                }`}
              >
                <span className="font-mono text-zinc-200">{s.label}</span>
                {s.kind === 'symbol' && (
                  <span className="rounded bg-zinc-800 px-1 text-[9px] uppercase tracking-wide text-zinc-500">
                    sym
                  </span>
                )}
                {s.hint && <span className="ml-auto truncate text-zinc-500">{s.hint}</span>}
                {i === sel && <kbd className="shrink-0 text-[9px] text-zinc-600">↹ fill · ⏎ run</kbd>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
