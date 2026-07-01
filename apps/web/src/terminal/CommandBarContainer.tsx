import { forwardRef, useEffect, useMemo, useState } from 'react';
import { CommandBar, type CommandSuggestion } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useTerminalStore } from '../state/terminalStore';
import { commandRegistry } from './registry';
import { executeInput } from './execute';
import { buildCommandSuggestions, wantsSymbolSuggestions } from './suggest';

const COMMANDS = commandRegistry.list();
const SYMBOL_DEBOUNCE_MS = 150;

export const CommandBarContainer = forwardRef<HTMLInputElement>(function CommandBarContainer(_props, ref) {
  const [value, setValue] = useState('');
  const [symbolSuggestions, setSymbolSuggestions] = useState<CommandSuggestion[]>([]);
  const activeInstrument = useTerminalStore((s) => s.activeInstrument);
  const history = useTerminalStore((s) => s.recentCommands);

  const commandSuggestions = useMemo(() => buildCommandSuggestions(value, COMMANDS), [value]);

  // Symbol suggestions ride the provider-agnostic search API (debounced), so
  // any enabled provider's universe — not a hardcoded list — feeds the popup.
  useEffect(() => {
    const query = wantsSymbolSuggestions(value, COMMANDS);
    if (!query) {
      setSymbolSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api.search(query).then((res) => {
        if (cancelled || !res.ok || !res.data) return;
        setSymbolSuggestions(
          res.data.slice(0, 4).map((r) => ({
            // Trailing space: Tab leaves the cursor ready for a command; Enter
            // executes the bare symbol (default command, e.g. DES).
            id: `${r.identifier.symbol} `,
            label: r.identifier.symbol,
            hint: r.name,
            kind: 'symbol' as const,
          })),
        );
      });
    }, SYMBOL_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  const suggestions = useMemo(
    () => [...commandSuggestions, ...symbolSuggestions].slice(0, 8),
    [commandSuggestions, symbolSuggestions],
  );

  return (
    <CommandBar
      ref={ref}
      value={value}
      onChange={setValue}
      onSubmit={(v) => {
        executeInput(v);
        setValue('');
      }}
      activeSymbol={activeInstrument?.symbol ?? null}
      suggestions={suggestions}
      onSelectSuggestion={(s) => setValue(s.id)}
      onRunSuggestion={(s) => {
        executeInput(s.id);
        setValue('');
      }}
      history={history}
    />
  );
});
