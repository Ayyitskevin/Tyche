import { useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';

export function SearchModule({ args, state, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const initialQuery = (state.query as string | undefined) ?? args.join(' ');
  const [query, setQuery] = useState(initialQuery);
  const results = useApiData(() => api.search(query), [query]);
  useReportProvenance(reportProvenance, results.provenance);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol or name…"
          spellCheck={false}
          autoFocus
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-sm text-zinc-100 focus:outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={results} missingCapabilities={missingCapabilities} emptyMessage="No matches.">
          {(items) => (
            <ul className="divide-y divide-zinc-900">
              {items.map((item) => (
                <li key={item.identifier.symbol}>
                  <button
                    type="button"
                    onClick={() => executeInput(`${item.identifier.symbol} DES`)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-900/60"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-sky-300">{item.identifier.symbol}</div>
                      <div className="truncate text-[11px] text-zinc-400">{item.name}</div>
                    </div>
                    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
                      {item.identifier.assetClass}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
