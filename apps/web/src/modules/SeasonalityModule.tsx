import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { HistoricalSeries } from '@tyche/contracts';
import { seasonality } from '@tyche/analytics';
import { formatPercent } from '@tyche/ui';
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
 * SEAS — return seasonality: how the instrument has historically performed in each
 * calendar month (average month-end return, hit rate, best/worst) over its price
 * history. A small sample per month (about one per year) — descriptive of PAST
 * months only, not predictive and not investment advice.
 */
export function SeasonalityModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const data = useApiData(() => (symbol ? api.getHistory(symbol, { range: '5y', interval: '1d' }) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const candles = data.data?.candles ?? [];
  const stats = useMemo(() => seasonality(candles, symbol ?? ''), [candles, symbol]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · seasonality</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No price history for ${symbol}.`}>
          {() =>
            stats.observations === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">Not enough monthly history for {symbol}.</div>
            ) : (
              <div className="p-2">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="text-[10px] uppercase text-zinc-600">
                    <tr>
                      <th className="px-2 py-0.5 text-left font-medium">Month</th>
                      <th className="px-2 py-0.5 text-right font-medium">Avg</th>
                      <th className="px-2 py-0.5 text-right font-medium">Median</th>
                      <th className="px-2 py-0.5 text-right font-medium">Hit rate</th>
                      <th className="px-2 py-0.5 text-right font-medium">Best</th>
                      <th className="px-2 py-0.5 text-right font-medium">Worst</th>
                      <th className="px-2 py-0.5 text-right font-medium">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.months.map((m) => (
                      <tr key={m.month} className="border-b border-zinc-900">
                        <td className="px-2 py-0.5 text-zinc-400">{m.label}</td>
                        <td className={`px-2 py-0.5 text-right ${toneOf(m.avgReturn)}`}>{pct(m.avgReturn)}</td>
                        <td className={`px-2 py-0.5 text-right ${toneOf(m.medianReturn)}`}>{pct(m.medianReturn)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{pct(m.positiveRate)}</td>
                        <td className="px-2 py-0.5 text-right text-emerald-400/80">{pct(m.best)}</td>
                        <td className="px-2 py-0.5 text-right text-rose-400/80">{pct(m.worst)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-600">{m.count || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  {stats.observations} month-end returns
                  {stats.firstDate ? ` from ${stats.firstDate} to ${stats.lastDate}` : ''}. Each calendar month has only a
                  handful of observations (N ≈ one per year), so this is a descriptive tally of PAST months — not a
                  seasonal forecast, not investment advice.
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
