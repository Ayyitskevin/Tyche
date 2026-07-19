import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { FundingRate } from '@tyche/contracts';
import { fundingAnalytics, type FundingRegime } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';

const REGIME_TONE: Record<FundingRegime, string> = {
  rich: 'text-amber-400',
  elevated: 'text-sky-300',
  neutral: 'text-zinc-400',
  negative: 'text-emerald-400',
};

function pct1(n: number | null): string {
  return n === null ? '—' : `${formatNumber(n, { decimals: 1 })}%`;
}
function signedPct1(n: number | null): string {
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${formatNumber(n, { decimals: 1 })}%`;
}
function signedPct2(n: number | null): string {
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${formatNumber(n, { decimals: 2 })}%`;
}
function bps0(n: number | null): string {
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${formatNumber(n, { decimals: 0 })} bps`;
}
function share(n: number | null): string {
  return n === null ? '—' : `${formatNumber(n * 100, { decimals: 0 })}%`;
}

/**
 * CARRY — perp funding carry analytics over the existing `fundingRates` board.
 * For each perpetual: the daily/annualized carry, the mark-vs-index premium
 * (null when the venue omits a mark or index price — never fabricated), a
 * documented carry-regime label, and how rich the carry is versus the rest of
 * the board (deviation from the cross-sectional median + percentile). Descriptive
 * market-structure analytics — not a trade signal, not investment advice.
 */
export function FundingAnalyticsModule({ symbol, setSymbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const data = useApiData<FundingRate[]>(() => api.getFunding(symbol ? [symbol] : []), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const a = useMemo(() => fundingAnalytics(data.data ?? []), [data.data]);
  const top = a.rows[0];
  useReportSummary(
    reportSummary,
    top ? `Carry: ${top.symbol} ${signedPct1(top.annualizedPct)} APR (${top.regime}), median ${pct1(a.medianAnnualizedPct)}` : null,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol ?? 'crypto perps'} · funding carry</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage="No funding data.">
          {() =>
            a.rows.length === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">No funding data.</div>
            ) : (
              <div className="p-2">
                <div className="mb-2 grid grid-cols-4 gap-2 text-[11px]">
                  <Tile label="Median APR" value={pct1(a.medianAnnualizedPct)} />
                  <Tile label="Longs pay" value={share(a.positiveShare)} />
                  <Tile label="Dispersion σ" value={pct1(a.dispersionPct)} />
                  <Tile label="Perps" value={String(a.count)} />
                </div>
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="text-[10px] uppercase text-zinc-600">
                    <tr>
                      <th className="px-2 py-0.5 text-left font-medium">Symbol</th>
                      <th className="px-2 py-0.5 text-right font-medium">Daily</th>
                      <th className="px-2 py-0.5 text-right font-medium">Ann. carry</th>
                      <th className="px-2 py-0.5 text-right font-medium">Premium</th>
                      <th className="px-2 py-0.5 text-left font-medium">Regime</th>
                      <th className="px-2 py-0.5 text-right font-medium">vs med</th>
                      <th className="px-2 py-0.5 text-right font-medium">%ile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.rows.map((r) => (
                      <tr key={`${r.venue}-${r.symbol}`} className="border-b border-zinc-900">
                        <td className="px-2 py-0.5">
                          <button type="button" className="text-sky-300 hover:underline" onClick={() => setSymbol?.(r.symbol)}>
                            {r.symbol}
                          </button>
                        </td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{signedPct2(r.dailyPct)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-200">{signedPct1(r.annualizedPct)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{bps0(r.premiumBps)}</td>
                        <td className={`px-2 py-0.5 ${REGIME_TONE[r.regime]}`}>{r.regime}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-400">{signedPct1(r.deviationPct)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-400">{formatNumber(r.percentile, { decimals: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  Daily/annualized carry = funding rate × (24 ÷ interval) × 100 (× 365 for APR). Premium =
                  (mark − index) ÷ index, in basis points; shown only when the venue reports both. Regime bands:
                  rich ≥ +30% APR · elevated +10…30% · neutral ±10% · negative &lt; −10%. Positive funding means longs
                  pay shorts. Descriptive market-structure analytics — not a signal, not advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        Perp funding board × cross-sectional carry math · descriptive, not advice.
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-mono text-zinc-200">{value}</div>
    </div>
  );
}
