import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { InsiderTransaction } from '@tyche/contracts';
import { insiderActivity } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';
import { safeHref } from './markdown';

type View = 'transactions' | 'summary';

function noSymbol(): Promise<EnvelopeResult<InsiderTransaction[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

/** Compact USD so a multi-million-dollar total fits a terminal cell. */
function compactUsd(n: number | null): string {
  if (n === null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Signed, compact, whole-share count: '+1.2M', '-340K' — never fabricated cents. */
function signedShares(n: number): string {
  return `${n >= 0 ? '+' : '-'}${formatNumber(Math.abs(n), { compact: true, decimals: 0 })}`;
}

const EXPORT_COLUMNS: Array<ExportColumn<InsiderTransaction>> = [
  { key: 'date', label: 'Date', value: (t) => t.date },
  { key: 'owner', label: 'Owner', value: (t) => t.owner },
  { key: 'relationship', label: 'Relationship', value: (t) => t.relationship ?? '' },
  { key: 'code', label: 'Code', value: (t) => t.code },
  { key: 'acquiredDisposed', label: 'A/D', value: (t) => t.acquiredDisposed ?? '' },
  { key: 'shares', label: 'Shares', value: (t) => t.shares },
  { key: 'pricePerShare', label: 'Price', value: (t) => t.pricePerShare ?? null },
  { key: 'sharesOwnedFollowing', label: 'Owned after', value: (t) => t.sharesOwnedFollowing ?? null },
];

/** Buy (acquired) greens, sell (disposed) reds; other codes stay neutral. */
function tone(t: InsiderTransaction): string {
  if (t.acquiredDisposed === 'A') return 'text-emerald-400';
  if (t.acquiredDisposed === 'D') return 'text-rose-400';
  return 'text-zinc-300';
}

function label(t: InsiderTransaction): string {
  const dir = t.acquiredDisposed === 'A' ? 'Buy' : t.acquiredDisposed === 'D' ? 'Sell' : '—';
  return `${dir} (${t.code || '?'})`;
}

function toneOf(n: number): string {
  return n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-zinc-300';
}

/**
 * INSD — insider (Section 16) transactions from EDGAR Form 3/4/5 ownership
 * filings, with a **Summary** view aggregating net buying/selling, distinct
 * insiders, cluster flags, and a per-role breakdown. Descriptive analytics only;
 * not investment advice.
 */
export function InsiderModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const data = useApiData(() => (symbol ? api.getInsiderTransactions(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const view: View = state.view === 'summary' ? 'summary' : 'transactions';
  const rows = data.data ?? [];
  const summary = useMemo(() => insiderActivity(rows), [rows]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · insiders</span>
        <div className="flex overflow-hidden rounded border border-zinc-700">
          {(['transactions', 'summary'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setState({ view: v })}
              className={`px-1.5 py-0.5 text-[11px] ${view === v ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'}`}
            >
              {v === 'transactions' ? 'Transactions' : 'Summary'}
            </button>
          ))}
        </div>
        {view === 'transactions' && data.data && data.data.length > 0 && (
          <div className="ml-auto">
            <TableExport name={`${symbol}-insiders`} exportColumns={EXPORT_COLUMNS} rows={data.data} provenance={data.provenance} />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No insider transactions for ${symbol}.`}>
          {(txns) =>
            view === 'summary' ? (
              <div className="p-2">
                <div className="mb-2 grid grid-cols-3 gap-2 text-[11px]">
                  <Tile label="Net shares" value={signedShares(summary.netShares)} tone={toneOf(summary.netShares)} />
                  <Tile
                    label={summary.valueComplete ? 'Net value' : 'Net value (priced only)'}
                    value={summary.netValue == null ? '—' : `${summary.valueComplete ? '' : '~'}${compactUsd(summary.netValue)}`}
                    tone={summary.netValue == null || !summary.valueComplete ? '' : toneOf(summary.netValue)}
                  />
                  <Tile label="Transactions" value={String(summary.transactionCount)} />
                  <Tile label="Acquired" value={`${summary.buyCount} · ${formatNumber(summary.buyShares, { compact: true, decimals: 0 })} sh`} tone="text-emerald-400" />
                  <Tile label="Disposed" value={`${summary.sellCount} · ${formatNumber(summary.sellShares, { compact: true, decimals: 0 })} sh`} tone="text-rose-400" />
                  <Tile
                    label="Distinct insiders"
                    value={`${summary.distinctBuyers} acq · ${summary.distinctSellers} disp`}
                  />
                </div>
                {(summary.clusterBuy || summary.clusterSell) && (
                  <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
                    {summary.clusterBuy && (
                      <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                        Cluster buy · {summary.openMarketBuyers} open-market purchasers
                      </span>
                    )}
                    {summary.clusterSell && (
                      <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
                        Cluster sell · {summary.openMarketSellers} open-market sellers
                      </span>
                    )}
                  </div>
                )}
                {summary.byRole.length > 0 && (
                  <table className="w-full border-collapse font-mono text-[11px]">
                    <thead className="text-[10px] uppercase text-zinc-600">
                      <tr>
                        <th className="px-2 py-0.5 text-left font-medium">Role</th>
                        <th className="px-2 py-0.5 text-right font-medium">Acquired</th>
                        <th className="px-2 py-0.5 text-right font-medium">Disposed</th>
                        <th className="px-2 py-0.5 text-right font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byRole.map((r) => (
                        <tr key={r.role} className="border-b border-zinc-900">
                          <td className="px-2 py-0.5 text-zinc-300">{r.role}</td>
                          <td className="px-2 py-0.5 text-right text-emerald-400">{formatNumber(r.buyShares, { compact: true, decimals: 0 })}</td>
                          <td className="px-2 py-0.5 text-right text-rose-400">{formatNumber(r.sellShares, { compact: true, decimals: 0 })}</td>
                          <td className={`px-2 py-0.5 text-right ${toneOf(r.netShares)}`}>{signedShares(r.netShares)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  A descriptive summary of the reported Form 3/4/5 transactions above ({summary.firstDate ?? '—'} to{' '}
                  {summary.lastDate ?? '—'}). Value is summed only over priced transactions. Not a signal, not advice.
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Date</th>
                    <th className="px-2 py-1 text-left font-medium">Owner</th>
                    <th className="px-2 py-1 text-left font-medium">Type</th>
                    <th className="px-2 py-1 text-right font-medium">Shares</th>
                    <th className="px-2 py-1 text-right font-medium">Price</th>
                    <th className="px-2 py-1 text-right font-medium">Owned after</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t, i) => {
                    const href = t.url ? safeHref(t.url) : null;
                    return (
                      <tr key={`${t.date}-${t.owner}-${i}`} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                        <td className="px-2 py-1 text-zinc-400">{t.date}</td>
                        <td className="px-2 py-1 text-zinc-300">
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {t.owner}
                            </a>
                          ) : (
                            t.owner
                          )}
                          {t.relationship ? <span className="text-zinc-600"> · {t.relationship}</span> : null}
                        </td>
                        <td className={`px-2 py-1 ${tone(t)}`}>{label(t)}</td>
                        <td className="px-2 py-1 text-right text-zinc-200">{formatNumber(t.shares, { compact: true, decimals: 0 })}</td>
                        <td className="px-2 py-1 text-right text-zinc-200">{formatNumber(t.pricePerShare ?? null, { decimals: 2 })}</td>
                        <td className="px-2 py-1 text-right text-zinc-400">
                          {formatNumber(t.sharesOwnedFollowing ?? null, { compact: true, decimals: 0 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        SEC EDGAR Form 3/4/5 ownership filings · public data · descriptive, not advice.
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
