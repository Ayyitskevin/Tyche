import { useMemo, useState } from 'react';
import type { Portfolio, Quote } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { markPortfolio, type PositionMark } from '@tyche/analytics';
import { DataTable, type Column, changeToneClass, formatCurrency, formatNumber, formatPercent } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { useElementSize } from '../providers/useElementSize';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { parsePortfolioCsv, upsertPosition, upsertPositions } from './portfolioInput';

function priceColumns(remove: (symbol: string) => void): Array<Column<PositionMark>> {
  const money = (v: number | null) => formatCurrency(v);
  const toned = (v: number | null, text: string) => <span className={changeToneClass(v)}>{text}</span>;
  return [
    {
      key: 'symbol',
      header: 'Symbol',
      width: '1.3fr',
      render: (m) => (
        <button type="button" onClick={() => executeInput(`${m.symbol} DES`)} className="text-sky-300 hover:underline">
          {m.symbol}
        </button>
      ),
    },
    { key: 'qty', header: 'Qty', align: 'right', render: (m) => formatNumber(m.quantity, { decimals: 4 }) },
    { key: 'avg', header: 'Avg', align: 'right', render: (m) => money(m.averageCost) },
    { key: 'last', header: 'Last', align: 'right', render: (m) => money(m.marketPrice) },
    { key: 'value', header: 'Value', align: 'right', render: (m) => money(m.marketValue) },
    { key: 'pnl', header: 'P&L', align: 'right', render: (m) => toned(m.unrealizedPnl, money(m.unrealizedPnl)) },
    {
      key: 'pnlPct',
      header: 'P&L%',
      align: 'right',
      render: (m) => toned(m.unrealizedPnlPct, formatPercent(m.unrealizedPnlPct)),
    },
    { key: 'weight', header: 'Wt%', align: 'right', render: (m) => formatPercent(m.weight) },
    {
      key: 'remove',
      header: '',
      width: '28px',
      align: 'center',
      render: (m) => (
        <button
          type="button"
          aria-label={`Remove ${m.symbol}`}
          onClick={() => remove(m.symbol)}
          className="text-zinc-600 hover:text-red-400"
        >
          ✕
        </button>
      ),
    },
  ];
}

export function PortfolioModule({ symbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const portfolios = useApiData(() => api.getPortfolios(), []);
  const active: Portfolio | null = portfolios.data?.[0] ?? null;
  const positions = useMemo(() => active?.positions ?? [], [active]);
  const symbols = useMemo(() => [...new Set(positions.map((p) => p.symbol))], [positions]);

  const initial = useApiData(
    () =>
      symbols.length > 0
        ? api.getQuotes(symbols)
        : Promise.resolve({ ok: true as const, data: [] as Quote[], provenance: null }),
    [symbols.join(',')],
  );
  useReportProvenance(reportProvenance, initial.provenance);
  const live = useQuoteStream(symbols);
  const [ref, size] = useElementSize<HTMLDivElement>();

  const [sym, setSym] = useState(symbol ?? '');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('');
  const [importNote, setImportNote] = useState<string | null>(null);

  // Merge the initial batch with live stream ticks into one price lookup.
  const prices = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of initial.data ?? []) map[q.symbol] = q.price;
    for (const [s, q] of Object.entries(live)) map[s] = q.price;
    return map;
  }, [initial.data, live]);

  const { marks, summary } = useMemo(
    () => markPortfolio(positions, (s) => prices[s] ?? null, active?.cash ?? 0),
    [positions, prices, active?.cash],
  );

  useReportSummary(
    reportSummary,
    positions.length > 0
      ? `Portfolio: ${formatCurrency(summary.totalValue)} value, ${formatPercent(summary.unrealizedPnlPct)} unrealized, ${summary.positionCount} positions`
      : null,
  );

  async function persist(nextPositions: Portfolio['positions']) {
    if (active) {
      await api.savePortfolio({ ...active, positions: nextPositions });
    } else {
      await api.savePortfolio({ name: 'My Portfolio', baseCurrency: 'USD', cash: 0, positions: nextPositions });
    }
    portfolios.reload();
  }

  async function addPosition() {
    const s = sym.trim().toUpperCase();
    const q = Number(qty.trim());
    if (!/[A-Za-z]/.test(s) || qty.trim() === '' || !Number.isFinite(q)) return;
    const c = cost.trim() === '' ? null : Number(cost.trim());
    const averageCost = c !== null && Number.isFinite(c) ? c : null;
    await persist(upsertPosition(positions, { symbol: s, quantity: q, averageCost }));
    setSym(symbol ?? '');
    setQty('');
    setCost('');
  }

  async function importCsv() {
    const { positions: parsed, errors } = parsePortfolioCsv(csv);
    if (parsed.length === 0) {
      setImportNote(errors.length > 0 ? `No valid rows (${errors.length} skipped).` : 'No rows found.');
      return;
    }
    await persist(upsertPositions(positions, parsed));
    setCsv('');
    setShowImport(false);
    setImportNote(`Imported ${parsed.length} holding${parsed.length === 1 ? '' : 's'}${errors.length ? `, ${errors.length} skipped` : ''}.`);
  }

  async function removePosition(target: string) {
    await persist(positions.filter((p) => p.symbol !== target));
  }

  const columns = useMemo(() => priceColumns(removePosition), [positions, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const controlClass =
    'rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none';
  const pnlTone = changeToneClass(summary.unrealizedPnl);

  return (
    <div className="flex h-full flex-col">
      {/* Summary band */}
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 border-b border-zinc-800 px-2 py-1.5 font-mono text-[11px]">
        <span className="text-zinc-500">
          Value <span className="text-zinc-200">{formatCurrency(summary.totalValue)}</span>
        </span>
        <span className="text-zinc-500">
          Mkt <span className="text-zinc-300">{formatCurrency(summary.marketValue)}</span>
        </span>
        <span className="text-zinc-500">
          Cash <span className="text-zinc-300">{formatCurrency(summary.cash)}</span>
        </span>
        <span className="text-zinc-500">
          Unreal P&L{' '}
          <span className={pnlTone}>
            {formatCurrency(summary.unrealizedPnl)} ({formatPercent(summary.unrealizedPnlPct)})
          </span>
        </span>
        <span className="ml-auto text-zinc-600">
          {summary.positionCount} pos{summary.pricedCount < summary.positionCount ? ` · ${summary.pricedCount} priced` : ''}
        </span>
      </div>

      {/* Add / import controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        <input
          aria-label="Position symbol"
          value={sym}
          onChange={(e) => setSym(e.target.value)}
          placeholder="symbol"
          spellCheck={false}
          className={`w-16 font-mono ${controlClass}`}
        />
        <input
          aria-label="Position quantity"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addPosition()}
          placeholder="qty"
          inputMode="decimal"
          className={`w-16 font-mono ${controlClass}`}
        />
        <input
          aria-label="Position average cost"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addPosition()}
          placeholder="avg cost"
          inputMode="decimal"
          className={`w-20 font-mono ${controlClass}`}
        />
        <button
          type="button"
          onClick={() => void addPosition()}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          add
        </button>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className={`ml-auto rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] ${
            showImport ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          import CSV
        </button>
      </div>

      {showImport && (
        <div className="shrink-0 space-y-1 border-b border-zinc-800 px-2 py-1.5">
          <textarea
            aria-label="Holdings CSV"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={'symbol,quantity,avgCost\nAAPL,10,170.50\nMSFT,5,400'}
            rows={3}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void importCsv()}
              className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              add rows
            </button>
          </div>
        </div>
      )}
      {importNote && <div className="shrink-0 px-2 py-1 text-[10px] text-zinc-500">{importNote}</div>}

      {/* Positions table */}
      <div ref={ref} className="min-h-0 flex-1">
        <ModuleBody state={initial} missingCapabilities={missingCapabilities} emptyMessage="No positions yet.">
          {() =>
            positions.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">
                No positions yet. Add a holding above, or import a CSV — Tyche values them read-only and places no orders.
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={marks}
                getRowKey={(m) => m.symbol}
                height={size.height || 320}
                rowHeight={26}
              />
            )
          }
        </ModuleBody>
      </div>

      <div className="shrink-0 border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-600">
        Read-only analytics · marks update on the live quote stream · Tyche places no orders.
      </div>
    </div>
  );
}
