import { useMemo, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, type SortState } from '@tyche/ui';
import { DEFAULT_SYMBOLS } from '../constants';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { useElementSize } from '../providers/useElementSize';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';
import {
  QUOTE_COLUMN_CATALOG,
  DEFAULT_QUOTE_COLUMNS,
  buildQuoteColumns,
  cycleSort,
  emptyQuoteBatch,
  mergeQuotes,
  sortQuotes,
} from './quotesCommon';

const CATALOG_KEYS = Object.keys(QUOTE_COLUMN_CATALOG);

export function QuoteMonitorModule({ args, symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const watchlists = useApiData(() => api.getWatchlists(), []);

  const symbols = useMemo(() => {
    const fromArgs = args.filter((a) => /^[A-Za-z]/.test(a)).map((a) => a.toUpperCase());
    if (fromArgs.length > 0) return fromArgs;
    if (symbol) return [symbol];
    const first = watchlists.data?.[0]?.symbols;
    return first && first.length > 0 ? first : [...DEFAULT_SYMBOLS];
  }, [args, symbol, watchlists.data]);

  const initial = useApiData(
    () => (symbols.length > 0 ? api.getQuotes(symbols) : emptyQuoteBatch()),
    [symbols.join(',')],
  );
  useReportProvenance(reportProvenance, initial.provenance);
  const live = useQuoteStream(symbols);
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [showCols, setShowCols] = useState(false);

  // Per-panel persisted config (no contract change — rides Panel.state).
  const columnIds = useMemo(
    () => (Array.isArray(state.columns) && state.columns.length > 0 ? (state.columns as string[]) : DEFAULT_QUOTE_COLUMNS),
    [state.columns],
  );
  const sort = (state.sort as SortState | null | undefined) ?? null;

  const columns = useMemo(() => buildQuoteColumns(columnIds), [columnIds]);
  const rows = useMemo(() => mergeQuotes(symbols, initial.data, live), [symbols, initial.data, live]);
  const sortedRows = useMemo(() => sortQuotes(rows, sort), [rows, sort]);

  function onHeaderClick(columnId: string) {
    setState({ ...state, sort: cycleSort(sort, columnId) });
  }

  function toggleColumn(id: string) {
    const next = columnIds.includes(id) ? columnIds.filter((c) => c !== id) : [...columnIds, id];
    setState({ ...state, columns: next });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex shrink-0 items-center border-b border-zinc-800 px-2 py-1">
        <span className="text-[11px] text-zinc-500">{symbols.length} symbols</span>
        <button
          type="button"
          onClick={() => setShowCols((v) => !v)}
          className={`ml-auto rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] ${
            showCols ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          columns
        </button>
        {showCols && (
          <div className="absolute right-2 top-full z-20 mt-1 grid w-44 grid-cols-2 gap-0.5 rounded border border-zinc-700 bg-zinc-900 p-1.5 shadow-lg">
            {CATALOG_KEYS.map((id) => (
              <label key={id} className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800">
                <input
                  type="checkbox"
                  checked={columnIds.includes(id)}
                  onChange={() => toggleColumn(id)}
                  className="accent-sky-500"
                />
                {id}
              </label>
            ))}
          </div>
        )}
      </div>
      <div ref={ref} className="min-h-0 flex-1">
        <ModuleBody state={initial} missingCapabilities={missingCapabilities} emptyMessage="No symbols to monitor.">
          {() => (
            <DataTable
              columns={columns}
              rows={sortedRows}
              getRowKey={(q) => q.symbol}
              height={size.height || 320}
              rowHeight={26}
              sort={sort}
              onHeaderClick={onHeaderClick}
              onRowClick={(q) => executeInput(`${q.symbol} DES`)}
            />
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
