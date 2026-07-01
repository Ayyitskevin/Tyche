import type { ModulePanelProps } from '@tyche/module-sdk';
import type { CorporateEvent } from '@tyche/contracts';
import { formatNumber } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';

const WINDOWS = [7, 30, 90] as const;

const TYPE_BADGE: Record<CorporateEvent['type'], { label: string; cls: string }> = {
  earnings: { label: 'EPS', cls: 'bg-sky-500/20 text-sky-300' },
  dividend: { label: 'DIV', cls: 'bg-emerald-500/20 text-emerald-300' },
  split: { label: 'SPLIT', cls: 'bg-amber-500/20 text-amber-300' },
};

function detail(e: CorporateEvent): string {
  if (e.type === 'earnings') return e.epsEstimate != null ? `est EPS ${formatNumber(e.epsEstimate)}` : 'EPS reported';
  if (e.type === 'dividend') return e.amount != null ? `${formatNumber(e.amount)} / share` : '';
  return e.ratio ?? '';
}

/**
 * EVT — corporate events calendar (earnings / dividends / splits). With a
 * symbol it scopes to that instrument; bare EVT shows the whole universe.
 * Facts only (dates, amounts, ratios) — no recommendation surface.
 */
export function EventsModule({ symbol, state, setState, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const days = (state.days as number | undefined) ?? 30;
  const events = useApiData(
    () => api.getEvents({ ...(symbol ? { symbol } : {}), days }),
    [symbol, days],
  );
  useReportProvenance(reportProvenance, events.provenance);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events.data ?? []).filter((e) => e.date >= today);
  useReportSummary(
    reportSummary,
    upcoming[0]
      ? `Next event: ${upcoming[0].symbol} ${upcoming[0].type} on ${upcoming[0].date}${symbol ? '' : ` (universe, ${days}d window)`}`
      : null,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={days === w}
            onClick={() => setState({ days: w })}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${
              days === w ? 'border-sky-500/40 bg-sky-500/20 text-sky-300' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
            }`}
          >
            {w}d
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600">
          {symbol ? `events for ${symbol}` : 'whole universe'} · past 30d included
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={events} missingCapabilities={missingCapabilities} emptyMessage="No events in this window.">
          {(list) => (
            <table className="w-full border-collapse font-mono text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Date</th>
                  <th className="px-2 py-1.5 text-left font-medium">Type</th>
                  <th className="px-2 py-1.5 text-left font-medium">Symbol</th>
                  <th className="px-2 py-1.5 text-left font-medium">Event</th>
                  <th className="px-2 py-1.5 text-right font-medium">Detail</th>
                  <th className="px-2 py-1.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const badge = TYPE_BADGE[e.type];
                  const past = e.date < today;
                  return (
                    <tr key={e.id} className={`border-b border-zinc-900 ${past ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-1 text-zinc-400">{e.date}</td>
                      <td className="px-2 py-1">
                        <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          onClick={() => executeInput(`${e.symbol} DES`)}
                          className="text-sky-300 hover:underline"
                        >
                          {e.symbol}
                        </button>
                      </td>
                      <td className="max-w-0 truncate px-2 py-1 text-zinc-300" title={e.title}>
                        {e.title}
                      </td>
                      <td className="px-2 py-1 text-right text-zinc-300">{detail(e)}</td>
                      <td className="px-2 py-1 text-right">
                        <span className={`text-[10px] ${e.status === 'confirmed' ? 'text-emerald-400/80' : 'text-zinc-500'}`}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
