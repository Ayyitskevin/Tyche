import { useState } from 'react';
import { buildHelpModel, searchCommands } from '@tyche/terminal-kernel';
import type { RegisteredCommand } from '@tyche/terminal-kernel';
import { commandRegistry } from '../terminal/registry';
import { executeInput } from '../terminal/execute';

function CommandRow({ command }: { command: RegisteredCommand }) {
  return (
    <button
      type="button"
      onClick={() => executeInput(command.examples[0] ?? command.id)}
      className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-zinc-900/60"
    >
      <span className="w-16 shrink-0 font-mono text-xs font-semibold text-sky-300">{command.id}</span>
      <span className="min-w-0 flex-1">
        <span className="text-xs text-zinc-300">{command.title}</span>
        {command.aliases.length > 0 && (
          <span className="ml-1 text-[10px] text-zinc-600">({command.aliases.join(', ')})</span>
        )}
        <span className="block text-[11px] text-zinc-500">{command.description}</span>
      </span>
      {command.maturity !== 'stable' && (
        <span className="shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase text-zinc-400">
          {command.maturity}
        </span>
      )}
    </button>
  );
}

export function HelpModule() {
  const [query, setQuery] = useState('');
  const model = buildHelpModel(commandRegistry);
  const matches = query ? searchCommands(commandRegistry, query) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands…"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
        />
        <p className="mt-1 px-1 text-[10px] text-zinc-600">
          Click a command to run its example. Type a symbol then a command, e.g. <span className="font-mono text-zinc-400">AAPL GP</span>.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {matches ? (
          <div className="divide-y divide-zinc-900">
            {matches.map((c) => (
              <CommandRow key={c.id} command={c} />
            ))}
          </div>
        ) : (
          model.map((group) => (
            <section key={group.category}>
              <h3 className="sticky top-0 bg-zinc-900/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {group.category}
              </h3>
              <div className="divide-y divide-zinc-900">
                {group.commands.map((c) => (
                  <CommandRow key={c.id} command={c} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
