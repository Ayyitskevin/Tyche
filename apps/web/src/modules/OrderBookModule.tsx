import { useEffect, useState } from 'react';
import type { OrderBook } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance, useReportSummary } from './common';
import { buildBookView, type LadderRow } from './orderBookView';

const DEPTHS = [10, 20, 50];
const POLL_MS = 2500;

function noSymbol(): Promise<EnvelopeResult<OrderBook>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function Row({ row, side }: { row: LadderRow; side: 'bid' | 'ask' }) {
  const bar = side === 'bid' ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)';
  const tone = side === 'bid' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div
      className="grid grid-cols-3 gap-1 px-2 py-[1px] font-mono text-[11px]"
      style={{
        backgroundImage: `linear-gradient(to ${side === 'bid' ? 'left' : 'right'}, ${bar} ${Math.round(row.share * 100)}%, transparent ${Math.round(row.share * 100)}%)`,
      }}
    >
      <span className={tone}>{formatNumber(row.price)}</span>
      <span className="text-right text-zinc-300">{formatNumber(row.size, { decimals: 4 })}</span>
      <span className="text-right text-zinc-500">{formatNumber(row.cumulative, { decimals: 4 })}</span>
    </div>
  );
}

/**
 * BOOK — a Level-2 depth ladder: asks stacked above the spread row, bids below,
 * cumulative-size bars, and an imbalance readout. Polls the snapshot endpoint;
 * live for crypto pairs when a venue adapter (binance) is enabled, deterministic
 * in mock mode.
 */
export function OrderBookModule({ symbol, state, setState, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const depth = DEPTHS.includes(Number(state.depth)) ? Number(state.depth) : 20;
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPoll((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const book = useApiData<OrderBook>(
    () => (symbol ? api.getOrderBook(symbol, depth) : noSymbol()),
    [symbol, depth, poll],
  );
  useReportProvenance(reportProvenance, book.provenance);
  const view = book.data ? buildBookView(book.data, depth) : null;
  useReportSummary(
    reportSummary,
    view && view.mid !== null
      ? `${symbol} order book: mid ${formatNumber(view.mid)}, spread ${view.spreadPct?.toFixed(3)}%, bid share ${(100 * (view.imbalance ?? 0)).toFixed(0)}%`
      : null,
  );

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-zinc-900 px-2 py-1 text-[10px] text-zinc-500">
        <span className="uppercase tracking-wide">Depth</span>
        {DEPTHS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setState({ depth: d })}
            className={`rounded px-1.5 py-0.5 ${d === depth ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
          >
            {d}
          </button>
        ))}
        {view && view.imbalance !== null && (
          <span className="ml-auto">
            bid share <span className="text-zinc-300">{(view.imbalance * 100).toFixed(0)}%</span>
          </span>
        )}
      </div>
      <ModuleBody state={book} missingCapabilities={missingCapabilities} emptyMessage="No book for this symbol.">
        {() =>
          view ? (
            <div className="flex-1 overflow-auto py-1">
              <div className="grid grid-cols-3 gap-1 px-2 pb-1 text-[10px] uppercase tracking-wide text-zinc-600">
                <span>Price</span>
                <span className="text-right">Size</span>
                <span className="text-right">Cum</span>
              </div>
              {[...view.asks].reverse().map((row) => (
                <Row key={`a-${row.price}`} row={row} side="ask" />
              ))}
              <div className="my-1 flex items-baseline justify-between border-y border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[11px]">
                <span className="text-zinc-200">{view.mid !== null ? formatNumber(view.mid) : '—'}</span>
                <span className="text-zinc-500">
                  spread {view.spread !== null ? formatNumber(view.spread) : '—'}
                  {view.spreadPct !== null ? ` (${view.spreadPct.toFixed(3)}%)` : ''}
                </span>
              </div>
              {view.bids.map((row) => (
                <Row key={`b-${row.price}`} row={row} side="bid" />
              ))}
            </div>
          ) : null
        }
      </ModuleBody>
    </div>
  );
}
