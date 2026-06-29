import { useEffect, useRef, useState } from 'react';

export interface ComparisonSeries {
  symbol: string;
  /** Values already rebased to the base (100). */
  values: number[];
  color: string;
}

/**
 * Dependency-free multi-series overlay canvas (original — derived from PriceChart).
 * Autoscales Y across every series, draws a dashed baseline at `base` (100), and
 * strokes each series in its assigned color. Series with < 2 points are skipped.
 */
export function ComparisonChart({ series, fill = false, base = 100 }: { series: ComparisonSeries[]; fill?: boolean; base?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [measuredHeight, setMeasuredHeight] = useState(220);
  const height = fill ? measuredHeight : 220;

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

    const drawable = series.filter((s) => s.values.length >= 2);
    const allValues = drawable.flatMap((s) => s.values);
    if (allValues.length === 0) return;

    const min = Math.min(base, ...allValues);
    const max = Math.max(base, ...allValues);
    const span = max - min || 1;
    const padX = 8;
    const padY = 12;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;
    const y = (v: number) => padY + (1 - (v - min) / span) * plotH;

    // Baseline at the rebase value.
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(padX, y(base));
    ctx.lineTo(padX + plotW, y(base));
    ctx.strokeStyle = 'rgba(113, 113, 122, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    for (const s of drawable) {
      const x = (i: number) => padX + (i / (s.values.length - 1)) * plotW;
      ctx.beginPath();
      ctx.moveTo(x(0), y(s.values[0]!));
      s.values.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [series, width, height, base]);

  return (
    <div ref={containerRef} className="w-full" style={fill ? { height: '100%' } : { height }}>
      <canvas ref={canvasRef} style={{ width, height }} />
    </div>
  );
}
