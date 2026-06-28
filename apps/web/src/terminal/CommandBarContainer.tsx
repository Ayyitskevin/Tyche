import { forwardRef, useState } from 'react';
import { CommandBar, type CommandSuggestion } from '@tyche/ui';
import { useTerminalStore } from '../state/terminalStore';
import { commandRegistry } from './registry';
import { executeInput } from './execute';

function buildSuggestions(value: string): CommandSuggestion[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];
  const parts = trimmed.split(/\s+/);
  const last = (parts[parts.length - 1] ?? '').toUpperCase();
  const prefix = parts.slice(0, -1).join(' ');
  if (last.length === 0) return [];
  const matches = commandRegistry
    .list()
    .filter((c) => c.id.startsWith(last) || c.aliases.some((a) => a.toUpperCase().startsWith(last)));
  return matches.slice(0, 6).map((c) => ({
    id: prefix ? `${prefix} ${c.id}` : c.id,
    label: prefix ? `${prefix} ${c.id}` : c.id,
    hint: c.title,
  }));
}

export const CommandBarContainer = forwardRef<HTMLInputElement>(function CommandBarContainer(_props, ref) {
  const [value, setValue] = useState('');
  const activeInstrument = useTerminalStore((s) => s.activeInstrument);
  const history = useTerminalStore((s) => s.recentCommands);

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
      suggestions={buildSuggestions(value)}
      onSelectSuggestion={(s) => setValue(s.id)}
      history={history}
    />
  );
});
