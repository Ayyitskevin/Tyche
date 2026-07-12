import { useMemo, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, formatNumber, formatPercent, formatSigned } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { AdvancedChart } from './AdvancedChart';
import {
  ECON_PRESETS,
  ECON_RANGES,
  ECON_TRANSFORMS,
  applyTransform,
  observationsToCandles,
  rangeStartIso,
  seriesStats,
  transformUnitsLabel,
  type EconRange,
  type EconTransform,
} from './economicsSeries';

function chipClass(active: boolean): string {
  return `rounded border px-1.5 py-0.5 text-[11px] ${
    active
      ? 'border-sky-500/40 bg-sky-500/20 text-sky-300'
      : 'border-transparent text-zinc-500 hover:bg-zinc-800'
  }`;
}

export function EconomicsModule({
  args,
  state,
  setState,
  missingCapabilities,
  reportProvenance,
  reportSummary,
}: ModulePanelProps) {
  // The ECO handler feeds the typed series id through `args` (never the active
  // instrument), so bare `ECO` defaults to GDP. A picked preset / typed id wins.
  const seriesId = ((state.seriesId as string | undefined) ?? args[0] ?? 'GDP').toUpperCase();
  const range = (state.range as EconRange | undefined) ?? '10y';
  const transform = (state.transform as EconTransform | undefined) ?? 'level';
  const [draft, setDraft] = useState('');

  const start = useMemo(() => rangeStartIso(range, new Date()), [range]);
  const series = useApiData(
    () => api.getEconomicSeries(seriesId, start ? { start } : {}),
    [seriesId, start],
  );
  useReportProvenance(reportProvenance, series.provenance);

  const observations = useMemo(
    () => (series.data ? applyTransform(series.data.observations, transform) : []),
    [series.data, transform],
  );
  const stats = useMemo(() => seriesStats(observations), [observations]);
  const candles = useMemo(() => observationsToCandles(observations), [observations]);
  const unitsLabel = transformUnitsLabel(transform, series.data?.unitsShort ?? series.data?.units ?? null);

  useReportSummary(
    reportSummary,
    series.data && stats?.latest?.value != null
      ? `${series.data.title} (${seriesId})${transform === 'level' ? '' : ` [${transform}]`}: latest ${formatNumber(stats.latest.value)} ${unitsLabel} on ${stats.latest.date}`
      : null,
  );

  function submitId(e: React.FormEvent) {
    e.preventDefault();
    const id = draft.trim().toUpperCase();
    if (id) {
      setState({ seriesId: id });
      setDraft('');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {ECON_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={seriesId === p.id}
            onClick={() => setState({ seriesId: p.id })}
            className={chipClass(seriesId === p.id)}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-zinc-800" />
        {ECON_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setState({ range: r })}
            className={chipClass(range === r)}
          >
            {r}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-zinc-800" />
        {ECON_TRANSFORMS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={transform === t.id}
            onClick={() => setState({ transform: t.id })}
            className={chipClass(transform === t.id)}
          >
            {t.label}
          </button>
        ))}
        <form onSubmit={submitId} className="ml-auto flex items-center gap-1">
          <input
            aria-label="Series id"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Series id (e.g. GDP)"
            className="w-28 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none"
          />
        </form>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ModuleBody state={series} missingCapabilities={missingCapabilities} emptyMessage="No series data.">
          {(data) => (
            <div className="flex h-full flex-col">
              <div className="px-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm text-zinc-200" title={data.title}>
                    {data.title}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">{seriesId}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-lg text-zinc-100">{formatNumber(stats?.latest?.value)}</span>
                  {stats && stats.change !== null && (
                    <span className={`font-mono text-xs ${changeToneClass(stats.change)}`}>
                      {formatSigned(stats.change)}
                      {stats.changePercent !== null ? ` (${formatPercent(stats.changePercent)})` : ''}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600">
                    {unitsLabel}
                    {stats?.latest ? ` · ${stats.latest.date}` : ''}
                  </span>
                </div>
              </div>
              <div className="mt-1 min-h-0 flex-1">
                <AdvancedChart
                  candles={candles}
                  type="line"
                  overlays={[]}
                  rsiPeriod={null}
                  fill={transform === 'level'}
                />
              </div>
              <div className="mt-1 max-h-28 shrink-0 overflow-auto border-t border-zinc-900">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Date</th>
                      <th className="px-2 py-1 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...observations]
                      .reverse()
                      .slice(0, 12)
                      .map((o) => (
                        <tr key={o.date} className="border-b border-zinc-900">
                          <td className="px-2 py-0.5 text-zinc-400">{o.date}</td>
                          <td className="px-2 py-0.5 text-right text-zinc-200">{formatNumber(o.value)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
