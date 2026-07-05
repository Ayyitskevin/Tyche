import { useMemo } from 'react';
import type { Quote } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, formatNumber, formatPercent, formatSigned } from '@tyche/ui';
import { COMMODITY_GROUPS, COMMODITY_SYMBOLS } from '../constants';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';
import { mergeQuotes } from './quotesCommon';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';

const LABELS = new Map(COMMODITY_GROUPS.flatMap((g) => g.members.map((m) => [m.symbol, m.label] as const)));

const EXPORT_COLUMNS: Array<ExportColumn<Quote>> = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'name', label: 'Commodity', value: (q) => LABELS.get(q.symbol) ?? q.symbol },
  { key: 'price', label: 'Last' },
  { key: 'change', label: 'Chg' },
  { key: 'changePercent', label: '% Chg' },
  { key: 'ytdPercent', label: 'YTD %' },
];

/**
 * COMM — the commodities board, grouped Energy/Metals/Agriculture with last,
 * change, %, and YTD. Rows click through to the instrument. Demo values are
 * synthetic seeds; real futures feeds are licensed and stay out of scope.
 */
export function CommoditiesModule({ missingCapabilities, reportProvenance }: ModulePanelProps) {
  const quotes = useApiData(() => api.getQuotes(COMMODITY_SYMBOLS), []);
  useReportProvenance(reportProvenance, quotes.provenance);
  const live = useQuoteStream(COMMODITY_SYMBOLS);

  const bySymbol = useMemo(() => {
    const merged = mergeQuotes(COMMODITY_SYMBOLS, quotes.data ?? null, live);
    return new Map(merged.map((q) => [q.symbol, q]));
  }, [quotes.data, live]);

  const exportRows = useMemo(
    () => COMMODITY_SYMBOLS.map((s) => bySymbol.get(s)).filter((q): q is Quote => Boolean(q)),
    [bySymbol],
  );

  return (
    <div className="flex h-full flex-col">
      <ModuleBody state={quotes} missingCapabilities={missingCapabilities} emptyMessage="No commodity data available.">
        {() => (
          <>
          <div className="flex shrink-0 justify-end border-b border-zinc-800 px-2 py-1">
            <TableExport name="commodities" exportColumns={EXPORT_COLUMNS} rows={exportRows} provenance={quotes.provenance} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Commodity</th>
                <th className="px-2 py-1.5 text-right font-medium">Last</th>
                <th className="px-2 py-1.5 text-right font-medium">Chg</th>
                <th className="px-2 py-1.5 text-right font-medium">%</th>
                <th className="px-2 py-1.5 text-right font-medium">YTD</th>
              </tr>
            </thead>
            {COMMODITY_GROUPS.map((group) => {
              const rows = group.members
                .map((m) => bySymbol.get(m.symbol))
                .filter((q): q is Quote => Boolean(q))
                .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
              return (
                <tbody key={group.group}>
                  <tr className="bg-zinc-900/60">
                    <td colSpan={5} className="px-2 py-1 text-[10px] uppercase tracking-wide text-sky-300/80">
                      {group.group}
                    </td>
                  </tr>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-1 text-zinc-600">
                        No quotes for this group.
                      </td>
                    </tr>
                  ) : (
                    rows.map((q) => (
                      <tr
                        key={q.symbol}
                        onClick={() => executeInput(`${q.symbol} DES`)}
                        className="cursor-pointer border-b border-zinc-900 hover:bg-zinc-900/40"
                      >
                        <td className="px-2 py-1">
                          <span className="text-zinc-200">{LABELS.get(q.symbol) ?? q.symbol}</span>{' '}
                          <span className="text-[10px] text-zinc-600">{q.symbol}</span>
                        </td>
                        <td className="px-2 py-1 text-right text-zinc-200">{formatNumber(q.price)}</td>
                        <td className={`px-2 py-1 text-right ${changeToneClass(q.change)}`}>{formatSigned(q.change)}</td>
                        <td className={`px-2 py-1 text-right ${changeToneClass(q.changePercent)}`}>{formatPercent(q.changePercent)}</td>
                        <td className={`px-2 py-1 text-right ${changeToneClass(q.ytdPercent)}`}>{formatPercent(q.ytdPercent)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              );
            })}
          </table>
          </div>
          </>
        )}
      </ModuleBody>
    </div>
  );
}
