import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Filing } from '@tyche/contracts';
import { DataTable, type Column } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

function noSymbol(): Promise<EnvelopeResult<Filing[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

const columns: Array<Column<Filing>> = [
  { key: 'form', header: 'Form', width: '0.8fr', className: 'text-sky-300', render: (f) => f.form },
  { key: 'title', header: 'Title', width: '2fr', render: (f) => f.title },
  { key: 'filed', header: 'Filed', align: 'right', render: (f) => f.filedAt.slice(0, 10) },
];

export function FilingsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const filings = useApiData(() => (symbol ? api.getFilings(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, filings.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <ModuleBody state={filings} missingCapabilities={missingCapabilities} emptyMessage="No filings for this instrument.">
      {(rows) => (
        <DataTable columns={columns} rows={rows} getRowKey={(f) => f.id} rowHeight={26} />
      )}
    </ModuleBody>
  );
}
