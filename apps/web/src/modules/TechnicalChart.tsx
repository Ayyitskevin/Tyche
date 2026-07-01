import { useMemo, type ReactNode } from 'react';
import type { HistoricalSeries } from '@tyche/contracts';
import { changeToneClass, formatNumber, formatPercent } from '@tyche/ui';
import { AdvancedChart } from './AdvancedChart';
import { OVERLAY_COLORS, type ChartOverlay } from './chartScale';

const SMA_PERIOD = 20;
const EMA_PERIOD = 50;
const RSI_PERIOD = 14;

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Active accent color; defaults to the standard sky highlight. */
  color?: string;
}

/** Compact toggle chip shared by the chart controls (and the time selectors). */
export function Chip({ label, active, onClick, color }: ChipProps) {
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

function chartType(state: Record<string, unknown>): 'line' | 'candles' {
  return (state.chartType as 'line' | 'candles' | undefined) ?? 'candles';
}

export interface TechnicalChartControlsProps {
  state: Record<string, unknown>;
  setState: (patch: Record<string, unknown>) => void;
  /** Time-axis selector (range or interval chips) rendered before the type/overlay controls. */
  leadingControls?: ReactNode;
}

/**
 * The chart control row: a time-axis selector slot, Line/Candles, and the
 * SMA/EMA/RSI overlay toggles. Rendered OUTSIDE the data-render ladder so the
 * controls stay visible during loading / capability-gap / empty states (matching
 * the original GP). Toggles read from / write to the panel `state`, so they persist.
 */
export function TechnicalChartControls({ state, setState, leadingControls }: TechnicalChartControlsProps) {
  const type = chartType(state);
  const smaOn = state.sma === true;
  const emaOn = state.ema === true;
  const rsiOn = state.rsi === true;
  const volOn = state.volume !== false; // volume pane defaults ON
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
      {leadingControls}
      {leadingControls && <span className="mx-1 h-3 w-px bg-zinc-800" />}
      <Chip label="Line" active={type === 'line'} onClick={() => setState({ chartType: 'line' })} />
      <Chip label="Candles" active={type === 'candles'} onClick={() => setState({ chartType: 'candles' })} />
      <span className="mx-1 h-3 w-px bg-zinc-800" />
      <Chip label={`SMA ${SMA_PERIOD}`} active={smaOn} color={OVERLAY_COLORS.sma} onClick={() => setState({ sma: !smaOn })} />
      <Chip label={`EMA ${EMA_PERIOD}`} active={emaOn} color={OVERLAY_COLORS.ema} onClick={() => setState({ ema: !emaOn })} />
      <Chip label="RSI" active={rsiOn} color="#60a5fa" onClick={() => setState({ rsi: !rsiOn })} />
      <Chip label="Vol" active={volOn} onClick={() => setState({ volume: !volOn })} />
    </div>
  );
}

export interface TechnicalChartBodyProps {
  series: HistoricalSeries;
  state: Record<string, unknown>;
  /** Appended to the change line (e.g. the range or interval in effect). */
  contextLabel: string;
}

/** The price/change header and the {@link AdvancedChart}, given a loaded series. */
export function TechnicalChartBody({ series, state, contextLabel }: TechnicalChartBodyProps) {
  const type = chartType(state);
  const smaOn = state.sma === true;
  const emaOn = state.ema === true;
  const rsiOn = state.rsi === true;

  const overlays = useMemo<ChartOverlay[]>(() => {
    const out: ChartOverlay[] = [];
    if (smaOn) out.push({ kind: 'sma', period: SMA_PERIOD });
    if (emaOn) out.push({ kind: 'ema', period: EMA_PERIOD });
    return out;
  }, [smaOn, emaOn]);

  const first = series.candles[0]?.c ?? 0;
  const last = series.candles[series.candles.length - 1]?.c ?? 0;
  const change = last - first;
  const changePct = first ? (change / first) * 100 : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-2 px-1">
        <span className="font-mono text-lg text-zinc-100">{formatNumber(last)}</span>
        <span className={`font-mono text-xs ${changeToneClass(change)}`}>
          {formatNumber(change)} ({formatPercent(changePct)}) · {contextLabel}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <AdvancedChart
          candles={series.candles}
          type={type}
          overlays={overlays}
          rsiPeriod={rsiOn ? RSI_PERIOD : null}
          showVolume={state.volume !== false}
          fill
        />
      </div>
    </div>
  );
}
