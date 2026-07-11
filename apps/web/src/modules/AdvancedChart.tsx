import { useEffect, useRef, useState } from 'react';
import type { Candle } from '@tyche/contracts';
import {
  bollingerBands,
  macd as macdIndicator,
  rsi,
  stochastic as stochasticIndicator,
  vwap as vwapIndicator,
} from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import {
  OVERLAY_COLORS,
  fitStudyPanes,
  niceTicks,
  overlaySeries,
  priceMapper,
  priceRange,
  tickDecimals,
  type ChartOverlay,
} from './chartScale';

export interface AdvancedChartProps {
  candles: Candle[];
  type: 'line' | 'candles';
  overlays: ChartOverlay[];
  /** RSI period for the lower study pane, or null to hide it. */
  rsiPeriod: number | null;
  /** Bollinger Bands over the price scale, or null to hide them. */
  bollinger?: { period: number; mult: number } | null;
  /** MACD lower study pane, or null to hide it. */
  macd?: { fast: number; slow: number; signal: number } | null;
  /** Stochastic lower study pane, or null to hide it. */
  stochastic?: { kPeriod: number; dPeriod: number } | null;
  /** VWAP (anchored) line over the price scale. */
  vwap?: boolean;
  /** Volume histogram pane (auto-hidden when the series carries no volume). */
  showVolume?: boolean;
  /** When true, the chart fills its parent's height; otherwise uses `height`. */
  fill?: boolean;
  height?: number;
  /** Log-scaled price axis (falls back to linear when the range includes <= 0). */
  logScale?: boolean;
  /** Wheel zoom: anchor fraction across the plot (0..1) + span factor (<1 zooms in). */
  onZoom?: (anchorFrac: number, factor: number) => void;
  /** Drag pan, in whole candles (positive = towards newer data). */
  onPan?: (deltaBars: number) => void;
  /** Double-click resets any zoom window. */
  onResetView?: () => void;
}

const UP = '#34d399';
const DOWN = '#f87171';
const RSI_COLOR = '#60a5fa';
const BOLL = '#f472b6';
const BOLL_MID = 'rgba(244, 114, 182, 0.55)';
const MACD_LINE = '#38bdf8';
const MACD_SIGNAL = '#f59e0b';
const VWAP_COLOR = '#22d3ee';
const STOCH_K = '#38bdf8';
const STOCH_D = '#f59e0b';
const GRID = 'rgba(113, 113, 122, 0.30)';
const GRID_SOFT = 'rgba(113, 113, 122, 0.14)';
const LABEL = '#71717a';
const CROSSHAIR = 'rgba(161, 161, 170, 0.85)';

const PAD_L = 8;
const PAD_Y = 10;
const AXIS_W = 54;
const AXIS_H = 16;
const GAP = 10;
const FONT = '9px ui-monospace, monospace';

/** Geometry of the last render, kept for the crosshair overlay. */
interface Layout {
  plotW: number;
  priceTop: number;
  priceH: number;
  bottom: number;
  min: number;
  max: number;
  n: number;
  intraday: boolean;
  log: boolean;
}

function timeLabel(iso: string, intraday: boolean, longSpan: boolean): string {
  const d = new Date(iso);
  if (intraday) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const month = d.toLocaleString('en-US', { month: 'short' });
  return longSpan ? `${month} ${String(d.getFullYear()).slice(2)}` : `${month} ${d.getDate()}`;
}

function xForIndex(i: number, layout: Layout, type: 'line' | 'candles'): number {
  const { plotW, n } = layout;
  return type === 'candles' ? PAD_L + (i + 0.5) * (plotW / n) : PAD_L + (i / (n - 1)) * plotW;
}

function indexForX(x: number, layout: Layout, type: 'line' | 'candles'): number {
  const { plotW, n } = layout;
  const raw = type === 'candles' ? (x - PAD_L) / (plotW / n) - 0.5 : ((x - PAD_L) / plotW) * (n - 1);
  return Math.min(n - 1, Math.max(0, Math.round(raw)));
}

/**
 * Dependency-free canvas chart. Original implementation — renders a close line
 * (area fill) or OHLC candlesticks with a labelled price axis + gridlines, a
 * labelled time axis, an optional volume histogram, optional moving-average
 * overlays, an optional RSI study pane, a last-price marker, and a crosshair
 * with an OHLCV readout (drawn on a separate overlay canvas so pointer moves
 * never redraw the chart). Nothing here is derived from any third-party
 * charting product.
 */
export function AdvancedChart({
  candles,
  type,
  overlays,
  rsiPeriod,
  bollinger = null,
  macd = null,
  stochastic = null,
  vwap = false,
  showVolume = true,
  fill = false,
  height: heightProp = 260,
  logScale = false,
  onZoom,
  onPan,
  onResetView,
}: AdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  // Latest interaction callbacks + drag state, read by listeners bound once.
  const handlersRef = useRef({ onZoom, onPan, onResetView });
  handlersRef.current = { onZoom, onPan, onResetView };
  const dragRef = useRef<{ lastX: number; carry: number } | null>(null);
  const kbIndexRef = useRef<number | null>(null);
  const [width, setWidth] = useState(600);
  const [measuredHeight, setMeasuredHeight] = useState(heightProp);
  const height = fill ? measuredHeight : heightProp;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect?.width) setWidth(Math.max(160, Math.floor(rect.width)));
      if (fill && rect?.height) setMeasuredHeight(Math.max(140, Math.floor(rect.height)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill]);

  // ---- main chart ----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Reset the crosshair whenever geometry/data change.
    layoutRef.current = null;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);

    if (candles.length < 2) return;

    const closes = candles.map((c) => c.c);
    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    const volumes = candles.map((c) => c.v ?? 0);
    const overlayData = overlays.map((o) => overlaySeries(closes, o));
    const bands = bollinger ? bollingerBands(closes, bollinger.period, bollinger.mult) : null;
    const vwapData = vwap ? vwapIndicator(highs, lows, closes, volumes) : null;
    const rsiData = rsiPeriod ? rsi(closes, rsiPeriod) : null;
    const macdData = macd ? macdIndicator(closes, macd.fast, macd.slow, macd.signal) : null;
    const stochData = stochastic ? stochasticIndicator(highs, lows, closes, stochastic.kPeriod, stochastic.dPeriod) : null;
    let hasVolume = showVolume && candles.some((c) => (c.v ?? 0) > 0);

    const innerH = height - PAD_Y * 2 - AXIS_H;
    // Lower study panes (MACD, Stochastic, RSI, in priority order) stack below
    // price/volume. fitStudyPanes drops the lowest-priority panes that can't fit
    // and sacrifices volume before them, so the price pane never collapses.
    const requestedPanes: Array<'macd' | 'stoch' | 'rsi'> = [];
    if (macdData) requestedPanes.push('macd');
    if (stochData) requestedPanes.push('stoch');
    if (rsiData) requestedPanes.push('rsi');
    const fit = fitStudyPanes(innerH, GAP, requestedPanes.length, hasVolume);
    const lowerPanes = requestedPanes.slice(0, fit.panes);
    const studyH = fit.studyH;
    const volH = fit.volH;
    hasVolume = fit.hasVolume;
    const priceH = fit.priceH;
    const priceTop = PAD_Y;
    const volTop = priceTop + priceH + GAP;
    let paneY = priceTop + priceH + GAP + (hasVolume ? volH + GAP : 0);
    const paneTops: Partial<Record<'macd' | 'stoch' | 'rsi', number>> = {};
    for (const kind of lowerPanes) {
      paneTops[kind] = paneY;
      paneY += studyH + GAP;
    }
    // Undefined when the pane was dropped for space — the draw blocks gate on it,
    // so a study that can't fit is simply not rendered (rather than drawn at y=0).
    const macdTop = paneTops.macd;
    const stochTop = paneTops.stoch;
    const rsiTop = paneTops.rsi;
    const bottom = PAD_Y + innerH;
    const plotW = width - PAD_L - AXIS_W;

    const bandRange = bands ? [bands.upper, bands.lower] : [];
    const vwapRange = vwapData ? [vwapData] : [];
    const { min, max } = priceRange(candles, type, [...overlayData, ...bandRange, ...vwapRange]);
    const n = closes.length;
    const slotW = plotW / n;

    const firstMs = Date.parse(candles[0]!.t);
    const lastMs = Date.parse(candles[n - 1]!.t);
    const intraday = (lastMs - firstMs) / (n - 1) < 20 * 3_600_000;
    const longSpan = lastMs - firstMs > 400 * 86_400_000;

    const log = logScale && min > 0;
    const layout: Layout = { plotW, priceTop, priceH, bottom, min, max, n, intraday, log };
    layoutRef.current = layout;
    const xAt = (i: number) => xForIndex(i, layout, type);
    const mapper = priceMapper(min, max, log);
    const yPrice = (v: number) => priceTop + (1 - mapper.toFrac(v)) * priceH;

    ctx.font = FONT;
    ctx.fillStyle = LABEL;

    // ---- price axis: gridlines + right labels ----
    const ticks = niceTicks(min, max, Math.min(6, Math.max(3, Math.round(priceH / 42))));
    const decimals = tickDecimals(ticks);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const tick of ticks) {
      const y = yPrice(tick);
      ctx.strokeStyle = GRID_SOFT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(PAD_L + plotW, y);
      ctx.stroke();
      ctx.fillStyle = LABEL;
      ctx.fillText(tick.toFixed(decimals), PAD_L + plotW + 6, y);
    }

    // ---- time axis: soft vertical gridlines + bottom labels ----
    const timeCount = Math.min(8, Math.max(2, Math.floor(plotW / 72)));
    const step = Math.max(1, Math.ceil(n / timeCount));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < n; i += step) {
      const x = xAt(i);
      ctx.strokeStyle = GRID_SOFT;
      ctx.beginPath();
      ctx.moveTo(x, priceTop);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillStyle = LABEL;
      ctx.fillText(timeLabel(candles[i]!.t, intraday, longSpan), x, bottom + 4);
    }

    // ---- price pane ----
    if (type === 'candles') {
      const bodyW = Math.max(1, slotW * 0.62);
      for (let i = 0; i < n; i++) {
        const c = candles[i]!;
        const cx = xAt(i);
        const up = c.c >= c.o;
        ctx.strokeStyle = up ? UP : DOWN;
        ctx.fillStyle = up ? UP : DOWN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, yPrice(c.h));
        ctx.lineTo(cx, yPrice(c.l));
        ctx.stroke();
        const yo = yPrice(c.o);
        const yc = yPrice(c.c);
        ctx.fillRect(cx - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1, Math.abs(yc - yo)));
      }
    } else {
      const up = (closes[n - 1] ?? 0) >= (closes[0] ?? 0);
      ctx.beginPath();
      ctx.moveTo(xAt(0), yPrice(closes[0]!));
      closes.forEach((v, i) => ctx.lineTo(xAt(i), yPrice(v)));
      ctx.lineTo(xAt(n - 1), priceTop + priceH);
      ctx.lineTo(xAt(0), priceTop + priceH);
      ctx.closePath();
      ctx.fillStyle = up ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xAt(0), yPrice(closes[0]!));
      closes.forEach((v, i) => ctx.lineTo(xAt(i), yPrice(v)));
      ctx.strokeStyle = up ? UP : DOWN;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ---- moving-average overlays (price scale) ----
    overlayData.forEach((series, oi) => {
      ctx.strokeStyle = OVERLAY_COLORS[overlays[oi]!.kind];
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      series.forEach((v, i) => {
        if (v === null) return;
        if (started) ctx.lineTo(xAt(i), yPrice(v));
        else {
          ctx.moveTo(xAt(i), yPrice(v));
          started = true;
        }
      });
      ctx.stroke();
    });

    // ---- Bollinger Bands (price scale) ----
    if (bands) {
      const drawBand = (series: Array<number | null>, dash: number[]) => {
        ctx.setLineDash(dash);
        ctx.beginPath();
        let started = false;
        series.forEach((v, i) => {
          if (v === null) return;
          if (started) ctx.lineTo(xAt(i), yPrice(v));
          else {
            ctx.moveTo(xAt(i), yPrice(v));
            started = true;
          }
        });
        ctx.stroke();
      };
      ctx.strokeStyle = BOLL;
      ctx.lineWidth = 1;
      drawBand(bands.upper, []);
      drawBand(bands.lower, []);
      ctx.strokeStyle = BOLL_MID;
      drawBand(bands.middle, [4, 3]);
      ctx.setLineDash([]);
    }

    // ---- VWAP (anchored, price scale) ----
    if (vwapData) {
      ctx.strokeStyle = VWAP_COLOR;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      vwapData.forEach((v, i) => {
        if (v === null) return;
        if (started) ctx.lineTo(xAt(i), yPrice(v));
        else {
          ctx.moveTo(xAt(i), yPrice(v));
          started = true;
        }
      });
      ctx.stroke();
    }

    // ---- last-price marker: dashed line + axis pill ----
    {
      const last = candles[n - 1]!;
      const prevClose = candles[n - 2]?.c ?? last.o;
      const color = last.c >= prevClose ? UP : DOWN;
      const y = yPrice(last.c);
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(PAD_L + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = last.c.toFixed(decimals);
      ctx.fillStyle = color;
      ctx.fillRect(PAD_L + plotW + 2, y - 7, AXIS_W - 4, 14);
      ctx.fillStyle = '#18181b';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, PAD_L + plotW + 6, y);
    }

    // ---- volume pane ----
    if (hasVolume) {
      const maxVol = Math.max(...candles.map((c) => c.v ?? 0), 1);
      const barW = Math.max(1, slotW * 0.62);
      for (let i = 0; i < n; i++) {
        const c = candles[i]!;
        const v = c.v ?? 0;
        if (v <= 0) continue;
        const h = (v / maxVol) * (volH - 2);
        ctx.fillStyle = c.c >= c.o ? 'rgba(52, 211, 153, 0.45)' : 'rgba(248, 113, 113, 0.45)';
        ctx.fillRect(xAt(i) - barW / 2, volTop + volH - h, barW, h);
      }
      ctx.fillStyle = LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Vol', PAD_L + 1, volTop);
      ctx.fillText(formatNumber(maxVol, { compact: true, decimals: 1 }), PAD_L + plotW + 6, volTop);
    }

    // ---- MACD study pane ----
    if (macdData && macdTop !== undefined) {
      const vals: number[] = [];
      for (const s of [macdData.macd, macdData.signal, macdData.histogram]) {
        for (const v of s) if (v !== null) vals.push(Math.abs(v));
      }
      const bound = Math.max(1e-9, ...vals);
      const yMacd = (v: number) => macdTop + (1 - (v / bound + 1) / 2) * studyH;
      const zeroY = yMacd(0);
      // Zero baseline.
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, zeroY);
      ctx.lineTo(PAD_L + plotW, zeroY);
      ctx.stroke();
      // Histogram bars around zero.
      const hw = Math.max(1, slotW * 0.62);
      macdData.histogram.forEach((v, i) => {
        if (v === null) return;
        const y = yMacd(v);
        ctx.fillStyle = v >= 0 ? 'rgba(52, 211, 153, 0.5)' : 'rgba(248, 113, 113, 0.5)';
        ctx.fillRect(xAt(i) - hw / 2, Math.min(zeroY, y), hw, Math.max(1, Math.abs(y - zeroY)));
      });
      // MACD + signal lines.
      const drawMacdLine = (series: Array<number | null>, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        let started = false;
        series.forEach((v, i) => {
          if (v === null) return;
          if (started) ctx.lineTo(xAt(i), yMacd(v));
          else {
            ctx.moveTo(xAt(i), yMacd(v));
            started = true;
          }
        });
        ctx.stroke();
      };
      drawMacdLine(macdData.macd, MACD_LINE);
      drawMacdLine(macdData.signal, MACD_SIGNAL);
      ctx.fillStyle = LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('MACD', PAD_L + 1, macdTop);
    }

    // ---- Stochastic study pane (%K / %D, 0–100) ----
    if (stochData && stochTop !== undefined) {
      const yStoch = (v: number) => stochTop + (1 - v / 100) * studyH;
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const level of [20, 80]) {
        ctx.beginPath();
        ctx.moveTo(PAD_L, yStoch(level));
        ctx.lineTo(PAD_L + plotW, yStoch(level));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('80', PAD_L + plotW + 6, yStoch(80));
      ctx.fillText('20', PAD_L + plotW + 6, yStoch(20));
      ctx.textBaseline = 'top';
      ctx.fillText('Stoch', PAD_L + 1, stochTop);
      const drawStochLine = (series: Array<number | null>, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        let started = false;
        series.forEach((v, i) => {
          if (v === null) return;
          if (started) ctx.lineTo(xAt(i), yStoch(v));
          else {
            ctx.moveTo(xAt(i), yStoch(v));
            started = true;
          }
        });
        ctx.stroke();
      };
      drawStochLine(stochData.k, STOCH_K);
      drawStochLine(stochData.d, STOCH_D);
    }

    // ---- RSI study pane ----
    if (rsiData && rsiTop !== undefined) {
      const yRsi = (v: number) => rsiTop + (1 - v / 100) * studyH;
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const level of [30, 70]) {
        ctx.beginPath();
        ctx.moveTo(PAD_L, yRsi(level));
        ctx.lineTo(PAD_L + plotW, yRsi(level));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('70', PAD_L + plotW + 6, yRsi(70));
      ctx.fillText('30', PAD_L + plotW + 6, yRsi(30));
      ctx.textBaseline = 'top';
      ctx.fillText('RSI', PAD_L + 1, rsiTop);
      ctx.strokeStyle = RSI_COLOR;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      rsiData.forEach((v, i) => {
        if (v === null) return;
        if (started) ctx.lineTo(xAt(i), yRsi(v));
        else {
          ctx.moveTo(xAt(i), yRsi(v));
          started = true;
        }
      });
      ctx.stroke();
    }
  }, [candles, width, height, type, overlays, rsiPeriod, bollinger, macd, stochastic, vwap, showVolume, logScale]);

  // ---- crosshair overlay (imperative; never re-renders the chart) ---------
  useEffect(() => {
    const el = containerRef.current;
    const overlay = overlayRef.current;
    if (!el || !overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    overlay.width = width * dpr;
    overlay.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function clear() {
      ctx!.clearRect(0, 0, width, height);
    }

    function drawAt(i: number, y: number | null) {
      const layout = layoutRef.current;
      if (!layout) return;
      clear();
      const { plotW, priceTop, priceH, bottom, min, max, intraday } = layout;
      const c = candles[i];
      if (!c) return;
      const snapX = xForIndex(i, layout, type);

      ctx!.setLineDash([3, 3]);
      ctx!.strokeStyle = CROSSHAIR;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(snapX, priceTop);
      ctx!.lineTo(snapX, bottom);
      ctx!.stroke();

      const inPricePane = y !== null && y >= priceTop && y <= priceTop + priceH;
      if (inPricePane) {
        ctx!.beginPath();
        ctx!.moveTo(PAD_L, y!);
        ctx!.lineTo(PAD_L + plotW, y!);
        ctx!.stroke();
      }
      ctx!.setLineDash([]);
      ctx!.font = FONT;

      // Axis tags: cursor price (right) + snapped time (bottom).
      if (inPricePane) {
        const price = priceMapper(min, max, layout.log).fromFrac(1 - (y! - priceTop) / priceH);
        ctx!.fillStyle = '#3f3f46';
        ctx!.fillRect(PAD_L + plotW + 2, y! - 7, AXIS_W - 4, 14);
        ctx!.fillStyle = '#e4e4e7';
        ctx!.textAlign = 'left';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(formatNumber(price), PAD_L + plotW + 6, y!);
      }
      const tLabel = timeLabel(c.t, intraday, false);
      ctx!.fillStyle = '#3f3f46';
      const tw = ctx!.measureText(tLabel).width + 8;
      ctx!.fillRect(Math.min(Math.max(snapX - tw / 2, PAD_L), PAD_L + plotW - tw), bottom + 1, tw, 13);
      ctx!.fillStyle = '#e4e4e7';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'top';
      ctx!.fillText(tLabel, Math.min(Math.max(snapX, PAD_L + tw / 2), PAD_L + plotW - tw / 2), bottom + 3);

      // OHLCV readout, top-left of the price pane.
      const chg = c.o !== 0 ? ((c.c - c.o) / c.o) * 100 : 0;
      const lines = [
        `${timeLabel(c.t, intraday, false)}  ${intraday ? '' : new Date(c.t).getFullYear()}`.trim(),
        `O ${formatNumber(c.o)}  H ${formatNumber(c.h)}`,
        `L ${formatNumber(c.l)}  C ${formatNumber(c.c)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)`,
        ...(c.v !== undefined ? [`Vol ${formatNumber(c.v, { compact: true, decimals: 1 })}`] : []),
      ];
      const boxW = Math.max(...lines.map((l) => ctx!.measureText(l).width)) + 12;
      const boxH = lines.length * 12 + 8;
      ctx!.fillStyle = 'rgba(24, 24, 27, 0.88)';
      ctx!.fillRect(PAD_L + 4, priceTop + 2, boxW, boxH);
      ctx!.strokeStyle = GRID;
      ctx!.strokeRect(PAD_L + 4, priceTop + 2, boxW, boxH);
      ctx!.fillStyle = '#d4d4d8';
      ctx!.textAlign = 'left';
      ctx!.textBaseline = 'top';
      lines.forEach((line, li) => ctx!.fillText(line, PAD_L + 10, priceTop + 7 + li * 12));
    }

    function onMove(event: MouseEvent) {
      const layout = layoutRef.current;
      if (!layout || dragRef.current) return;
      const rect = el!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const { plotW, priceTop, bottom } = layout;
      if (x < PAD_L || x > PAD_L + plotW || y < priceTop || y > bottom) {
        clear();
        return;
      }
      kbIndexRef.current = null; // mouse takes over from keyboard stepping
      drawAt(indexForX(x, layout, type), y);
    }

    // Keyboard crosshair: ←/→ step candles (Shift = ×10), Home/End jump,
    // +/- zoom around the center, 0 resets, Esc clears. The container is
    // focusable, so this is fully keyboard-driven chart reading.
    function onKeyDown(event: KeyboardEvent) {
      const layout = layoutRef.current;
      if (!layout) return;
      const handlers = handlersRef.current;
      const stepKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (stepKeys.includes(event.key)) {
        event.preventDefault();
        const stepBy = event.shiftKey ? 10 : 1;
        const current = kbIndexRef.current ?? layout.n - 1;
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? layout.n - 1
              : Math.min(layout.n - 1, Math.max(0, current + (event.key === 'ArrowRight' ? stepBy : -stepBy)));
        kbIndexRef.current = next;
        drawAt(next, null);
        return;
      }
      if ((event.key === '+' || event.key === '=') && handlers.onZoom) {
        event.preventDefault();
        handlers.onZoom(0.5, 0.8);
      } else if (event.key === '-' && handlers.onZoom) {
        event.preventDefault();
        handlers.onZoom(0.5, 1.25);
      } else if (event.key === '0' && handlers.onResetView) {
        event.preventDefault();
        handlers.onResetView();
      } else if (event.key === 'Escape') {
        kbIndexRef.current = null;
        clear();
      }
    }

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', clear);
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', clear);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [candles, width, height, type]);

  // ---- zoom / pan interactions (listeners bound once per geometry) --------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(event: WheelEvent) {
      const layout = layoutRef.current;
      const zoom = handlersRef.current.onZoom;
      if (!layout || !zoom) return;
      event.preventDefault();
      const rect = el!.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (event.clientX - rect.left - PAD_L) / layout.plotW));
      zoom(frac, event.deltaY > 0 ? 1.25 : 0.8);
    }

    function onDown(event: MouseEvent) {
      if (!handlersRef.current.onPan || event.button !== 0) return;
      dragRef.current = { lastX: event.clientX, carry: 0 };
    }

    function onDragMove(event: MouseEvent) {
      const drag = dragRef.current;
      const layout = layoutRef.current;
      const pan = handlersRef.current.onPan;
      if (!drag || !layout || !pan) return;
      const slotW = layout.plotW / layout.n;
      drag.carry += (drag.lastX - event.clientX) / Math.max(1e-6, slotW);
      drag.lastX = event.clientX;
      const bars = Math.trunc(drag.carry);
      if (bars !== 0) {
        drag.carry -= bars;
        pan(bars);
      }
    }

    function onUp() {
      dragRef.current = null;
    }

    function onDblClick() {
      handlersRef.current.onResetView?.();
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('dblclick', onDblClick);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('dblclick', onDblClick);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Price chart. Arrow keys move the crosshair, plus and minus zoom, 0 resets."
      className="relative h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-sky-500/50"
      style={fill ? { height: '100%' } : { height }}
    >
      <canvas ref={canvasRef} style={{ width, height }} />
      <canvas ref={overlayRef} className="absolute left-0 top-0" style={{ width, height }} />
    </div>
  );
}
