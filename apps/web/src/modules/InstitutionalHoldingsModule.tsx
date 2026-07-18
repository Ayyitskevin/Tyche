import { useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { InstitutionalHolding, InstitutionalPortfolio } from '@tyche/contracts';
import { formatNumber, formatPercent } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';

/** Quick-pick managers so the panel is demoable without knowing a CIK. */
const PRESETS = ['BERKSHIRE', 'SCION', 'PERSHING', 'BRIDGEWATER', 'ARK'] as const;

/** Compact USD so a multi-billion-dollar book fits a terminal cell. */
function compactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const EXPORT_COLUMNS: ExportColumn<InstitutionalHolding>[] = [
  { key: 'issuer', label: 'Issuer', value: (h) => h.issuer },
  { key: 'ticker', label: 'Ticker', value: (h) => h.ticker ?? '' },
  { key: 'cusip', label: 'CUSIP', value: (h) => h.cusip },
  { key: 'class', label: 'Class', value: (h) => h.class ?? '' },
  { key: 'value', label: 'Value (USD)', value: (h) => h.value },
  { key: 'shares', label: 'Shares/Prin', value: (h) => h.shares },
  { key: 'sharesType', label: 'Type', value: (h) => h.sharesType ?? '' },
  { key: 'weightPercent', label: 'Weight %', value: (h) => h.weightPercent },
  { key: 'putCall', label: 'Put/Call', value: (h) => h.putCall ?? '' },
];

function chipClass(active: boolean): string {
  return `rounded border px-1.5 py-0.5 text-[11px] ${
    active ? 'border-sky-500/40 bg-sky-500/20 text-sky-300' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
  }`;
}

export function InstitutionalHoldingsModule({
  symbol,
  state,
  setState,
  missingCapabilities,
  reportProvenance,
  reportSummary,
}: ModulePanelProps) {
  // The manager comes from the command (`13F BERKSHIRE`, `13F 1067983`) via the panel
  // symbol + args, or an in-panel override; default to a well-known filer so a bare
  // `13F` still demonstrates the view.
  const args = Array.isArray(state.args) ? (state.args as unknown[]) : [];
  const argManager = [symbol, ...args]
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .join(' ')
    .trim();
  const manager = (typeof state.manager === 'string' && state.manager) || argManager || 'BERKSHIRE';
  const [draft, setDraft] = useState(manager);

  const data = useApiData<InstitutionalPortfolio>(
    () => api.getInstitutionalHoldings(manager, 50),
    [manager],
  );
  useReportProvenance(reportProvenance, data.provenance);

  const portfolio = data.data;
  useReportSummary(
    reportSummary,
    portfolio && portfolio.holdings.length > 0
      ? `${portfolio.manager}: ${portfolio.positionCount} positions, ${compactUsd(portfolio.totalValue)} 13F value`
      : null,
  );

  const submit = () => {
    const next = draft.trim();
    if (next) setState({ manager: next });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          onBlur={submit}
          placeholder="Manager or CIK"
          aria-label="Manager or CIK"
          className="w-36 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-sky-500/50"
        />
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={manager.toUpperCase() === p}
            onClick={() => {
              setDraft(p);
              setState({ manager: p });
            }}
            className={chipClass(manager.toUpperCase() === p)}
          >
            {p}
          </button>
        ))}
        <div className="ml-auto">
          <TableExport
            name="institutional-holdings"
            exportColumns={EXPORT_COLUMNS}
            rows={portfolio?.holdings ?? []}
            provenance={data.provenance}
          />
        </div>
      </div>

      {portfolio && portfolio.holdings.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-zinc-900 px-3 py-1 text-[11px]">
          <span className="font-medium text-zinc-100">{portfolio.manager}</span>
          <span className="text-zinc-500">
            {portfolio.positionCount} positions · {compactUsd(portfolio.totalValue)}
          </span>
          {portfolio.reportDate ? <span className="text-zinc-500">as of {portfolio.reportDate}</span> : null}
          {portfolio.filedAt ? <span className="text-zinc-600">filed {portfolio.filedAt}</span> : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage="No 13F holdings found for that manager.">
          {(p) => (
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase text-zinc-600">
                <tr>
                  <th className="px-2 py-0.5 text-right font-medium">#</th>
                  <th className="px-2 py-0.5 text-left font-medium">Issuer</th>
                  <th className="px-2 py-0.5 text-left font-medium">Ticker</th>
                  <th className="px-2 py-0.5 text-right font-medium">Value</th>
                  <th className="px-2 py-0.5 text-right font-medium">Shares</th>
                  <th className="px-2 py-0.5 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {p.holdings.map((h, i) => (
                  <tr key={`${h.cusip}-${i}`} className="border-b border-zinc-900">
                    <td className="px-2 py-0.5 text-right text-zinc-600">{i + 1}</td>
                    <td className="px-2 py-0.5 text-zinc-200">
                      {h.issuer}
                      {h.putCall ? <span className="text-amber-400/80"> · {h.putCall}</span> : null}
                      {h.class && h.class !== 'COM' ? <span className="text-zinc-600"> · {h.class}</span> : null}
                    </td>
                    <td className="px-2 py-0.5 text-zinc-400">{h.ticker ?? '—'}</td>
                    <td className="px-2 py-0.5 text-right text-zinc-100">{compactUsd(h.value)}</td>
                    <td className="px-2 py-0.5 text-right text-zinc-400">{formatNumber(h.shares)}</td>
                    <td className="px-2 py-0.5 text-right text-zinc-300">{formatPercent(h.weightPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ModuleBody>
      </div>

      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] leading-snug text-zinc-600">
        Form 13F-HR holdings from SEC EDGAR — a quarterly, up-to-45-days-delayed, long-only snapshot of US
        13(f) securities (no shorts, cash, or non-US positions). Descriptive filing data, not investment advice.
      </p>
    </div>
  );
}
