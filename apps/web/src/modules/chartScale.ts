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
