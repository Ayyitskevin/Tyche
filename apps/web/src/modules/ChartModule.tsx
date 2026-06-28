import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, formatNumber, formatPercent } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { PriceChart } from './PriceChart';
import type { HistoricalSeries } from '@tyche/contracts';

const RANGES = ['1mo', '3mo', '6mo', '1y', '5y'] as const;

function noSymbol(): Promise<EnvelopeResult<HistoricalSeries>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

export function ChartModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const range = (state.range as string) ?? '6mo';
  const history = useApiData(
    () => (symbol ? api.getHistory(symbol, { range, interval: '1d' }) : noSymbol()),
    [symbol, range],
  );
  useReportProvenance(reportProvenance, history.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setState({ range: r })}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              r === range ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ModuleBody state={history} missingCapabilities={missingCapabilities}>
          {(series) => {
            const first = series.candles[0]?.c ?? 0;
            const last = series.candles[series.candles.length - 1]?.c ?? 0;
            const change = last - first;
            const changePct = first ? (change / first) * 100 : 0;
            return (
              <div className="flex h-full flex-col">
                <div className="flex items-baseline gap-2 px-1">
                  <span className="font-mono text-lg text-zinc-100">{formatNumber(last)}</span>
                  <span className={`font-mono text-xs ${changeToneClass(change)}`}>
                    {formatNumber(change)} ({formatPercent(changePct)}) · {range}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <PriceChart candles={series.candles} fill />
                </div>
              </div>
            );
          }}
        </ModuleBody>
      </div>
    </div>
  );
}
