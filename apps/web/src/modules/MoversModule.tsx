import { useMemo, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { ScreenQuery, ScreenRow } from '@tyche/contracts';
import { DataTable, changeToneClass, formatNumber, formatPercent, type Column } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useElementSize } from '../providers/useElementSize';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';
import { TableExport } from './TableExport';

type View = 'gainers' | 'losers' | 'active';

const VIEWS: Array<{ id: View; label: string; query: ScreenQuery }> = [
  { id: 'gainers', label: 'Gainers', query: { filters: [], sort: { field: 'changePercent', dir: 'desc' }, limit: 20 } },
  { id: 'losers', label: 'Losers', query: { filters: [], sort: { field: 'changePercent', dir: 'asc' }, limit: 20 } },
  { id: 'active', label: 'Most active', query: { filters: [], sort: { field: 'volume', dir: 'desc' }, limit: 20 } },
];

/** A curated screen: top gainers / losers / most-active, reusing the screener capability. */
export function MoversModule({ missingCapabilities, reportProvenance }: ModulePanelProps) {
  const [view, setView] = useState<View>('gainers');
  const query = VIEWS.find((v) => v.id === view)!.query;
  const movers = useApiData(() => api.screen(query), [view]);
  useReportProvenance(reportProvenance, movers.provenance);
  const [ref, size] = useElementSize<HTMLDivElement>();

  const columns: Array<Column<ScreenRow>> = useMemo(
    () => [
      {
        key: 'symbol',
        header: 'Symbol',
        width: '0.9fr',
        render: (r) => (
          <button type="button" onClick={() => executeInput(`${r.symbol} DES`)} className="text-sky-300 hover:underline">
            {r.symbol}
          </button>
        ),
      },
      { key: 'name', header: 'Name', width: '1.6fr', render: (r) => <span className="truncate text-zinc-400">{r.name}</span> },
      {
        key: 'changePercent',
        header: '% Chg',
        align: 'right',
        render: (r) => <span className={changeToneClass(r.changePercent)}>{formatPercent(r.changePercent)}</span>,
      },
      { key: 'price', header: 'Price', align: 'right', render: (r) => formatNumber(r.price, { decimals: 2 }) },
      { key: 'volume', header: 'Volume', align: 'right', render: (r) => formatNumber(r.volume, { compact: true, decimals: 1 }) },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-2 py-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded px-2 py-0.5 text-[11px] ${
              view === v.id ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:bg-zinc-800/60'
            }`}
          >
            {v.label}
          </button>
        ))}
        <div className="ml-auto">
          <TableExport name={`movers-${view}`} columns={columns} rows={movers.data ?? []} provenance={movers.provenance} />
        </div>
      </div>
      <div ref={ref} className="min-h-0 flex-1">
        <ModuleBody state={movers} missingCapabilities={missingCapabilities}>
          {(rows) => (
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.symbol}
              height={size.height || 360}
              rowHeight={26}
              emptyLabel="No movers."
            />
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
