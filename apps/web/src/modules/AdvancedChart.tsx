import { useEffect, useRef, useState } from 'react';
import type { Candle } from '@tyche/contracts';
import { rsi } from '@tyche/analytics';
import { OVERLAY_COLORS, overlaySeries, priceRange, type ChartOverlay } from './chartScale';

export interface AdvancedChartProps {
  candles: Candle[];
  type: 'line' | 'candles';
  overlays: ChartOverlay[];
  /** RSI period for the lower study pane, or null to hide it. */
  rsiPeriod: number | null;
  /** When true, the chart fills its parent's height; otherwise uses `height`. */
  fill?: boolean;
  height?: number;
}

const UP = '#34d399';
const DOWN = '#f87171';
const RSI_COLOR = '#60a5fa';
const GRID = 'rgba(113, 113, 122, 0.30)';
const LABEL = '#71717a';

/**
 * Dependency-free canvas chart. Original implementation — renders a close line
 * (area fill) or OHLC candlesticks with auto-scaled price axis, optional
 * moving-average overlays on the price scale, and an optional lower RSI study
 * pane with 30/70 guide bands. Nothing here is derived from any third-party
 * charting product.
 */
export function AdvancedChart({
  candles,
  type,
  overlays,
  rsiPeriod,
  fill = false,
  height: heightProp = 260,
}: AdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (candles.length < 2) return;

    const closes = candles.map((c) => c.c);
    const overlayData = overlays.map((o) => overlaySeries(closes, o));
    const rsiData = rsiPeriod ? rsi(closes, rsiPeriod) : null;

    const padX = 10;
    const padY = 10;
    const gap = 10;
    const innerH = height - padY * 2;
    const rsiH = rsiData ? Math.min(120, Math.max(44, Math.round(innerH * 0.28))) : 0;
    const priceH = rsiData ? innerH - rsiH - gap : innerH;
    const priceTop = padY;
    const rsiTop = padY + priceH + gap;
    const plotW = width - padX * 2;

    const { min, max } = priceRange(candles, type, overlayData);
    const span = max - min || 1;
    const n = closes.length;
    const slotW = plotW / n;
    const xAt = (i: number) =>
      type === 'candles' ? padX + (i + 0.5) * slotW : padX + (i / (n - 1)) * plotW;
    const yPrice = (v: number) => priceTop + (1 - (v - min) / span) * priceH;

    // ---- price pane ----
    if (type === 'candles') {
      const bodyW = Math.max(1, slotW * 0.62);
      for (let i = 0; i < n; i++) {
        const c = candles[i]!;
        const cx = xAt(i);
        const up = c.c >= c.o;
        ctx.strokeStyle = up ? UP : DOWN;
        ctx.fillStyle = up ? UP : DOWN;
        // wick
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, yPrice(c.h));
        ctx.lineTo(cx, yPrice(c.l));
        ctx.stroke();
        // body
        const yo = yPrice(c.o);
        const yc = yPrice(c.c);
        const top = Math.min(yo, yc);
        const bodyH = Math.max(1, Math.abs(yc - yo));
        ctx.fillRect(cx - bodyW / 2, top, bodyW, bodyH);
      }
    } else {
      const up = (closes[n - 1] ?? 0) >= (closes[0] ?? 0);
      const stroke = up ? UP : DOWN;
      const areaFill = up ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)';
      ctx.beginPath();
      ctx.moveTo(xAt(0), yPrice(closes[0]!));
      closes.forEach((v, i) => ctx.lineTo(xAt(i), yPrice(v)));
      ctx.lineTo(xAt(n - 1), priceTop + priceH);
      ctx.lineTo(xAt(0), priceTop + priceH);
      ctx.closePath();
      ctx.fillStyle = areaFill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xAt(0), yPrice(closes[0]!));
      closes.forEach((v, i) => ctx.lineTo(xAt(i), yPrice(v)));
      ctx.strokeStyle = stroke;
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
        const px = xAt(i);
        const py = yPrice(v);
        if (started) ctx.lineTo(px, py);
        else {
          ctx.moveTo(px, py);
          started = true;
        }
      });
      ctx.stroke();
    });

    // ---- RSI study pane ----
    if (rsiData) {
      const yRsi = (v: number) => rsiTop + (1 - v / 100) * rsiH;
      // frame + 30/70 guide bands
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const level of [30, 70]) {
        ctx.beginPath();
        ctx.moveTo(padX, yRsi(level));
        ctx.lineTo(padX + plotW, yRsi(level));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = LABEL;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('70', padX + 1, yRsi(70));
      ctx.fillText('30', padX + 1, yRsi(30));
      ctx.fillText('RSI', padX + plotW - 20, rsiTop + 6);
      // rsi line
      ctx.strokeStyle = RSI_COLOR;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      rsiData.forEach((v, i) => {
        if (v === null) return;
        const px = xAt(i);
        const py = yRsi(v);
        if (started) ctx.lineTo(px, py);
        else {
          ctx.moveTo(px, py);
          started = true;
        }
      });
      ctx.stroke();
    }
  }, [candles, width, height, type, overlays, rsiPeriod]);

  return (
    <div ref={containerRef} className="h-full w-full" style={fill ? { height: '100%' } : { height }}>
      <canvas ref={canvasRef} style={{ width, height }} />
    </div>
  );
}
