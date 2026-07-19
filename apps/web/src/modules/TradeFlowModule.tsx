import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { TradePrint } from '@tyche/contracts';
import { tradeFlow } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance, useReportSummary } from './common';

function noSymbol(): Promise<EnvelopeResult<TradePrint[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function num(n: number | null, decimals = 2): string {
  return n === null ? '—' : formatNumber(n, { decimals });
}
function qty(n: number | null): string {
  return n === null ? '—' : formatNumber(n, { decimals: n >= 1000 ? 1 : 2, compact: true });
}
function pct0(n: number | null): string {
  return n === null ? '—' : `${formatNumber(n * 100, { decimals: 0 })}%`;
}
function signedQty(n: number): string {
  return `${n > 0 ? '+' : ''}${formatNumber(n, { decimals: n >= 1000 || n <= -1000 ? 1 : 2, compact: true })}`;
}

/**
 * FLOW — order-flow analytics over the trade-tape snapshot for a symbol: traded
 * volume and VWAP, the buy/sell aggressor split and net flow, and the largest
 * print. Aggressor splits count only prints the venue classified (buy/sell);
 * unclassified prints are tallied separately and never guessed. Descriptive
 * market-microstructure analytics — not a signal, not advice.
 */
export function TradeFlowModule({ symbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const data = useApiData<TradePrint[]>(() => (symbol ? api.getTrades(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const f = useMemo(() => tradeFlow(data.data ?? []), [data.data]);
  useReportSummary(
    reportSummary,
    f.count > 0 ? `${symbol} flow: ${f.count} prints, VWAP ${num(f.vwap)}, buys ${pct0(f.buyShare)}` : null,
  );

  if (!symbol) return <SymbolRequired />;

  // Buy/sell pressure bar over classified volume.
  const classified = f.buyVolume + f.sellVolume;
  const buyPct = classified > 0 ? (f.buyVolume / classified) * 100 : 50;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · order flow</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No trades for ${symbol}.`}>
          {() =>
            f.count === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">No trades for {symbol}.</div>
            ) : (
              <div className="p-2">
                <div className="mb-2 grid grid-cols-4 gap-2 text-[11px]">
                  <Tile label="VWAP" value={num(f.vwap)} />
                  <Tile label="Buy share" value={pct0(f.buyShare)} />
                  <Tile label="Net flow" value={signedQty(f.netVolume)} tone={f.netVolume > 0 ? 'text-emerald-400' : f.netVolume < 0 ? 'text-red-400' : 'text-zinc-200'} />
                  <Tile label="Prints" value={String(f.count)} />
                </div>

                {/* Buy vs sell pressure (classified volume) */}
                <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                  <span className="text-emerald-400/80">buy {qty(f.buyVolume)}</span>
                  <span className="text-red-400/80">sell {qty(f.sellVolume)}</span>
                </div>
                <div className="mb-2 flex h-2 w-full overflow-hidden rounded bg-zinc-800">
                  <div className="h-full bg-emerald-500/70" style={{ width: `${buyPct}%` }} />
                  <div className="h-full bg-red-500/70" style={{ width: `${100 - buyPct}%` }} />
                </div>

                <table className="w-full border-collapse font-mono text-[11px]">
                  <tbody>
                    <Row label="Traded volume" value={qty(f.totalVolume)} />
                    <Row label="Traded notional" value={qty(f.notional)} />
                    <Row label="Avg print size" value={qty(f.avgSize)} />
                    <Row label="Net notional (signed)" value={signedQty(f.netNotional)} />
                    <Row label="Unclassified vol" value={qty(f.unknownVolume)} />
                    <Row
                      label="Largest print"
                      value={f.largest ? `${qty(f.largest.size)} @ ${num(f.largest.price)} (${f.largest.side})` : '—'}
                    />
                    <Row label="High / Low" value={`${num(f.high)} / ${num(f.low)}`} />
                  </tbody>
                </table>

                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  VWAP = Σ(price × size) ÷ Σ size. Buy share and net flow count only prints the venue tagged
                  buy/sell; unclassified prints are tallied separately, never guessed. Net notional signs each print
                  (buy +, sell −). A trade-tape snapshot is a window, not the full session. Descriptive
                  market-microstructure analytics — not a signal, not advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        Trade tape × order-flow math · descriptive, not advice.
      </p>
    </div>
  );
}

function Tile({ label, value, tone = 'text-zinc-200' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`font-mono ${tone}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-zinc-900">
      <td className="px-2 py-0.5 text-zinc-500">{label}</td>
      <td className="px-2 py-0.5 text-right text-zinc-300">{value}</td>
    </tr>
  );
}
