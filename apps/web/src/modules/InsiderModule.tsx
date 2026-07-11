import type { ModulePanelProps } from '@tyche/module-sdk';
import type { InsiderTransaction } from '@tyche/contracts';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';
import { safeHref } from './markdown';

function noSymbol(): Promise<EnvelopeResult<InsiderTransaction[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
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

/**
 * INSD — insider (Section 16) transactions from EDGAR Form 3/4/5 ownership
 * filings. Descriptive analytics only; not investment advice.
 */
export function InsiderModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const data = useApiData(() => (symbol ? api.getInsiderTransactions(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · insider transactions</span>
        {data.data && data.data.length > 0 && (
          <div className="ml-auto">
            <TableExport name={`${symbol}-insiders`} exportColumns={EXPORT_COLUMNS} rows={data.data} provenance={data.provenance} />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No insider transactions for ${symbol}.`}>
          {(rows) => (
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
                {rows.map((t, i) => {
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
          )}
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        SEC EDGAR Form 3/4/5 ownership filings · public data · descriptive, not advice.
      </p>
    </div>
  );
}
