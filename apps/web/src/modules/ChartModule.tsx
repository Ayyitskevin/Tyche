import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, formatNumber, formatPercent } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { AdvancedChart } from './AdvancedChart';
import { OVERLAY_COLORS, type ChartOverlay } from './chartScale';
import type { HistoricalSeries } from '@tyche/contracts';

const RANGES = ['1mo', '3mo', '6mo', '1y', '5y'] as const;
const SMA_PERIOD = 20;
const EMA_PERIOD = 50;
const RSI_PERIOD = 14;

function noSymbol(): Promise<EnvelopeResult<HistoricalSeries>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Active accent color; defaults to the standard sky highlight. */
  color?: string;
}

function Chip({ label, active, onClick, color }: ChipProps) {
  const style = active && color ? { color, borderColor: color } : undefined;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={style}
      className={`rounded border px-1.5 py-0.5 text-[11px] ${
        active
          ? color
            ? 'border-current bg-zinc-800/60'
            : 'border-sky-500/40 bg-sky-500/20 text-sky-300'
          : 'border-transparent text-zinc-500 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  );
}

export function ChartModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const range = (state.range as string) ?? '6mo';
  const chartType = (state.chartType as 'line' | 'candles') ?? 'candles';
  const smaOn = state.sma === true;
  const emaOn = state.ema === true;
  const rsiOn = state.rsi === true;

  const history = useApiData(
    () => (symbol ? api.getHistory(symbol, { range, interval: '1d' }) : noSymbol()),
    [symbol, range],
  );
  useReportProvenance(reportProvenance, history.provenance);

  const overlays = useMemo<ChartOverlay[]>(() => {
    const out: ChartOverlay[] = [];
    if (smaOn) out.push({ kind: 'sma', period: SMA_PERIOD });
    if (emaOn) out.push({ kind: 'ema', period: EMA_PERIOD });
    return out;
  }, [smaOn, emaOn]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {RANGES.map((r) => (
          <Chip key={r} label={r} active={r === range} onClick={() => setState({ range: r })} />
        ))}
        <span className="mx-1 h-3 w-px bg-zinc-800" />
        <Chip label="Line" active={chartType === 'line'} onClick={() => setState({ chartType: 'line' })} />
        <Chip
          label="Candles"
          active={chartType === 'candles'}
          onClick={() => setState({ chartType: 'candles' })}
        />
        <span className="mx-1 h-3 w-px bg-zinc-800" />
        <Chip
          label={`SMA ${SMA_PERIOD}`}
          active={smaOn}
          color={OVERLAY_COLORS.sma}
          onClick={() => setState({ sma: !smaOn })}
        />
        <Chip
          label={`EMA ${EMA_PERIOD}`}
          active={emaOn}
          color={OVERLAY_COLORS.ema}
          onClick={() => setState({ ema: !emaOn })}
        />
        <Chip label="RSI" active={rsiOn} color="#60a5fa" onClick={() => setState({ rsi: !rsiOn })} />
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
                  <AdvancedChart
                    candles={series.candles}
                    type={chartType}
                    overlays={overlays}
                    rsiPeriod={rsiOn ? RSI_PERIOD : null}
                    fill
                  />
                </div>
              </div>
            );
          }}
        </ModuleBody>
      </div>
    </div>
  );
}
