import { useMemo } from 'react';
import type { AnalystRating, RatingAction } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, formatNumber, type Column } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';

function noSymbol(): Promise<EnvelopeResult<AnalystRating[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function actionTone(action: RatingAction | undefined): string {
  if (action === 'upgrade' || action === 'initiate') return 'text-emerald-400';
  if (action === 'downgrade') return 'text-red-400';
  return 'text-zinc-400';
}

const columns: Array<Column<AnalystRating>> = [
  { key: 'firm', header: 'Firm', width: '1.6fr', className: 'text-zinc-300', render: (r) => r.firm },
  { key: 'rating', header: 'Rating', render: (r) => r.rating },
  { key: 'action', header: 'Action', render: (r) => <span className={actionTone(r.action)}>{r.action ?? '—'}</span> },
  { key: 'target', header: 'Target', align: 'right', value: (r) => r.priceTarget ?? null, render: (r) => formatNumber(r.priceTarget ?? null) },
  { key: 'prior', header: 'Prior', align: 'right', value: (r) => r.previousPriceTarget ?? null, render: (r) => formatNumber(r.previousPriceTarget ?? null) },
  { key: 'date', header: 'Date', align: 'right', render: (r) => r.date.slice(0, 10) },
];

export function AnalystRatingsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const ratings = useApiData<AnalystRating[]>(() => (symbol ? api.getRatings(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, ratings.provenance);

  const rows = useMemo(
    () => [...(ratings.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [ratings.data],
  );

  if (!symbol) return <SymbolRequired />;

  return (
    <ModuleBody state={ratings} missingCapabilities={missingCapabilities} emptyMessage={`No analyst ratings for ${symbol}.`}>
      {() => (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 justify-end border-b border-zinc-800 px-2 py-1">
            <TableExport name={`${symbol}-ratings`} columns={columns} rows={rows} provenance={ratings.provenance} />
          </div>
          <DataTable columns={columns} rows={rows} getRowKey={(r, i) => `${r.firm}-${r.date}-${i}`} rowHeight={26} />
        </div>
      )}
    </ModuleBody>
  );
}
