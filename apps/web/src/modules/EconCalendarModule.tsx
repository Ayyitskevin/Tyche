import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { EconomicRelease, ReleaseImportance } from '@tyche/contracts';
import { changeToneClass, formatNumber, formatSigned } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';

const IMPORTANCE_FILTERS = ['all', 'high', 'medium', 'low'] as const;
type ImportanceFilter = (typeof IMPORTANCE_FILTERS)[number];

const IMPORTANCE_DOT: Record<ReleaseImportance, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-zinc-500',
};

function chipClass(active: boolean): string {
  return `rounded border px-1.5 py-0.5 text-[11px] ${
    active ? 'border-sky-500/40 bg-sky-500/20 text-sky-300' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
  }`;
}

function surpriseOf(r: EconomicRelease): number | null {
  return r.actual != null && r.consensus != null ? r.actual - r.consensus : null;
}

const EXPORT_COLUMNS: ExportColumn<EconomicRelease>[] = [
  { key: 'date', label: 'Date', value: (r) => r.date },
  { key: 'importance', label: 'Importance', value: (r) => r.importance ?? '' },
  { key: 'name', label: 'Release', value: (r) => r.name },
  { key: 'unit', label: 'Unit', value: (r) => r.unit ?? '' },
  { key: 'period', label: 'Period', value: (r) => r.period ?? '' },
  { key: 'previous', label: 'Previous', value: (r) => r.previous ?? '' },
  { key: 'consensus', label: 'Consensus', value: (r) => r.consensus ?? '' },
  { key: 'actual', label: 'Actual', value: (r) => r.actual ?? '' },
  { key: 'surprise', label: 'Surprise', value: (r) => surpriseOf(r) ?? '' },
];

export function EconCalendarModule({ state, setState, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const importance = (state.importance as ImportanceFilter | undefined) ?? 'all';
  const data = useApiData(
    () => api.getEconomicReleases(importance === 'all' ? {} : { importance }),
    [importance],
  );
  useReportProvenance(reportProvenance, data.provenance);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const releases = data.data ?? [];
  const upcoming = releases.filter((r) => r.date >= today);
  const recent = releases.filter((r) => r.date < today).reverse();

  const nextHigh = upcoming.find((r) => r.importance === 'high');
  useReportSummary(
    reportSummary,
    nextHigh ? `Next major release: ${nextHigh.name} on ${nextHigh.date}` : null,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {IMPORTANCE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={importance === f}
            onClick={() => setState({ importance: f })}
            className={chipClass(importance === f)}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto">
          <TableExport name="econ-calendar" exportColumns={EXPORT_COLUMNS} rows={releases} provenance={data.provenance} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage="No releases.">
          {() => (
            <div className="p-1">
              <Section title="Upcoming" rows={upcoming} />
              <Section title="Recent" rows={recent} />
            </div>
          )}
        </ModuleBody>
      </div>

      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] leading-snug text-zinc-600">
        Scheduled and just-published macro releases. Consensus is populated only where a source carries
        estimates. Descriptive market data, not investment advice.
      </p>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: EconomicRelease[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500">{title}</div>
      <table className="w-full border-collapse font-mono text-[11px]">
        <thead className="text-[10px] uppercase text-zinc-600">
          <tr>
            <th className="px-2 py-0.5 text-left font-medium">Date</th>
            <th className="px-1 py-0.5 text-center font-medium" />
            <th className="px-2 py-0.5 text-left font-medium">Release</th>
            <th className="px-2 py-0.5 text-left font-medium">Period</th>
            <th className="px-2 py-0.5 text-right font-medium">Prev</th>
            <th className="px-2 py-0.5 text-right font-medium">Cons</th>
            <th className="px-2 py-0.5 text-right font-medium">Actual</th>
            <th className="px-2 py-0.5 text-right font-medium">Surp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const surprise = surpriseOf(r);
            return (
              <tr key={`${r.date}-${r.name}-${i}`} className="border-b border-zinc-900">
                <td className="px-2 py-0.5 text-zinc-400">{r.date}</td>
                <td className="px-1 py-0.5 text-center">
                  {r.importance ? (
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[r.importance]}`}
                      title={r.importance}
                    />
                  ) : null}
                </td>
                <td className="px-2 py-0.5 text-zinc-200">
                  {r.name}
                  {r.unit ? <span className="text-zinc-600"> · {r.unit}</span> : null}
                </td>
                <td className="px-2 py-0.5 text-zinc-500">{r.period ?? '—'}</td>
                <td className="px-2 py-0.5 text-right text-zinc-400">{r.previous == null ? '—' : formatNumber(r.previous)}</td>
                <td className="px-2 py-0.5 text-right text-zinc-400">{r.consensus == null ? '—' : formatNumber(r.consensus)}</td>
                <td className="px-2 py-0.5 text-right text-zinc-100">{r.actual == null ? '—' : formatNumber(r.actual)}</td>
                <td className={`px-2 py-0.5 text-right ${surprise == null ? 'text-zinc-600' : changeToneClass(surprise)}`}>
                  {surprise == null ? '—' : formatSigned(surprise)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
