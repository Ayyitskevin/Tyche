import { useMemo } from 'react';
import type { Quote } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, formatNumber, formatPercent, formatSigned } from '@tyche/ui';
import { WORLD_INDEX_REGIONS, WORLD_INDEX_SYMBOLS } from '../constants';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';
import { mergeQuotes } from './quotesCommon';

const LABELS = new Map(WORLD_INDEX_REGIONS.flatMap((r) => r.members.map((m) => [m.symbol, m.label] as const)));

function pctTone(v: number | null | undefined): string {
  return changeToneClass(v);
}

export function WorldIndicesModule({ missingCapabilities, reportProvenance }: ModulePanelProps) {
  const quotes = useApiData(() => api.getQuotes(WORLD_INDEX_SYMBOLS), []);
  useReportProvenance(reportProvenance, quotes.provenance);
  const live = useQuoteStream(WORLD_INDEX_SYMBOLS);

  const bySymbol = useMemo(() => {
    const merged = mergeQuotes(WORLD_INDEX_SYMBOLS, quotes.data ?? null, live);
    return new Map(merged.map((q) => [q.symbol, q]));
  }, [quotes.data, live]);

  return (
    <div className="h-full overflow-auto">
      <ModuleBody state={quotes} missingCapabilities={missingCapabilities} emptyMessage="No index data available.">
        {() => (
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Index</th>
                <th className="px-2 py-1.5 text-right font-medium">Last</th>
                <th className="px-2 py-1.5 text-right font-medium">Chg</th>
                <th className="px-2 py-1.5 text-right font-medium">%</th>
                <th className="px-2 py-1.5 text-right font-medium">YTD</th>
              </tr>
            </thead>
            {WORLD_INDEX_REGIONS.map((region) => {
              const rows = region.members
                .map((m) => bySymbol.get(m.symbol))
                .filter((q): q is Quote => Boolean(q))
                .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
              return (
                <tbody key={region.region}>
                    <tr className="bg-zinc-900/60">
                      <td colSpan={5} className="px-2 py-1 text-[10px] uppercase tracking-wide text-sky-300/80">
                        {region.region}
                      </td>
                    </tr>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-1 text-zinc-600">
                          No quotes for this region.
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
                          <td className={`px-2 py-1 text-right ${pctTone(q.change)}`}>{formatSigned(q.change)}</td>
                          <td className={`px-2 py-1 text-right ${pctTone(q.changePercent)}`}>{formatPercent(q.changePercent)}</td>
                          <td className={`px-2 py-1 text-right ${pctTone(q.ytdPercent)}`}>{formatPercent(q.ytdPercent)}</td>
                        </tr>
                      ))
                    )}
                </tbody>
              );
            })}
          </table>
        )}
      </ModuleBody>
    </div>
  );
}
