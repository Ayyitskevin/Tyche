import type { Candle } from '@tyche/contracts';
import { ema, sma } from '@tyche/analytics';

/** A moving-average overlay drawn on the price scale. */
export interface ChartOverlay {
  kind: 'sma' | 'ema';
  period: number;
}

/** Stable colors shared by the chart lines and their toggle chips. */
export const OVERLAY_COLORS: Record<ChartOverlay['kind'], string> = {
  sma: '#fbbf24',
  ema: '#a78bfa',
};

/** Compute the indicator series for an overlay over a close series. */
export function overlaySeries(closes: number[], overlay: ChartOverlay): Array<number | null> {
  return overlay.kind === 'sma' ? sma(closes, overlay.period) : ema(closes, overlay.period);
}

/**
 * "Nice numbers" axis ticks: rounded values at a 1/2/2.5/5/10 step, strictly
 * inside [min, max], targeting roughly `target` ticks. Degenerate ranges yield
 * an empty array (the axis simply renders no labels).
 */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || target < 2) return [];
  const rawStep = (max - min) / (target - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm > 5 ? 10 : norm > 2.5 ? 5 : norm > 2 ? 2.5 : norm > 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  // Bound iterations to protect against float-step pathologies.
  for (let v = first, i = 0; v <= max + step * 1e-9 && i < 50; v += step, i++) {
    // Snap accumulated float drift back onto the step grid.
    ticks.push(Math.round(v / step) * step);
  }
  return ticks.filter((t) => t >= min - step * 1e-9 && t <= max + step * 1e-9);
}

/** Decimal places that render a tick step without losing precision (capped at 4). */
export function tickDecimals(ticks: number[]): number {
  if (ticks.length < 2) return 2;
  const step = Math.abs((ticks[1] ?? 0) - (ticks[0] ?? 0));
  if (step >= 1 || step === 0) return step >= 10 ? 0 : step >= 1 ? 1 : 2;
  return Math.min(4, Math.max(2, Math.ceil(-Math.log10(step))));
}

/**
 * Inclusive numeric range for the price plot. Uses candle highs/lows in candle
 * mode (closes in line mode) and extends to cover any finite overlay value so
 * moving-average lines never clip. Degenerate inputs fall back to a unit band.
 */
export function priceRange(
  candles: Candle[],
  type: 'line' | 'candles',
  overlays: Array<Array<number | null>>,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    const lo = type === 'candles' ? c.l : c.c;
    const hi = type === 'candles' ? c.h : c.c;
    if (lo < min) min = lo;
    if (hi > max) max = hi;
  }
  for (const series of overlays) {
    for (const v of series) {
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}
