import type { ModulePanelProps } from '@tyche/module-sdk';
import type { FinancialStatement, StatementType } from '@tyche/contracts';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

const TYPES: Array<{ id: StatementType; label: string }> = [
  { id: 'income', label: 'Income' },
  { id: 'balance', label: 'Balance' },
  { id: 'cash_flow', label: 'Cash Flow' },
];

function noSymbol(): Promise<EnvelopeResult<FinancialStatement[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

export function FinancialsModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const type = (state.type as StatementType) ?? 'income';
  const financials = useApiData(
    () => (symbol ? api.getFinancials(symbol, { period: 'annual' }) : noSymbol()),
    [symbol],
  );
  useReportProvenance(reportProvenance, financials.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setState({ type: t.id })}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              t.id === type ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody
          state={financials}
          missingCapabilities={missingCapabilities}
          emptyMessage="No financial statements for this instrument."
        >
          {(statements) => {
            const periods = statements
              .filter((s) => s.type === type)
              .sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
            if (periods.length === 0) {
              return <div className="p-4 text-xs text-zinc-500">No {type} statements available.</div>;
            }
            const keys = periods[0]!.lineItems.map((li) => ({ key: li.key, label: li.label }));
            return (
              <table className="w-full border-collapse font-mono text-xs">
                <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Metric</th>
                    {periods.map((p) => (
                      <th key={p.fiscalDate} className="px-2 py-1.5 text-right font-medium">
                        {p.fiscalYear ?? p.fiscalDate.slice(0, 4)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.key} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                      <td className="px-2 py-1 text-zinc-400">{k.label}</td>
                      {periods.map((p) => {
                        const item = p.lineItems.find((li) => li.key === k.key);
                        return (
                          <td key={p.fiscalDate} className="px-2 py-1 text-right text-zinc-200">
                            {formatNumber(item?.value ?? null, { compact: true, decimals: 2 })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          }}
        </ModuleBody>
      </div>
    </div>
  );
}
