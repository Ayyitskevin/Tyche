import { useMemo, useState, type ChangeEvent } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Quote, Watchlist } from '@tyche/contracts';
import { DataTable, EmptyState, type Column } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { useElementSize } from '../providers/useElementSize';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';
import { emptyQuoteBatch, mergeQuotes, quoteColumns } from './quotesCommon';
import { parseSymbolList, validateSymbols, type BatchImportResult } from './batchImport';

/** Stable tab order: explicit `order` first, then creation time, then id. */
function sortWatchlists(lists: Watchlist[]): Watchlist[] {
  return [...lists].sort((a, b) => {
    const oa = a.order ?? Number.POSITIVE_INFINITY;
    const ob = b.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    const ca = Date.parse(a.createdAt) || 0;
    const cb = Date.parse(b.createdAt) || 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}

export function WatchlistModule({ missingCapabilities, reportProvenance }: ModulePanelProps) {
  const watchlists = useApiData(() => api.getWatchlists(), []);
  const lists = useMemo(() => sortWatchlists(watchlists.data ?? []), [watchlists.data]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const symbols = active?.symbols ?? [];

  const initial = useApiData(
    () => (symbols.length > 0 ? api.getQuotes(symbols) : emptyQuoteBatch()),
    [symbols.join(',')],
  );
  useReportProvenance(reportProvenance, initial.provenance);
  const live = useQuoteStream(symbols);
  const [ref, size] = useElementSize<HTMLDivElement>();

  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [raw, setRaw] = useState('');
  const [summary, setSummary] = useState<BatchImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const capabilityGap = missingCapabilities.length > 0;
  const rows = mergeQuotes(symbols, initial.data, live);

  async function addSymbol() {
    const sym = input.trim().toUpperCase();
    if (!sym || !active || symbols.includes(sym)) {
      setInput('');
      return;
    }
    await api.saveWatchlist({ ...active, symbols: [...symbols, sym] });
    setInput('');
    watchlists.reload();
  }

  async function removeSymbol(sym: string) {
    if (!active) return;
    await api.saveWatchlist({ ...active, symbols: symbols.filter((s) => s !== sym) });
    watchlists.reload();
  }

  async function createList() {
    const order = lists.length;
    const res = await api.saveWatchlist({ name: 'Untitled', symbols: [], order });
    if (res.ok) {
      setActiveId(res.data.id);
      setEditingId(res.data.id);
      setEditingName(res.data.name);
    }
    watchlists.reload();
  }

  async function commitRename(list: Watchlist) {
    const name = editingName.trim();
    setEditingId(null);
    if (!name || name === list.name) return;
    await api.saveWatchlist({ ...list, name });
    watchlists.reload();
  }

  async function deleteActive() {
    if (!active) return;
    await api.deleteWatchlist(active.id);
    setActiveId(null);
    watchlists.reload();
  }

  async function move(direction: 'left' | 'right') {
    if (!active) return;
    const idx = lists.findIndex((l) => l.id === active.id);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= lists.length) return;
    const reordered = [...lists];
    const a = reordered[idx]!;
    const b = reordered[swapIdx]!;
    reordered[idx] = b;
    reordered[swapIdx] = a;
    await Promise.all(
      reordered.flatMap((l, i) => (l.order === i ? [] : [api.saveWatchlist({ ...l, order: i })])),
    );
    watchlists.reload();
  }

  async function runImport() {
    if (!active) return;
    const candidates = parseSymbolList(raw);
    if (candidates.length === 0) {
      setSummary(null);
      return;
    }
    setImportBusy(true);
    try {
      const result = await validateSymbols(candidates, active.symbols, api.search);
      setSummary(result);
      if (result.valid.length > 0) {
        const next = [...active.symbols];
        for (const s of result.valid) if (!next.includes(s)) next.push(s);
        await api.saveWatchlist({ ...active, symbols: next });
        watchlists.reload();
      }
    } finally {
      setImportBusy(false);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    setRaw((prev) => (prev ? `${prev}\n${text}` : text));
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
      {/* Tab strip */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800 px-1.5 py-1">
        {lists.map((list) => {
          const isActive = active?.id === list.id;
          const isEditing = editingId === list.id;
          return (
            <div
              key={list.id}
              onClick={() => setActiveId(list.id)}
              onDoubleClick={() => {
                setEditingId(list.id);
                setEditingName(list.name);
              }}
              className={`flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
                isActive ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {isEditing ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => void commitRename(list)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename(list);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  spellCheck={false}
                  aria-label="Rename watchlist"
                  className="w-20 rounded border border-zinc-700 bg-zinc-900 px-1 font-mono text-[11px] text-zinc-100 focus:outline-none"
                />
              ) : (
                <>
                  <span className="font-medium">{list.name}</span>
                  <span className="text-zinc-600">{list.symbols.length}</span>
                </>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => void createList()}
          aria-label="New watchlist"
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800"
        >
          +
        </button>
      </div>

      {lists.length === 0 ? (
        <EmptyState message="Create a watchlist to begin." />
      ) : (
        <>
          {/* Active-list toolbar */}
          <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
            <button
              type="button"
              onClick={() => void move('left')}
              aria-label="Move list left"
              className="rounded px-1 text-[11px] text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => void move('right')}
              aria-label="Move list right"
              className="rounded px-1 text-[11px] text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => void deleteActive()}
              aria-label="Delete watchlist"
              className="rounded px-1 text-[11px] text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
            >
              🗑
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowImport((v) => !v)}
                disabled={capabilityGap}
                className={`rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] ${
                  showImport ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-400 hover:bg-zinc-800'
                } disabled:opacity-40`}
              >
                import
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addSymbol();
                }}
                placeholder="add symbol"
                spellCheck={false}
                disabled={capabilityGap}
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 focus:outline-none disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => void addSymbol()}
                disabled={capabilityGap}
                className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          {/* Batch import drawer */}
          {showImport && !capabilityGap && (
            <div className="shrink-0 space-y-1.5 border-b border-zinc-800 bg-zinc-900/40 p-2">
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="Paste symbols (newline / comma / CSV)…"
                spellCheck={false}
                rows={3}
                aria-label="Symbols to import"
                className="w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 font-mono text-[11px] text-zinc-200 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runImport()}
                  disabled={importBusy || raw.trim().length === 0}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  {importBusy ? 'validating…' : 'validate & add'}
                </button>
                <label className="cursor-pointer rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800">
                  file
                  <input type="file" accept=".csv,.txt" onChange={(e) => void onFile(e)} className="hidden" />
                </label>
                {raw.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRaw('');
                      setSummary(null);
                    }}
                    className="text-[11px] text-zinc-600 hover:text-zinc-400"
                  >
                    clear
                  </button>
                )}
              </div>
              {summary && (
                <div className="text-[11px] text-zinc-400">
                  <span className="text-emerald-400">{summary.valid.length} added</span>
                  {' · '}
                  <span>{summary.duplicate.length} already in list</span>
                  {' · '}
                  <span className={summary.unknown.length > 0 ? 'text-amber-400' : ''}>
                    {summary.unknown.length} unknown
                  </span>
                  {summary.unknown.length > 0 && (
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
                      {summary.unknown.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div ref={ref} className="min-h-0 flex-1">
            <ModuleBody state={initial} missingCapabilities={missingCapabilities} emptyMessage="Watchlist is empty.">
              {() => (
                <DataTable
                  columns={columns}
                  rows={rows}
                  getRowKey={(q) => q.symbol}
                  height={size.height || 320}
                  rowHeight={26}
                  emptyLabel="Watchlist is empty."
                  onRowClick={(q) => executeInput(`${q.symbol} DES`)}
                />
              )}
            </ModuleBody>
          </div>
        </>
      )}
    </div>
  );
}
