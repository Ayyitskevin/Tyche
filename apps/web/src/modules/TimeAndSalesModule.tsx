import { useMemo } from 'react';
import type { TradePrint, TradeSide } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, formatNumber, type Column } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useTradeStream } from '../providers/useTradeStream';
import { useElementSize } from '../providers/useElementSize';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

function noSymbol(): Promise<EnvelopeResult<TradePrint[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function sideTone(side: TradeSide): string {
  if (side === 'buy') return 'text-emerald-400';
  if (side === 'sell') return 'text-red-400';
  return 'text-zinc-300';
}

const columns: Array<Column<TradePrint>> = [
  { key: 'time', header: 'Time', width: '1.2fr', render: (t) => t.timestamp.slice(11, 19) },
  {
    key: 'price',
    header: 'Price',
    align: 'right',
    render: (t) => <span className={sideTone(t.side)}>{formatNumber(t.price)}</span>,
  },
  { key: 'size', header: 'Size', align: 'right', render: (t) => formatNumber(t.size, { decimals: 0 }) },
  { key: 'side', header: 'Side', render: (t) => <span className={sideTone(t.side)}>{t.side}</span> },
  { key: 'venue', header: 'Venue', render: (t) => t.venue ?? '—' },
];

export function TimeAndSalesModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const seed = useApiData<TradePrint[]>(() => (symbol ? api.getTrades(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, seed.provenance);
  const live = useTradeStream(symbol);
  const [ref, size] = useElementSize<HTMLDivElement>();

  // Live prints (newest-first) on top, the REST seed beneath, bounded.
  const rows = useMemo(() => [...live, ...(seed.data ?? [])].slice(0, 500), [live, seed.data]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div ref={ref} className="h-full">
      <ModuleBody state={seed} missingCapabilities={missingCapabilities} emptyMessage="No prints yet.">
        {() =>
          rows.length === 0 ? (
            <div className="p-4 text-xs text-zinc-500">No prints yet.</div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(t, i) => `${t.timestamp}-${t.price}-${i}`}
              height={size.height || 320}
              rowHeight={22}
            />
          )
        }
      </ModuleBody>
    </div>
  );
}
