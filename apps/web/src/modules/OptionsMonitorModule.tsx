import { useMemo } from 'react';
import type { OptionChain, OptionContract } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { maxPain } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';

function noSymbol(): Promise<EnvelopeResult<OptionChain>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

/** Per-side numeric columns, in display order. */
const NUM_COLS: Array<{ key: string; label: string; get: (c: OptionContract) => number | null | undefined; decimals: number }> = [
  { key: 'bid', label: 'Bid', get: (c) => c.bid, decimals: 2 },
  { key: 'ask', label: 'Ask', get: (c) => c.ask, decimals: 2 },
  { key: 'last', label: 'Last', get: (c) => c.last, decimals: 2 },
  { key: 'vol', label: 'Vol', get: (c) => c.volume, decimals: 0 },
  { key: 'oi', label: 'OI', get: (c) => c.openInterest, decimals: 0 },
  { key: 'delta', label: 'δ', get: (c) => c.greeks?.delta, decimals: 3 },
  { key: 'gamma', label: 'γ', get: (c) => c.greeks?.gamma, decimals: 4 },
  { key: 'theta', label: 'θ', get: (c) => c.greeks?.theta, decimals: 3 },
  { key: 'vega', label: 'Vega', get: (c) => c.greeks?.vega, decimals: 3 },
];

type ChainRow = { strike: number; call: OptionContract | undefined; put: OptionContract | undefined };

/** Flatten the two-sided chain to one export row per strike: call-side, strike, put-side. */
const EXPORT_COLUMNS: Array<ExportColumn<ChainRow>> = [
  { key: 'strike', label: 'Strike', value: (r) => r.strike },
  ...NUM_COLS.map((c) => ({ key: `call_${c.key}`, label: `Call ${c.label}`, value: (r: ChainRow) => (r.call ? c.get(r.call) ?? null : null) })),
  { key: 'call_iv', label: 'Call IV', value: (r: ChainRow) => r.call?.impliedVolatility ?? null },
  ...NUM_COLS.map((c) => ({ key: `put_${c.key}`, label: `Put ${c.label}`, value: (r: ChainRow) => (r.put ? c.get(r.put) ?? null : null) })),
  { key: 'put_iv', label: 'Put IV', value: (r: ChainRow) => r.put?.impliedVolatility ?? null },
];

function pct(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;
}

function Cells({ contract }: { contract: OptionContract | undefined }) {
  const itm = contract?.inTheMoney ? 'text-sky-300' : 'text-zinc-300';
  return (
    <>
      {NUM_COLS.map((col) => (
        <td key={col.key} className={`px-2 py-1 text-right ${itm}`}>
          {formatNumber(contract ? col.get(contract) : null, { decimals: col.decimals })}
        </td>
      ))}
      <td className={`px-2 py-1 text-right ${itm}`}>{pct(contract?.impliedVolatility)}</td>
    </>
  );
}

export function OptionsMonitorModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const chain = useApiData<OptionChain>(() => (symbol ? api.getOptions(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, chain.provenance);

  const expirations = chain.data?.expirations ?? [];
  const expiry = (state.expiry as string | undefined) ?? expirations[0];

  const { rows, maxPainStrike } = useMemo(() => {
    const contracts = (chain.data?.contracts ?? []).filter((c) => c.expiry === expiry);
    const strikes = [...new Set(contracts.map((c) => c.strike))].sort((a, b) => a - b);
    return {
      rows: strikes.map((strike) => ({
        strike,
        call: contracts.find((c) => c.strike === strike && c.type === 'call'),
        put: contracts.find((c) => c.strike === strike && c.type === 'put'),
      })),
      maxPainStrike: maxPain(contracts),
    };
  }, [chain.data, expiry]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      {expirations.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800 px-2 py-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-zinc-600">Expiry</span>
          {expirations.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setState({ ...state, expiry: e })}
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                e === expiry ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'
              }`}
            >
              {e}
            </button>
          ))}
          {maxPainStrike !== null && (
            <span
              className="ml-auto shrink-0 whitespace-nowrap rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
              title="Max pain: the expiry strike minimizing total open-interest intrinsic payout (descriptive analytics)"
            >
              Max pain {formatNumber(maxPainStrike, { decimals: 2 })}
            </span>
          )}
          <div className={`${maxPainStrike !== null ? '' : 'ml-auto'} shrink-0 pl-2`}>
            <TableExport name={`${symbol}-options-${expiry ?? ''}`} exportColumns={EXPORT_COLUMNS} rows={rows} provenance={chain.provenance} />
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={chain} missingCapabilities={missingCapabilities} emptyMessage={`No option chain for ${symbol}.`}>
          {(data) =>
            data.contracts.length === 0 || rows.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">No option chain for {symbol}.</div>
            ) : (
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1 text-center" colSpan={NUM_COLS.length + 1}>
                      Calls
                    </th>
                    <th className="border-x border-zinc-700 px-2 py-1 text-center">Strike</th>
                    <th className="px-2 py-1 text-center" colSpan={NUM_COLS.length + 1}>
                      Puts
                    </th>
                  </tr>
                  <tr>
                    {NUM_COLS.map((c) => (
                      <th key={`c-${c.key}`} className="px-2 py-1 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-right font-medium">IV</th>
                    <th className="border-x border-zinc-700 px-2 py-1 text-center font-medium text-zinc-300">·</th>
                    {NUM_COLS.map((c) => (
                      <th key={`p-${c.key}`} className="px-2 py-1 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-right font-medium">IV</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isMaxPain = row.strike === maxPainStrike;
                    return (
                      <tr
                        key={row.strike}
                        className={`border-b border-zinc-900 hover:bg-zinc-900/40 ${isMaxPain ? 'bg-amber-500/10' : ''}`}
                      >
                        <Cells contract={row.call} />
                        <td
                          className={`border-x border-zinc-700 px-2 py-1 text-center font-semibold ${
                            isMaxPain ? 'text-amber-300' : 'text-zinc-100'
                          }`}
                          title={isMaxPain ? 'Max-pain strike' : undefined}
                        >
                          {formatNumber(row.strike, { decimals: 2 })}
                        </td>
                        <Cells contract={row.put} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </ModuleBody>
      </div>
    </div>
  );
}
