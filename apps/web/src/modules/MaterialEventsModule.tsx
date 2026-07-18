import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Filing } from '@tyche/contracts';
import { eightKEvents, type EightKEvent } from '@tyche/analytics';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useWorkspaceStore } from '../state/workspaceStore';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

function noSymbol(): Promise<EnvelopeResult<Filing[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

/** Category → chip colors. Neutral fallback for unknown/other so nothing is over-signalled. */
const CATEGORY_TONE: Record<string, string> = {
  'Financial Results': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  'M&A / Assets': 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  'Business & Operations': 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  'Debt & Obligations': 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  'Securities & Listing': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  Accounting: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  'Management & Governance': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  'Asset-Backed Securities': 'border-teal-500/40 bg-teal-500/10 text-teal-300',
  'Regulation FD': 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
  'Other Events': 'border-zinc-600 bg-zinc-800/40 text-zinc-300',
  Exhibits: 'border-zinc-700 bg-zinc-800/30 text-zinc-400',
  Other: 'border-zinc-700 bg-zinc-800/30 text-zinc-400',
};

function toneFor(category: string): string {
  return CATEGORY_TONE[category] ?? CATEGORY_TONE.Other!;
}

/**
 * MEVT — material corporate events reported via SEC Form 8-K filings. Decodes the
 * filer-tagged 8-K item taxonomy (e.g. 2.02 Results, 5.02 Officer change, 1.05
 * Cyber incident) into a plain-language timeline. Descriptive — a labeled view of
 * *reported* filings, not a signal or investment advice.
 */
export function MaterialEventsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const data = useApiData(() => (symbol ? api.getFilings(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const rows = data.data ?? [];
  const activity = useMemo(() => eightKEvents(rows), [rows]);
  const openPanel = useWorkspaceStore((s) => s.openPanel);

  if (!symbol) return <SymbolRequired />;

  function openFiling(e: EightKEvent) {
    openPanel({
      moduleId: 'filing-viewer',
      commandId: 'CFV',
      symbol,
      title: `8-K ${symbol}`,
      w: 6,
      h: 14,
      state: {
        filingUrl: e.url,
        filingForm: e.form,
        filingTitle: e.title,
        accessionNumber: e.accessionNumber,
        provenance: data.provenance,
      },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · material events (8-K)</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No filings for ${symbol}.`}>
          {() =>
            activity.events.length === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">No Form 8-K material events on file for {symbol}.</div>
            ) : (
              <div className="p-2">
                {activity.byCategory.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
                    {activity.byCategory.map((c) => (
                      <span key={c.category} className={`rounded border px-1.5 py-0.5 ${toneFor(c.category)}`}>
                        {c.category} · {c.count}
                      </span>
                    ))}
                  </div>
                )}
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="text-[10px] uppercase text-zinc-600">
                    <tr>
                      <th className="px-2 py-0.5 text-left font-medium">Filed</th>
                      <th className="px-2 py-0.5 text-left font-medium">Reported items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.events.map((e) => (
                      <tr
                        key={e.id}
                        className="cursor-pointer border-b border-zinc-900 align-top hover:bg-zinc-900/40"
                        onClick={() => openFiling(e)}
                        title="Open filing"
                      >
                        <td className="whitespace-nowrap px-2 py-1 text-zinc-400">
                          {e.filedAt.slice(0, 10)}
                          {e.form.replace(/\s+/g, '').toUpperCase() !== '8-K' && (
                            <span className="text-zinc-600"> · {e.form}</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {e.untagged ? (
                            <span className="text-zinc-600">Items not tagged by filer</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {e.items.map((it, i) => (
                                <div key={`${it.code}-${i}`} className="flex items-baseline gap-1.5">
                                  <span
                                    className={`rounded border px-1 py-px text-[10px] ${toneFor(it.category)}`}
                                    title={it.known ? it.category : 'Item code not in the SEC 8-K taxonomy'}
                                  >
                                    {it.code}
                                  </span>
                                  <span className="text-zinc-300">{it.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  {activity.eventCount} Form 8-K filing{activity.eventCount === 1 ? '' : 's'}
                  {activity.firstDate ? ` from ${activity.firstDate} to ${activity.lastDate}` : ''}. Item labels are the
                  authoritative SEC 8-K taxonomy;
                  {activity.untaggedCount > 0
                    ? ` ${activity.untaggedCount} filing${activity.untaggedCount === 1 ? '' : 's'} carried no tagged items.`
                    : ' every filing carried tagged items.'}{' '}
                  Descriptive, not advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        SEC EDGAR Form 8-K current reports · public data · descriptive, not advice.
      </p>
    </div>
  );
}
