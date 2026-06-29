import { useMemo, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { ScreenField, ScreenOp, ScreenQuery, ScreenRow } from '@tyche/contracts';
import {
  DataTable,
  changeToneClass,
  formatNumber,
  formatPercent,
  type Column,
  type SortState,
} from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useElementSize } from '../providers/useElementSize';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';

const FIELDS: Array<{ id: ScreenField; label: string; numeric: boolean }> = [
  { id: 'price', label: 'Price', numeric: true },
  { id: 'changePercent', label: '% Chg', numeric: true },
  { id: 'marketCap', label: 'Mkt Cap', numeric: true },
  { id: 'volume', label: 'Volume', numeric: true },
  { id: 'sector', label: 'Sector', numeric: false },
  { id: 'assetClass', label: 'Asset Class', numeric: false },
];

const OPS: Array<{ id: ScreenOp; label: string }> = [
  { id: 'gt', label: '>' },
  { id: 'gte', label: '≥' },
  { id: 'lt', label: '<' },
  { id: 'lte', label: '≤' },
  { id: 'eq', label: '=' },
  { id: 'neq', label: '≠' },
];

interface DraftFilter {
  field: ScreenField;
  op: ScreenOp;
  value: string;
}

function isNumericField(field: ScreenField): boolean {
  return FIELDS.find((f) => f.id === field)?.numeric ?? false;
}

/** Build a validated query from the draft filters (dropping incomplete rows). */
function buildQuery(drafts: DraftFilter[], sort: SortState | null): ScreenQuery {
  const filters = drafts
    .filter((d) => d.value.trim() !== '')
    .map((d) => {
      const numeric = isNumericField(d.field);
      const value = numeric ? Number(d.value.trim()) : d.value.trim();
      return { field: d.field, op: d.op, value };
    })
    .filter((f) => !(typeof f.value === 'number' && Number.isNaN(f.value)));
  return {
    filters,
    limit: 100,
    ...(sort ? { sort: { field: sort.columnId as ScreenField, dir: sort.dir } } : {}),
  };
}

export function ScreenerModule({ missingCapabilities, reportProvenance }: ModulePanelProps) {
  const [drafts, setDrafts] = useState<DraftFilter[]>([]);
  const [sort, setSort] = useState<SortState | null>({ columnId: 'marketCap', dir: 'desc' });
  // The committed query only changes on Run / header-sort, not on every keystroke.
  const [query, setQuery] = useState<ScreenQuery>(() => buildQuery([], { columnId: 'marketCap', dir: 'desc' }));

  const results = useApiData(() => api.screen(query), [JSON.stringify(query)]);
  useReportProvenance(reportProvenance, results.provenance);
  const [ref, size] = useElementSize<HTMLDivElement>();

  function run(nextSort: SortState | null = sort) {
    setQuery(buildQuery(drafts, nextSort));
  }

  function onHeaderClick(columnId: string) {
    const next: SortState =
      sort?.columnId === columnId ? { columnId, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { columnId, dir: 'desc' };
    setSort(next);
    // Re-sort the already-committed screen; don't apply half-typed draft filters.
    setQuery((q) => ({ ...q, sort: { field: next.columnId as ScreenField, dir: next.dir } }));
  }

  const columns: Array<Column<ScreenRow>> = useMemo(
    () => [
      {
        key: 'symbol',
        header: 'Symbol',
        width: '0.9fr',
        sortable: false,
        render: (r) => (
          <button type="button" onClick={() => executeInput(`${r.symbol} DES`)} className="text-sky-300 hover:underline">
            {r.symbol}
          </button>
        ),
      },
      { key: 'name', header: 'Name', width: '1.6fr', render: (r) => <span className="truncate text-zinc-400">{r.name}</span> },
      { key: 'sector', header: 'Sector', width: '1fr', render: (r) => r.sector ?? '—' },
      { key: 'price', header: 'Price', align: 'right', sortable: true, render: (r) => formatNumber(r.price, { decimals: 2 }) },
      {
        key: 'changePercent',
        header: '% Chg',
        align: 'right',
        sortable: true,
        render: (r) => <span className={changeToneClass(r.changePercent)}>{formatPercent(r.changePercent)}</span>,
      },
      { key: 'marketCap', header: 'Mkt Cap', align: 'right', sortable: true, render: (r) => formatNumber(r.marketCap, { compact: true, decimals: 1 }) },
      { key: 'volume', header: 'Volume', align: 'right', sortable: true, render: (r) => formatNumber(r.volume, { compact: true, decimals: 1 }) },
    ],
    [],
  );

  const controlClass = 'rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none';

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-1 border-b border-zinc-800 p-2">
        {drafts.map((d, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              aria-label="Filter field"
              value={d.field}
              onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, field: e.target.value as ScreenField } : x)))}
              className={controlClass}
            >
              {FIELDS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter operator"
              value={d.op}
              onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, op: e.target.value as ScreenOp } : x)))}
              className={controlClass}
            >
              {OPS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Filter value"
              value={d.value}
              onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              placeholder={isNumericField(d.field) ? 'number' : 'text'}
              className={`w-24 font-mono ${controlClass}`}
            />
            <button
              type="button"
              aria-label="Remove filter"
              onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
              className="text-zinc-600 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrafts((prev) => [...prev, { field: 'price', op: 'gt', value: '' }])}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
          >
            + filter
          </button>
          <button
            type="button"
            onClick={() => run()}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            Run screen
          </button>
          <span className="ml-auto text-[10px] text-zinc-600">{results.data?.length ?? 0} matches</span>
        </div>
      </div>
      <div ref={ref} className="min-h-0 flex-1">
        <ModuleBody state={results} missingCapabilities={missingCapabilities}>
          {(rows) => (
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.symbol}
              height={size.height || 360}
              rowHeight={26}
              sort={sort}
              onHeaderClick={onHeaderClick}
              emptyLabel="No matches — loosen the filters."
            />
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
