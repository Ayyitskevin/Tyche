import type { IndexMembership } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, formatNumber, type Column } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useElementSize } from '../providers/useElementSize';
import { ModuleBody, SymbolRequired, useReportProvenance, useReportSummary } from './common';
import { TableExport } from './TableExport';

function noSymbol(): Promise<EnvelopeResult<IndexMembership>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

/**
 * MEMB — index/ETF membership: constituents with weights and sectors. Rows
 * retarget linked panels, so "what's in this benchmark → open its chart" is a
 * two-keystroke flow.
 */
export function MembershipModule({ symbol, setSymbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const membership = useApiData<IndexMembership>(
    () => (symbol ? api.getMembership(symbol) : noSymbol()),
    [symbol],
  );
  useReportProvenance(reportProvenance, membership.provenance);
  useReportSummary(
    reportSummary,
    membership.data && membership.data.constituents.length > 0
      ? `${membership.data.symbol} membership: ${membership.data.constituents.length} constituents, top ${membership.data.constituents[0]?.symbol} ${membership.data.constituents[0]?.weightPct.toFixed(1)}%`
      : null,
  );
  const [ref, size] = useElementSize<HTMLDivElement>();

  const columns: Array<Column<IndexMembership['constituents'][number]>> = [
    {
      key: 'symbol',
      header: 'Symbol',
      render: (c) => (
        <button type="button" className="text-sky-300 hover:underline" onClick={() => setSymbol?.(c.symbol)}>
          {c.symbol}
        </button>
      ),
    },
    { key: 'name', header: 'Name', width: '2fr', render: (c) => c.name },
    {
      key: 'weight',
      header: 'Weight',
      align: 'right',
      value: (c) => c.weightPct,
      render: (c) => `${formatNumber(c.weightPct, { decimals: 2 })}%`,
    },
    { key: 'sector', header: 'Sector', render: (c) => c.sector ?? '—' },
  ];

  if (!symbol) return <SymbolRequired />;

  return (
    <div ref={ref} className="flex h-full flex-col">
      <ModuleBody state={membership} missingCapabilities={missingCapabilities} emptyMessage="No membership data.">
        {(data) =>
          data.constituents.length === 0 ? (
            <div className="p-4 text-xs text-zinc-500">
              No synthetic membership is defined for “{data.symbol}”. Try SPX, NDX, DJI, SPY, or QQQ in mock mode.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-zinc-900 px-2 py-1 text-[11px] text-zinc-500">
                <span>
                  {data.name} · as of {data.asOf.slice(0, 10)}
                </span>
                <div className="ml-auto">
                  <TableExport name={`${data.symbol}-members`} columns={columns} rows={data.constituents} provenance={membership.provenance} />
                </div>
              </div>
              <DataTable
                columns={columns}
                rows={data.constituents}
                getRowKey={(c) => c.symbol}
                height={(size.height || 320) - 26}
                rowHeight={22}
              />
            </>
          )
        }
      </ModuleBody>
    </div>
  );
}
