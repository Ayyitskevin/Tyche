import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Candle } from '@tyche/contracts';
import { marketSensitivity } from '@tyche/analytics';
import { formatNumber, formatPercent } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

interface BetaPair {
  asset: Candle[];
  bench: Candle[];
}

/**
 * Fetch the asset and benchmark histories together so ModuleBody's one loading/
 * error ladder covers BOTH — no false "insufficient data" flash while the second
 * request is in flight, and a benchmark failure surfaces as an error rather than
 * being misread as insufficient overlap. The asset drives the capability ladder.
 */
async function loadBeta(symbol: string, benchmark: string): Promise<EnvelopeResult<BetaPair>> {
  const asset = await api.getHistory(symbol, { range: '5y', interval: '1d' });
  if (!asset.ok) return asset; // propagate capability_unavailable / error
  const bench = await api.getHistory(benchmark, { range: '5y', interval: '1d' });
  if (!bench.ok) {
    return { ok: false, error: { kind: bench.error.kind, message: `Benchmark ${benchmark}: ${bench.error.message}` }, provenance: null };
  }
  return { ok: true, data: { asset: asset.data.candles, bench: bench.data.candles }, provenance: asset.provenance };
}

function noSymbol(): Promise<EnvelopeResult<BetaPair>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

const BENCHMARKS = ['SPY', 'QQQ'];

function toneOf(n: number | null): string {
  if (n === null) return 'text-zinc-500';
  return n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-zinc-300';
}

function dec(n: number | null): string {
  return n === null ? '—' : formatNumber(n, { decimals: 2 });
}

/**
 * BETA — a symbol's market sensitivity versus a benchmark (default SPY): beta,
 * annualized alpha, R², correlation, and up/down capture over the aligned daily
 * price histories. Descriptive analytics over past prices — not predictive, not
 * investment advice.
 */
export function BetaModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const benchmark =
    typeof state.benchmark === 'string' && state.benchmark ? state.benchmark.toUpperCase() : 'SPY';
  const data = useApiData(() => (symbol ? loadBeta(symbol, benchmark) : noSymbol()), [symbol, benchmark]);
  useReportProvenance(reportProvenance, data.provenance);
  const pair = data.data;
  const stats = useMemo(
    () => marketSensitivity(pair?.asset ?? [], pair?.bench ?? [], symbol ?? '', benchmark),
    [pair, symbol, benchmark],
  );

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · sensitivity</span>
        <div className="ml-auto flex overflow-hidden rounded border border-zinc-700">
          {BENCHMARKS.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={benchmark === b}
              onClick={() => setState({ benchmark: b })}
              className={`px-1.5 py-0.5 text-[11px] ${benchmark === b ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No price history for ${symbol}.`}>
          {() =>
            stats.observations < 2 ? (
              <div className="p-3 text-[11px] text-zinc-500">
                Not enough overlapping daily history between {symbol} and {benchmark} to measure sensitivity.
              </div>
            ) : (
              <div className="p-2">
                <div className="mb-2 text-[10px] text-zinc-600">vs {benchmark}</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <Tile label="Beta" value={dec(stats.beta)} tone={toneOf(stats.beta === null ? null : stats.beta - 1)} />
                  <Tile label="Alpha (ann.)" value={stats.alpha === null ? '—' : formatPercent(stats.alpha * 100)} tone={toneOf(stats.alpha)} />
                  <Tile label="R²" value={dec(stats.rSquared)} />
                  <Tile label="Correlation" value={dec(stats.correlation)} />
                  <Tile label="Up capture" value={stats.upCapture === null ? '—' : `${dec(stats.upCapture)}×`} />
                  <Tile label="Down capture" value={stats.downCapture === null ? '—' : `${dec(stats.downCapture)}×`} />
                </div>
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  {stats.observations} aligned daily returns
                  {stats.firstDate ? ` from ${stats.firstDate} to ${stats.lastDate}` : ''} vs {benchmark}. Beta is the
                  slope of {symbol}'s daily returns on {benchmark}'s; alpha is annualized; capture ratios compare mean
                  returns on the benchmark's up / down days. Descriptive analytics over past prices — not predictive, not
                  investment advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        Computed from loaded price history · descriptive, not advice.
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
