import { useMemo, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { closes, normalizeToBase } from '@tyche/analytics';
import { formatSigned } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { ComparisonChart, type ComparisonSeries } from './ComparisonChart';

const RANGES = ['1mo', '3mo', '6mo', '1y', '5y'] as const;

/** Original, fixed series palette (index-keyed). */
const SERIES_COLORS = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185'];

interface SeriesResult {
  symbol: string;
  closes: number[];
  ok: boolean;
}

/** Fetch every symbol's history; the primary drives the capability/error ladder. */
async function loadComparison(symbols: string[], range: string): Promise<EnvelopeResult<SeriesResult[]>> {
  const primarySymbol = symbols[0];
  if (!primarySymbol) return { ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null };
  const primary = await api.getHistory(primarySymbol, { range, interval: '1d' });
  if (!primary.ok) return primary; // propagate capability_unavailable / error
  const rest = await Promise.all(
    symbols.slice(1).map(async (sym): Promise<SeriesResult> => {
      const res = await api.getHistory(sym, { range, interval: '1d' });
      return res.ok ? { symbol: sym, closes: closes(res.data.candles), ok: true } : { symbol: sym, closes: [], ok: false };
    }),
  );
  const series: SeriesResult[] = [{ symbol: primarySymbol, closes: closes(primary.data.candles), ok: true }, ...rest];
  return { ok: true, data: series, provenance: primary.provenance };
}

export function ComparisonModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const range = (state.range as string) ?? '6mo';
  const extra = useMemo(() => (Array.isArray(state.symbols) ? (state.symbols as string[]) : []), [state.symbols]);
  const symbols = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [symbol, ...extra]) {
      const up = s?.toUpperCase();
      if (up && !seen.has(up)) {
        seen.add(up);
        out.push(up);
      }
    }
    return out;
  }, [symbol, extra]);

  const data = useApiData(() => loadComparison(symbols, range), [symbols.join(','), range]);
  useReportProvenance(reportProvenance, data.provenance);
  const [input, setInput] = useState('');

  function addSymbol() {
    const sym = input.trim().toUpperCase();
    setInput('');
    if (!sym || symbols.includes(sym)) return;
    setState({ ...state, symbols: [...extra, sym] });
  }
  function removeSymbol(sym: string) {
    setState({ ...state, symbols: extra.filter((s) => s.toUpperCase() !== sym) });
  }

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setState({ ...state, range: r })}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              r === range ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'
            }`}
          >
            {r}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addSymbol();
            }}
            placeholder="add symbol"
            spellCheck={false}
            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={addSymbol}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
          >
            +
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No history for ${symbol}.`}>
          {(results) => {
            const primary = results[0];
            if (!primary || primary.closes.length === 0) {
              return <div className="flex h-full items-center justify-center text-xs text-zinc-600">No history for {symbol}.</div>;
            }
            const chartSeries: ComparisonSeries[] = results
              .filter((s) => s.ok && s.closes.length >= 2)
              .map((s, i) => ({ symbol: s.symbol, values: normalizeToBase(s.closes), color: SERIES_COLORS[i % SERIES_COLORS.length]! }));
            const colorOf = new Map(chartSeries.map((s) => [s.symbol, s.color]));
            return (
              <div className="flex h-full flex-col">
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-2 py-1.5 text-[11px]">
                  {results.map((s) => {
                    const color = colorOf.get(s.symbol);
                    const normalized = s.ok && s.closes.length >= 2 ? normalizeToBase(s.closes) : [];
                    const endPct = normalized.length > 0 ? normalized[normalized.length - 1]! - 100 : null;
                    const removable = s.symbol !== symbol.toUpperCase();
                    return (
                      <span
                        key={s.symbol}
                        className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color ?? '#52525b' }} />
                        <span className="font-mono text-zinc-200">{s.symbol}</span>
                        {!s.ok ? (
                          <span className="text-zinc-600">no data</span>
                        ) : (
                          endPct !== null && <span className={endPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatSigned(endPct)}%</span>
                        )}
                        {removable && (
                          <button
                            type="button"
                            aria-label={`Remove ${s.symbol}`}
                            onClick={() => removeSymbol(s.symbol)}
                            className="text-zinc-600 hover:text-red-400"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="min-h-0 flex-1 p-2">
                  <ComparisonChart series={chartSeries} fill />
                </div>
              </div>
            );
          }}
        </ModuleBody>
      </div>
    </div>
  );
}
