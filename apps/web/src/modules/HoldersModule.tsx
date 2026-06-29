import { useMemo } from 'react';
import type { InstitutionalHolder } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, changeToneClass, formatCurrency, formatNumber, formatPercent, formatSigned, type Column } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

function noSymbol(): Promise<EnvelopeResult<InstitutionalHolder[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

const columns: Array<Column<InstitutionalHolder>> = [
  { key: 'holder', header: 'Holder', width: '1.8fr', className: 'text-zinc-300', render: (h) => h.holder },
  { key: 'shares', header: 'Shares', align: 'right', render: (h) => formatNumber(h.shares, { compact: true, decimals: 2 }) },
  { key: 'value', header: 'Value', align: 'right', render: (h) => formatCurrency(h.marketValue, 'USD', { compact: true, decimals: 2 }) },
  { key: 'pct', header: '% Out', align: 'right', render: (h) => formatPercent(h.percentOfShares) },
  {
    key: 'change',
    header: 'Change',
    align: 'right',
    render: (h) =>
      h.changeShares === undefined ? (
        '—'
      ) : (
        <span className={changeToneClass(h.changeShares)}>
          {formatSigned(h.changeShares / 1000, 0)}k
        </span>
      ),
  },
];

export function HoldersModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const holders = useApiData<InstitutionalHolder[]>(() => (symbol ? api.getOwnership(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, holders.provenance);

  const rows = useMemo(() => [...(holders.data ?? [])].sort((a, b) => b.shares - a.shares), [holders.data]);

  if (!symbol) return <SymbolRequired />;

  return (
    <ModuleBody
      state={holders}
      missingCapabilities={missingCapabilities}
      emptyMessage="No institutional holders for this instrument."
    >
      {() => <DataTable columns={columns} rows={rows} getRowKey={(h) => h.holder} rowHeight={26} />}
    </ModuleBody>
  );
}
