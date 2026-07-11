import type { ReactElement } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { FinancialStatement, FiscalPeriod, StatementType } from '@tyche/contracts';
import { bundlePeriods, financialRatios, growth, lineItem, type FinancialRatios } from '@tyche/analytics';
import { formatNumber, formatPercent } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { downloadText, financialsToCsv, financialsToJson } from './export';

/** A tab is either one of the three statements or the derived "Ratios" view. */
type FinancialsView = StatementType | 'ratios';

const TABS: Array<{ id: FinancialsView; label: string }> = [
  { id: 'income', label: 'Income' },
  { id: 'balance', label: 'Balance' },
  { id: 'cash_flow', label: 'Cash Flow' },
  { id: 'ratios', label: 'Ratios' },
];

// TTM is omitted: the mock provider only emits annual/quarterly series.
const PERIODS: Array<{ id: FiscalPeriod; label: string }> = [
  { id: 'annual', label: 'Annual' },
  { id: 'quarterly', label: 'Quarterly' },
];

/** Profitability/leverage rows of the Ratios view. `kind` picks the unit format. */
const RATIO_ROWS: Array<{ section?: string; label: string; pick: (r: FinancialRatios) => number | null; kind: 'pct' | 'x' }> = [
  { section: 'Margins', label: 'Gross margin', pick: (r) => r.grossMargin, kind: 'pct' },
  { label: 'Operating margin', pick: (r) => r.operatingMargin, kind: 'pct' },
  { label: 'Net margin', pick: (r) => r.netMargin, kind: 'pct' },
  { label: 'FCF margin', pick: (r) => r.fcfMargin, kind: 'pct' },
  { section: 'Returns', label: 'Return on assets', pick: (r) => r.returnOnAssets, kind: 'pct' },
  { label: 'Return on equity', pick: (r) => r.returnOnEquity, kind: 'pct' },
  { section: 'Leverage & efficiency', label: 'Debt / equity', pick: (r) => r.debtToEquity, kind: 'x' },
  { label: 'Debt / assets', pick: (r) => r.debtToAssets, kind: 'x' },
  { label: 'Asset turnover', pick: (r) => r.assetTurnover, kind: 'x' },
];

/** Growth rows: line item extracted from a statement, compared to a prior period. */
const GROWTH_ROWS: Array<{ label: string; from: 'income' | 'cashFlow'; key: string }> = [
  { label: 'Revenue growth', from: 'income', key: 'totalRevenue' },
  { label: 'Net income growth', from: 'income', key: 'netIncome' },
  { label: 'EPS growth', from: 'income', key: 'eps' },
  { label: 'FCF growth', from: 'cashFlow', key: 'freeCashFlow' },
];

function ratioCell(value: number | null, kind: 'pct' | 'x'): string {
  if (value === null) return '—';
  return kind === 'pct' ? formatPercent(value * 100) : `${formatNumber(value, { decimals: 2 })}×`;
}

function noSymbol(): Promise<EnvelopeResult<FinancialStatement[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

export function FinancialsModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const view = (state.type as FinancialsView) ?? 'income';
  const period = (state.period as FiscalPeriod) ?? 'annual';
  const financials = useApiData(
    () => (symbol ? api.getFinancials(symbol, { period }) : noSymbol()),
    [symbol, period],
  );
  useReportProvenance(reportProvenance, financials.provenance);

  if (!symbol) return <SymbolRequired />;
  const isRatios = view === 'ratios';

  function exportAs(format: 'csv' | 'json', statements: FinancialStatement[]) {
    const statementType = view === 'ratios' ? 'income' : view;
    const contents =
      format === 'csv'
        ? financialsToCsv(statements, statementType, financials.provenance)
        : financialsToJson(statements, statementType, financials.provenance);
    const mime = format === 'csv' ? 'text/csv' : 'application/json';
    downloadText(`${symbol}-${statementType}-${period}.${format}`, mime, contents);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setState({ ...state, type: t.id })}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                t.id === view ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setState({ ...state, period: p.id })}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                p.id === period ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {financials.data && !isRatios && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => exportAs('csv', financials.data!)}
              className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => exportAs('json', financials.data!)}
              className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
            >
              JSON
            </button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody
          state={financials}
          missingCapabilities={missingCapabilities}
          emptyMessage="No financial statements for this instrument."
        >
          {(statements) =>
            isRatios ? renderRatios(statements, period) : renderStatement(statements, view)
          }
        </ModuleBody>
      </div>
    </div>
  );
}

function periodHeader(p: { fiscalDate: string; fiscalYear?: number; fiscalQuarter?: number }): string {
  const year = p.fiscalYear ?? p.fiscalDate.slice(0, 4);
  return p.fiscalQuarter ? `${year} Q${p.fiscalQuarter}` : `${year}`;
}

function renderStatement(statements: FinancialStatement[], type: StatementType) {
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
              {periodHeader(p)}
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
}

function renderRatios(statements: FinancialStatement[], period: FiscalPeriod) {
  const bundles = bundlePeriods(statements);
  if (bundles.length === 0) {
    return <div className="p-4 text-xs text-zinc-500">No statements to derive ratios from.</div>;
  }
  const ratios = bundles.map(financialRatios);
  // Prefer year-over-year growth when a full year of quarters is available; fall
  // back to sequential (period-over-period) growth for short histories.
  const growthLag = period === 'quarterly' && bundles.length > 4 ? 4 : 1;
  const growthLabel = period === 'quarterly' ? (growthLag === 4 ? 'YoY growth' : 'QoQ growth') : 'YoY growth';

  const colSpan = bundles.length + 1;
  const sectionRow = (title: string) => (
    <tr key={`sec-${title}`} className="bg-zinc-900/70">
      <td colSpan={colSpan} className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500">
        {title}
      </td>
    </tr>
  );

  return (
    <table className="w-full border-collapse font-mono text-xs">
      <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
        <tr>
          <th className="px-2 py-1.5 text-left font-medium">Ratio</th>
          {bundles.map((b) => (
            <th key={b.fiscalDate} className="px-2 py-1.5 text-right font-medium">
              {periodHeader(b)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {RATIO_ROWS.flatMap((row) => {
          const rows: ReactElement[] = [];
          if (row.section) rows.push(sectionRow(row.section));
          rows.push(
            <tr key={row.label} className="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td className="px-2 py-1 text-zinc-400">{row.label}</td>
              {ratios.map((r, i) => (
                <td key={bundles[i]!.fiscalDate} className="px-2 py-1 text-right text-zinc-200">
                  {ratioCell(row.pick(r), row.kind)}
                </td>
              ))}
            </tr>,
          );
          return rows;
        })}
        {sectionRow(growthLabel)}
        {GROWTH_ROWS.map((row) => {
          const series = bundles.map((b) => lineItem(row.from === 'income' ? b.income : b.cashFlow, row.key));
          return (
            <tr key={row.label} className="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td className="px-2 py-1 text-zinc-400">{row.label}</td>
              {bundles.map((b, i) => {
                const g = growth(series[i] ?? null, series[i + growthLag] ?? null);
                return (
                  <td key={b.fiscalDate} className="px-2 py-1 text-right text-zinc-200">
                    {g === null ? '—' : formatPercent(g * 100)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
