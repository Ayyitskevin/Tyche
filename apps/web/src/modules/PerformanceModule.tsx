import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { HistoricalSeries } from '@tyche/contracts';
import { performanceStats } from '@tyche/analytics';
import { formatNumber, formatPercent } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

function noSymbol(): Promise<EnvelopeResult<HistoricalSeries>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function toneOf(n: number | null): string {
  if (n === null) return 'text-zinc-500';
  return n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-zinc-300';
}

/** Signed percent from a fraction; '—' when null. */
function pct(n: number | null): string {
  return n === null ? '—' : formatPercent(n * 100);
}

/**
 * PERF — a multi-horizon performance & risk snapshot for one instrument. Trailing
 * total returns (1W–3Y, YTD) are anchored to the last close; risk stats (annualized
 * volatility, max/current drawdown, Sharpe, best/worst day, % positive days) are
 * computed over the loaded daily history. Descriptive analytics over past prices —
 * not predictive, not investment advice.
 */
export function PerformanceModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const data = useApiData(
    () => (symbol ? api.getHistory(symbol, { range: '5y', interval: '1d' }) : noSymbol()),
    [symbol],
  );
  useReportProvenance(reportProvenance, data.provenance);
  const candles = data.data?.candles ?? [];
  const stats = useMemo(() => performanceStats(candles, symbol ?? ''), [candles, symbol]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {symbol} · performance &amp; risk{stats.asOf ? ` · as of ${stats.asOf}` : ''}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No price history for ${symbol}.`}>
          {() =>
            stats.observations === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">No price history for {symbol}.</div>
            ) : (
              <div className="space-y-3 p-2">
                <section>
                  <h3 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-600">Trailing return</h3>
                  <table className="w-full border-collapse font-mono text-[11px]">
                    <tbody>
                      {stats.trailing.map((t) => (
                        <tr key={t.key} className="border-b border-zinc-900">
                          <td className="px-2 py-0.5 text-zinc-400">{t.label}</td>
                          <td className={`px-2 py-0.5 text-right ${toneOf(t.return)}`}>{pct(t.return)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-600">Risk &amp; distribution</h3>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <Tile label="Last price" value={formatNumber(stats.lastPrice, { decimals: 2 })} />
                    <Tile label="Ann. volatility" value={pct(stats.annualizedVolatility)} />
                    <Tile label="Max drawdown" value={pct(stats.maxDrawdown)} tone={toneOf(stats.maxDrawdown)} />
                    <Tile label="Current drawdown" value={pct(stats.currentDrawdown)} tone={toneOf(stats.currentDrawdown)} />
                    <Tile label="Sharpe (rf 0%)" value={stats.sharpe === null ? '—' : formatNumber(stats.sharpe, { decimals: 2 })} />
                    <Tile label="% positive days" value={pct(stats.positiveRate)} />
                    <Tile label="Best day" value={pct(stats.bestDay)} tone={toneOf(stats.bestDay)} />
                    <Tile label="Worst day" value={pct(stats.worstDay)} tone={toneOf(stats.worstDay)} />
                  </div>
                </section>

                <p className="text-[10px] leading-snug text-zinc-600">
                  {stats.observations} daily bars from {stats.firstDate} to {stats.asOf}. Trailing returns are anchored to
                  the last close (not today); risk stats assume daily bars and a 0% risk-free rate. Descriptive analytics
                  over past prices — not predictive, not investment advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        Computed from loaded price history · descriptive, not advice.
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
