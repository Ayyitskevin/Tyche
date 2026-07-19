import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Candle, FinancialStatement } from '@tyche/contracts';
import { valuationHistory } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

interface ValuationInputs {
  statements: FinancialStatement[];
  candles: Candle[];
}

/**
 * Fetch fundamentals (primary — drives the capability ladder) and price history
 * together so ModuleBody's one loading/error ladder covers both. If the price
 * fetch fails the statements still render (multiples degrade to "—").
 */
async function loadValuation(symbol: string): Promise<EnvelopeResult<ValuationInputs>> {
  const fin = await api.getFinancials(symbol, { period: 'annual' });
  if (!fin.ok) return fin; // propagate capability_unavailable / error
  const hist = await api.getHistory(symbol, { range: '5y', interval: '1d' });
  return {
    ok: true,
    data: { statements: fin.data, candles: hist.ok ? hist.data.candles : [] },
    provenance: fin.provenance,
  };
}

function noSymbol(): Promise<EnvelopeResult<ValuationInputs>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

/** A multiple like '25.3×'; '—' when null. */
function mult(n: number | null): string {
  return n === null ? '—' : `${formatNumber(n, { decimals: 1 })}×`;
}
function money(n: number | null): string {
  return n === null ? '—' : formatNumber(n, { decimals: 2 });
}

/**
 * MULT — trailing P/E and P/S at each reported annual fiscal year-end (reported EPS /
 * sales-per-share against the share price on that date), the current multiples, and
 * the historical range. Descriptive analytics over reported filings and past prices —
 * not a valuation opinion, not investment advice.
 */
export function ValuationModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const data = useApiData(() => (symbol ? loadValuation(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const inputs = data.data;
  const v = useMemo(
    () => valuationHistory(inputs?.statements ?? [], inputs?.candles ?? [], symbol ?? ''),
    [inputs, symbol],
  );

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · valuation multiples</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No fundamentals for ${symbol}.`}>
          {() =>
            v.points.length === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">No annual financial statements for {symbol}.</div>
            ) : (
              <div className="p-2">
                <div className="mb-2 grid grid-cols-3 gap-2 text-[11px]">
                  <Tile label="Price" value={money(v.currentPrice)} />
                  <Tile label="P/E (current)" value={mult(v.currentPe)} />
                  <Tile label="P/S (current)" value={mult(v.currentPs)} />
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 text-[10px]">
                  <Tile label="P/E range (reported yrs)" value={`${mult(v.peBand.min)} · avg ${mult(v.peBand.avg)} · ${mult(v.peBand.max)}`} />
                  <Tile label="P/S range (reported yrs)" value={`${mult(v.psBand.min)} · avg ${mult(v.psBand.avg)} · ${mult(v.psBand.max)}`} />
                </div>
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="text-[10px] uppercase text-zinc-600">
                    <tr>
                      <th className="px-2 py-0.5 text-left font-medium">FY</th>
                      <th className="px-2 py-0.5 text-right font-medium">EPS</th>
                      <th className="px-2 py-0.5 text-right font-medium">Price</th>
                      <th className="px-2 py-0.5 text-right font-medium">P/E</th>
                      <th className="px-2 py-0.5 text-right font-medium">P/S</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.points.map((p) => (
                      <tr key={p.fiscalDate} className="border-b border-zinc-900">
                        <td className="px-2 py-0.5 text-zinc-400">{p.fiscalYear ?? p.fiscalDate.slice(0, 4)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{money(p.eps)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{money(p.price)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-200">{mult(p.pe)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-200">{mult(p.ps)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  Trailing multiples: reported annual EPS / sales-per-share against the share price on each fiscal date,
                  and the latest price against the most recent reported year. P/E is omitted when earnings were zero or
                  negative. Only the last {v.points.length} reported year{v.points.length === 1 ? '' : 's'} are covered.
                  Descriptive over reported filings and past prices — not a valuation opinion, not investment advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        SEC EDGAR company-facts financials × price history · descriptive, not advice.
      </p>
    </div>
  );
}

function Tile({ label, value, tone = 'text-zinc-200' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`font-mono ${tone}`}>{value}</div>
    </div>
  );
}
