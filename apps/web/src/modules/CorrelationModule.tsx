import { useMemo, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { closes, simpleReturns, correlationMatrix } from '@tyche/analytics';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';

const RANGES = ['3mo', '6mo', '1y', '2y', '5y'] as const;

interface SeriesReturns {
  symbol: string;
  returns: number[];
}

/** Fetch each symbol's daily history and reduce to a return series; primary drives the ladder. */
async function loadReturns(symbols: string[], range: string): Promise<EnvelopeResult<SeriesReturns[]>> {
  const primary = symbols[0];
  if (!primary) return { ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null };
  const first = await api.getHistory(primary, { range, interval: '1d' });
  if (!first.ok) return first; // propagate capability_unavailable / error
  const series = await Promise.all(
    symbols.map(async (sym): Promise<SeriesReturns> => {
      if (sym === primary) return { symbol: sym, returns: simpleReturns(closes(first.data.candles)) };
      const res = await api.getHistory(sym, { range, interval: '1d' });
      return { symbol: sym, returns: res.ok ? simpleReturns(closes(res.data.candles)) : [] };
    }),
  );
  return { ok: true, data: series, provenance: first.provenance };
}

/** Diverging cell tint: red for negative, emerald for positive, stronger with magnitude. */
function corrColor(v: number): string {
  const t = Math.min(1, Math.abs(v));
  return v >= 0 ? `rgba(52, 211, 153, ${0.1 + 0.5 * t})` : `rgba(248, 113, 113, ${0.1 + 0.5 * t})`;
}

export function CorrelationModule({ symbol, args, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const range = (state.range as string) ?? '1y';
  const primary = symbol?.toUpperCase() ?? null;
  const seededPeers = useMemo(
    () => args.map((a) => a.toUpperCase()).filter((a) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(a)),
    [args],
  );
  const extra = useMemo(
    () => (Array.isArray(state.symbols) ? (state.symbols as string[]) : seededPeers),
    [state.symbols, seededPeers],
  );
  const symbols = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [primary, ...extra]) {
      const up = s?.toUpperCase();
      if (up && !seen.has(up)) {
        seen.add(up);
        out.push(up);
      }
    }
    return out;
  }, [primary, extra]);

  const data = useApiData(() => loadReturns(symbols, range), [symbols.join(','), range]);
  useReportProvenance(reportProvenance, data.provenance);
  const [input, setInput] = useState('');

  const rows = data.data ?? [];
  const matrix = useMemo(() => correlationMatrix(rows.map((s) => s.returns)), [rows]);

  function addSymbol() {
    const sym = input.trim().toUpperCase();
    setInput('');
    if (!sym || symbols.includes(sym)) return;
    setState({ ...state, symbols: [...extra.filter((s) => s.toUpperCase() !== primary), sym] });
  }
  function removeSymbol(sym: string) {
    setState({ ...state, symbols: extra.filter((s) => s.toUpperCase() !== sym) });
  }

  if (!symbol) return <SymbolRequired />;

  const labels = rows.map((r) => r.symbol);
  const exportColumns: ExportColumn<{ symbol: string; values: number[] }>[] = [
    { key: 'symbol', label: '', value: (r) => r.symbol },
    ...labels.map((l, j) => ({ key: l, label: l, value: (r: { values: number[] }) => r.values[j]?.toFixed(4) ?? '' })),
  ];
  const exportRows = labels.map((l, i) => ({ symbol: l, values: matrix[i] ?? [] }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === range}
            onClick={() => setState({ ...state, range: r })}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              r === range ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'
            }`}
          >
            {r}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-zinc-800" />
        {extra
          .filter((s) => s.toUpperCase() !== primary)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => removeSymbol(s.toUpperCase())}
              title="Remove"
              className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:border-red-500/40 hover:text-red-300"
            >
              {s.toUpperCase()} ✕
            </button>
          ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addSymbol();
          }}
          aria-label="Add symbol"
          placeholder="+ ticker"
          className="w-20 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none"
        />
        <div className="ml-auto">
          <TableExport name={`${primary}-correlation`} exportColumns={exportColumns} rows={exportRows} provenance={data.provenance} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage="No correlation data.">
          {() => (
            <table className="border-collapse font-mono text-[11px]">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-[10px] uppercase text-zinc-500">Return ρ</th>
                  {labels.map((l) => (
                    <th key={l} className="px-2 py-1 text-right text-[10px] uppercase text-zinc-500">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labels.map((rowLabel, i) => (
                  <tr key={rowLabel}>
                    <td className="whitespace-nowrap px-2 py-1 text-zinc-400">{rowLabel}</td>
                    {labels.map((colLabel, j) => {
                      const v = matrix[i]?.[j] ?? 0;
                      return (
                        <td
                          key={colLabel}
                          className="px-2 py-1 text-right text-zinc-100"
                          style={{ backgroundColor: i === j ? 'transparent' : corrColor(v) }}
                        >
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ModuleBody>
      </div>

      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] leading-snug text-zinc-600">
        Pearson correlation of daily returns over the selected window (pairwise-aligned). Educational
        analytics; not investment advice.
      </p>
    </div>
  );
}
