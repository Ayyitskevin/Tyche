import { useMemo } from 'react';
import type { EstimateMetric, EstimatePeriod } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, changeToneClass, formatNumber, formatSigned, type Column } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';
import { earningsSurprise } from './earnings';

function noSymbol(): Promise<EnvelopeResult<EstimateMetric[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

const PERIOD_ORDER: EstimatePeriod[] = ['current_quarter', 'next_quarter', 'current_year', 'next_year'];
const METRIC_ORDER = ['eps', 'revenue'];

/** Consistent value formatting: revenue is a big compact figure, EPS a 2-dp number. */
function fmt(metric: string, v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return metric === 'revenue' ? formatNumber(v, { compact: true, decimals: 2 }) : formatNumber(v, { decimals: 2 });
}

const columns: Array<Column<EstimateMetric>> = [
  {
    key: 'metric',
    header: 'Metric',
    width: '0.7fr',
    value: (r) => r.metric.toUpperCase(),
    render: (r) => <span className="uppercase text-zinc-300">{r.metric}</span>,
  },
  {
    key: 'period',
    header: 'Period',
    value: (r) => r.fiscalLabel ?? r.period,
    render: (r) => <span className="text-zinc-400">{r.fiscalLabel ?? r.period}</span>,
  },
  { key: 'consensus', header: 'Est.', align: 'right', value: (r) => r.mean, render: (r) => fmt(r.metric, r.mean) },
  {
    key: 'range',
    header: 'Low–High',
    align: 'right',
    value: (r) => (r.low != null && r.high != null ? `${r.low}–${r.high}` : null),
    render: (r) => (r.low != null && r.high != null ? `${fmt(r.metric, r.low)} – ${fmt(r.metric, r.high)}` : '—'),
  },
  { key: 'analysts', header: '#', align: 'right', value: (r) => r.numAnalysts ?? null, render: (r) => r.numAnalysts ?? '—' },
  {
    key: 'actual',
    header: 'Actual',
    align: 'right',
    value: (r) => r.actual ?? null,
    render: (r) => (r.actual != null ? <span className="text-zinc-100">{fmt(r.metric, r.actual)}</span> : '—'),
  },
  {
    key: 'surprise',
    header: 'Surprise',
    align: 'right',
    value: (r) => earningsSurprise(r.actual, r.mean)?.pct ?? null,
    render: (r) => {
      const s = earningsSurprise(r.actual, r.mean);
      return s ? <span className={changeToneClass(s.pct)}>{formatSigned(s.pct, 1)}%</span> : '—';
    },
  },
];

/**
 * ERN — earnings history & estimates. Renders the estimates contract as a
 * reported-vs-estimated board: per metric (EPS, revenue) and period, the analyst
 * consensus, its low–high range, the count, the reported actual (once a period
 * has printed), and the surprise. Forward periods show an em-dash for actual /
 * surprise until they report. Provenance-reported and CSV/JSON exportable.
 */
export function EarningsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const estimates = useApiData<EstimateMetric[]>(() => (symbol ? api.getEstimates(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, estimates.provenance);

  const rows = useMemo(
    () =>
      [...(estimates.data ?? [])].sort(
        (a, b) =>
          PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period) ||
          METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric),
      ),
    [estimates.data],
  );

  if (!symbol) return <SymbolRequired />;

  return (
    <ModuleBody state={estimates} missingCapabilities={missingCapabilities} emptyMessage={`No earnings estimates for ${symbol}.`}>
      {() => (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 justify-end border-b border-zinc-800 px-2 py-1">
            <TableExport name={`${symbol}-earnings`} columns={columns} rows={rows} provenance={estimates.provenance} />
          </div>
          <DataTable columns={columns} rows={rows} getRowKey={(r, i) => `${r.metric}-${r.period}-${i}`} rowHeight={26} />
        </div>
      )}
    </ModuleBody>
  );
}
