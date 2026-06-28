import { useEffect, useRef, useState } from 'react';
import type { Candle } from '@tyche/contracts';

export interface PriceChartProps {
  candles: Candle[];
  /** When true, the chart fills its parent's height; otherwise uses `height`. */
  fill?: boolean;
  height?: number;
}

/**
 * Dependency-free canvas line/area chart. Original implementation — draws the
 * close series with min/max autoscaling, a soft area fill, and a baseline.
 */
export function PriceChart({ candles, fill = false, height: heightProp = 220 }: PriceChartProps) {
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
      if (fill && rect?.height) setMeasuredHeight(Math.max(120, Math.floor(rect.height)));
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
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    const padX = 8;
    const padY = 12;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    const x = (i: number) => padX + (i / (closes.length - 1)) * plotW;
    const y = (v: number) => padY + (1 - (v - min) / span) * plotH;

    const up = (closes[closes.length - 1] ?? 0) >= (closes[0] ?? 0);
    const stroke = up ? '#34d399' : '#f87171';
    const fill = up ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)';

    // area
    ctx.beginPath();
    ctx.moveTo(x(0), y(closes[0]!));
    closes.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(closes.length - 1), padY + plotH);
    ctx.lineTo(x(0), padY + plotH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(x(0), y(closes[0]!));
    closes.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [candles, width, height]);

  return (
    <div ref={containerRef} className="w-full" style={fill ? { height: '100%' } : { height }}>
      <canvas ref={canvasRef} style={{ width, height }} />
    </div>
  );
}
