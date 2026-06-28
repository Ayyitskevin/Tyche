import { useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Quote } from '@tyche/contracts';
import { DataTable, EmptyState, type Column } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { useElementSize } from '../providers/useElementSize';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';
import { emptyQuoteBatch, mergeQuotes, quoteColumns } from './quotesCommon';

export function WatchlistModule({ missingCapabilities, reportProvenance }: ModulePanelProps) {
  const watchlists = useApiData(() => api.getWatchlists(), []);
  const watchlist = watchlists.data?.[0] ?? null;
  const symbols = watchlist?.symbols ?? [];

  const initial = useApiData(
    () => (symbols.length > 0 ? api.getQuotes(symbols) : emptyQuoteBatch()),
    [symbols.join(',')],
  );
  useReportProvenance(reportProvenance, initial.provenance);
  const live = useQuoteStream(symbols);
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [input, setInput] = useState('');

  const rows = mergeQuotes(symbols, initial.data, live);

  async function addSymbol() {
    const sym = input.trim().toUpperCase();
    if (!sym || !watchlist || symbols.includes(sym)) {
      setInput('');
      return;
    }
    await api.saveWatchlist({ ...watchlist, symbols: [...symbols, sym] });
    setInput('');
    watchlists.reload();
  }

  async function removeSymbol(sym: string) {
    if (!watchlist) return;
    await api.saveWatchlist({ ...watchlist, symbols: symbols.filter((s) => s !== sym) });
    watchlists.reload();
  }

  const columns: Array<Column<Quote>> = [
    ...quoteColumns,
    {
      key: 'remove',
      header: '',
      width: '32px',
      align: 'center',
      render: (q) => (
        <button
          type="button"
          aria-label={`Remove ${q.symbol}`}
          onClick={(e) => {
            e.stopPropagation();
            void removeSymbol(q.symbol);
          }}
          className="text-zinc-600 hover:text-red-400"
        >
          ✕
        </button>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-xs font-medium text-zinc-300">{watchlist?.name ?? 'Watchlist'}</span>
        <div className="ml-auto flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addSymbol();
            }}
            placeholder="add symbol"
            spellCheck={false}
            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void addSymbol()}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
          >
            +
          </button>
        </div>
      </div>
      <div ref={ref} className="min-h-0 flex-1">
        {!watchlist ? (
          <EmptyState message="No watchlist found. The default watchlist is created on first run." />
        ) : (
          <ModuleBody state={initial} missingCapabilities={missingCapabilities} emptyMessage="Watchlist is empty.">
            {() => (
              <DataTable
                columns={columns}
                rows={rows}
                getRowKey={(q) => q.symbol}
                height={size.height || 320}
                rowHeight={26}
                onRowClick={(q) => executeInput(`${q.symbol} DES`)}
              />
            )}
          </ModuleBody>
        )}
      </div>
    </div>
  );
}
