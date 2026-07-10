import { useMemo } from 'react';
import type { EstimateMetric, EstimatePeriod, FinancialStatement, Instrument, Quote } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';
import { computeImpliedMultiples } from './estimates';

const PERIOD_ORDER: EstimatePeriod[] = ['current_quarter', 'next_quarter', 'current_year', 'next_year'];

function noSymbol<T>(): Promise<EnvelopeResult<T>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function metricFor(metrics: EstimateMetric[], metric: string, period: EstimatePeriod): EstimateMetric | undefined {
  return metrics.find((m) => m.metric === metric && m.period === period);
}

export function EstimatesModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const estimates = useApiData<EstimateMetric[]>(() => (symbol ? api.getEstimates(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, estimates.provenance);
  // Auxiliary inputs for the implied multiples — each degrades to em-dash if absent.
  const quote = useApiData<Quote>(() => (symbol ? api.getQuote(symbol) : noSymbol()), [symbol]);
  const instrument = useApiData<Instrument>(() => (symbol ? api.getInstrument(symbol) : noSymbol()), [symbol]);
  const cashFlow = useApiData<FinancialStatement[]>(
    () => (symbol ? api.getFinancials(symbol, { type: 'cash_flow' }) : noSymbol()),
    [symbol],
  );

  const price = quote.data?.price ?? null;
  const shares = instrument.data?.sharesOutstanding ?? null;
  const operatingCashFlow = useMemo(() => {
    const latest = [...(cashFlow.data ?? [])].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate))[0];
    return latest?.lineItems.find((li) => li.key === 'operatingCashFlow')?.value ?? null;
  }, [cashFlow.data]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="h-full">
      <ModuleBody state={estimates} missingCapabilities={missingCapabilities} emptyMessage={`No estimates for ${symbol}.`}>
        {(metrics) => {
          const periods = PERIOD_ORDER.filter((p) => metrics.some((m) => m.period === p));
          if (periods.length === 0) {
            return <div className="p-4 text-xs text-zinc-500">No estimates for {symbol}.</div>;
          }
          const multiples = Object.fromEntries(
            periods.map((p) => [
              p,
              computeImpliedMultiples({
                epsMean: metricFor(metrics, 'eps', p)?.mean ?? null,
                revMean: metricFor(metrics, 'revenue', p)?.mean ?? null,
                price,
                shares,
                operatingCashFlow,
              }),
            ]),
          );

          const rows: Array<{ label: string; cell: (p: EstimatePeriod) => string }> = [
            { label: 'EPS (mean)', cell: (p) => formatNumber(metricFor(metrics, 'eps', p)?.mean ?? null, { decimals: 2 }) },
            {
              label: 'Revenue (mean)',
              cell: (p) => formatNumber(metricFor(metrics, 'revenue', p)?.mean ?? null, { compact: true, decimals: 2 }),
            },
            { label: 'Implied P/E', cell: (p) => formatNumber(multiples[p]!.pe, { decimals: 1 }) },
            { label: 'Implied P/S', cell: (p) => formatNumber(multiples[p]!.ps, { decimals: 1 }) },
            { label: 'Implied P/CF', cell: (p) => formatNumber(multiples[p]!.pcf, { decimals: 1 }) },
          ];

          // The board is transposed (metrics down, periods across), so export
          // columns are built explicitly: a Metric label column + one per period.
          const periodLabel = (p: EstimatePeriod) => metricFor(metrics, 'eps', p)?.fiscalLabel ?? p;
          const exportColumns: Array<ExportColumn<(typeof rows)[number]>> = [
            { key: 'metric', label: 'Metric', value: (r) => r.label },
            ...periods.map((p) => ({ key: p, label: periodLabel(p), value: (r: (typeof rows)[number]) => r.cell(p) })),
          ];

          return (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 justify-end border-b border-zinc-800 px-2 py-1">
                <TableExport name={`${symbol}-estimates`} exportColumns={exportColumns} rows={rows} provenance={estimates.provenance} />
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse font-mono text-xs">
                  <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Metric</th>
                      {periods.map((p) => (
                        <th key={p} className="px-2 py-1.5 text-right font-medium">
                          {periodLabel(p)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                        <td className="px-2 py-1 text-zinc-400">{row.label}</td>
                        {periods.map((p) => (
                          <td key={p} className="px-2 py-1 text-right text-zinc-200">
                            {row.cell(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }}
      </ModuleBody>
    </div>
  );
}
