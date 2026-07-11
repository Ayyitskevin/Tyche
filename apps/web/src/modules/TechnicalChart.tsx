import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HistoricalSeries } from '@tyche/contracts';
import { changeToneClass, formatNumber, formatPercent } from '@tyche/ui';
import { AdvancedChart } from './AdvancedChart';
import { OVERLAY_COLORS, panWindow, zoomWindow, type ChartOverlay, type ViewWindow } from './chartScale';

const SMA_PERIOD = 20;
const EMA_PERIOD = 50;
const RSI_PERIOD = 14;
const BOLL_PERIOD = 20;
const BOLL_MULT = 2;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const STOCH_K_PERIOD = 14;
const STOCH_D_PERIOD = 3;
const BOLL_COLOR = '#f472b6';
const MACD_COLOR = '#38bdf8';
const VWAP_COLOR = '#22d3ee';
const STOCH_COLOR = '#38bdf8';

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
  const bollOn = state.bollinger === true;
  const vwapOn = state.vwap === true;
  const rsiOn = state.rsi === true;
  const macdOn = state.macd === true;
  const stochOn = state.stoch === true;
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
      <Chip label="Boll" active={bollOn} color={BOLL_COLOR} onClick={() => setState({ bollinger: !bollOn })} />
      <Chip label="VWAP" active={vwapOn} color={VWAP_COLOR} onClick={() => setState({ vwap: !vwapOn })} />
      <Chip label="RSI" active={rsiOn} color="#60a5fa" onClick={() => setState({ rsi: !rsiOn })} />
      <Chip label="MACD" active={macdOn} color={MACD_COLOR} onClick={() => setState({ macd: !macdOn })} />
      <Chip label="Stoch" active={stochOn} color={STOCH_COLOR} onClick={() => setState({ stoch: !stochOn })} />
      <Chip label="Vol" active={volOn} onClick={() => setState({ volume: !volOn })} />
      <Chip label="Log" active={state.log === true} onClick={() => setState({ log: state.log !== true })} />
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
  const bollOn = state.bollinger === true;
  const vwapOn = state.vwap === true;
  const rsiOn = state.rsi === true;
  const macdOn = state.macd === true;
  const stochOn = state.stoch === true;

  // Wheel-zoom / drag-pan window over the loaded series (session-local; a new
  // symbol/range/interval resets to the full view). Indicators recompute over
  // the visible slice.
  const [view, setView] = useState<ViewWindow | null>(null);
  const total = series.candles.length;
  useEffect(() => {
    setView(null);
  }, [series.symbol, series.range, series.interval, total]);

  const overlays = useMemo<ChartOverlay[]>(() => {
    const out: ChartOverlay[] = [];
    if (smaOn) out.push({ kind: 'sma', period: SMA_PERIOD });
    if (emaOn) out.push({ kind: 'ema', period: EMA_PERIOD });
    return out;
  }, [smaOn, emaOn]);

  // Memoized so a stable identity is passed while a study is off (null) or on.
  const bollinger = useMemo(() => (bollOn ? { period: BOLL_PERIOD, mult: BOLL_MULT } : null), [bollOn]);
  const macd = useMemo(
    () => (macdOn ? { fast: MACD_FAST, slow: MACD_SLOW, signal: MACD_SIGNAL } : null),
    [macdOn],
  );
  const stoch = useMemo(
    () => (stochOn ? { kPeriod: STOCH_K_PERIOD, dPeriod: STOCH_D_PERIOD } : null),
    [stochOn],
  );

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
      <div className="relative min-h-0 flex-1">
        <AdvancedChart
          candles={view ? series.candles.slice(view.start, view.end + 1) : series.candles}
          type={type}
          overlays={overlays}
          rsiPeriod={rsiOn ? RSI_PERIOD : null}
          bollinger={bollinger}
          macd={macd}
          stochastic={stoch}
          vwap={vwapOn}
          showVolume={state.volume !== false}
          logScale={state.log === true}
          onZoom={(anchor, factor) => setView((v) => zoomWindow(v, total, anchor, factor))}
          onPan={(bars) => setView((v) => panWindow(v, total, bars))}
          onResetView={() => setView(null)}
          fill
        />
        {view && (
          <button
            type="button"
            onClick={() => setView(null)}
            className="absolute right-2 top-1 rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
            title="Reset zoom (double-click the chart)"
          >
            {view.end - view.start + 1} bars · reset
          </button>
        )}
      </div>
    </div>
  );
}
