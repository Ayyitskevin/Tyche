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

// --- Study-pane layout (pure; keeps the price pane usable at any height) ---

/** Smallest usable price pane, and smallest legible study pane (px). */
const MIN_PRICE_H = 60;
const MIN_STUDY_H = 28;

export interface StudyFit {
  /** How many lower study panes actually fit (≤ requested). */
  panes: number;
  /** Height of each study pane. */
  studyH: number;
  /** Height of the volume pane (0 when dropped/absent). */
  volH: number;
  /** Whether the volume pane survived the fit. */
  hasVolume: boolean;
  /** Remaining height for the price pane (never negative). */
  priceH: number;
}

/**
 * Allocate the inner chart height across the price pane, an optional volume pane,
 * and up to `requestedPanes` lower study panes. Panes that can't fit even at their
 * minimum height are dropped, and the volume pane is sacrificed before the study
 * panes, so the price pane always keeps at least `MIN_PRICE_H` (and `priceH` is
 * never negative) regardless of how many studies are toggled on at a small height.
 */
export function fitStudyPanes(
  innerH: number,
  gap: number,
  requestedPanes: number,
  wantVolume: boolean,
): StudyFit {
  const maxPanes = Math.max(0, Math.floor((innerH - MIN_PRICE_H) / (MIN_STUDY_H + gap)));
  const panes = Math.max(0, Math.min(requestedPanes, maxPanes));
  const studyFrac = panes >= 3 ? 0.16 : panes === 2 ? 0.18 : 0.24;
  let studyH = panes > 0 ? Math.min(120, Math.max(MIN_STUDY_H, Math.round(innerH * studyFrac))) : 0;
  let hasVolume = wantVolume;
  let volH = hasVolume ? Math.min(90, Math.max(28, Math.round(innerH * 0.16))) : 0;
  let priceH = innerH - panes * (studyH + gap) - (hasVolume ? volH + gap : 0);
  if (hasVolume && priceH < MIN_PRICE_H) {
    // Too short with a volume pane — give that space back to price first.
    hasVolume = false;
    volH = 0;
    priceH = innerH - panes * (studyH + gap);
  }
  if (priceH < MIN_PRICE_H && panes > 0) {
    // Still short — shrink the study panes; the pane-count cap keeps this ≥ MIN_PRICE_H.
    studyH = Math.max(MIN_STUDY_H, Math.floor((innerH - MIN_PRICE_H - panes * gap) / panes));
    priceH = innerH - panes * (studyH + gap);
  }
  return { panes, studyH, volH, hasVolume, priceH: Math.max(0, priceH) };
}

// --- Zoom / pan / log-scale helpers (pure; the chart component only wires events) ---

/** Inclusive candle-index window; `null` means "show everything". */
export interface ViewWindow {
  start: number;
  end: number;
}

const MIN_BARS = 10;

/**
 * Zoom the window by `factor` (>1 = zoom out, <1 = zoom in), keeping the candle
 * under `anchorFrac` (0..1 across the plot) stationary. Returns null when the
 * window grows back to the full series.
 */
export function zoomWindow(
  win: ViewWindow | null,
  total: number,
  anchorFrac: number,
  factor: number,
): ViewWindow | null {
  if (total <= MIN_BARS) return null;
  const start = win?.start ?? 0;
  const end = win?.end ?? total - 1;
  const span = end - start + 1;
  const newSpan = Math.min(total, Math.max(MIN_BARS, Math.round(span * factor)));
  if (newSpan >= total) return null;
  const anchor = start + anchorFrac * (span - 1);
  let newStart = Math.round(anchor - anchorFrac * (newSpan - 1));
  newStart = Math.min(total - newSpan, Math.max(0, newStart));
  return { start: newStart, end: newStart + newSpan - 1 };
}

/** Shift the window by `deltaBars` (positive = towards newer candles). */
export function panWindow(win: ViewWindow | null, total: number, deltaBars: number): ViewWindow | null {
  if (!win || deltaBars === 0) return win;
  const span = win.end - win.start + 1;
  const start = Math.min(total - span, Math.max(0, win.start + deltaBars));
  return { start, end: start + span - 1 };
}

/**
 * Price↔fraction mapping for the price pane. Linear by default; `log` maps in
 * log-space (correct non-uniform spacing for round-number ticks). Falls back to
 * linear when the range can't support a log scale (min <= 0).
 */
export function priceMapper(min: number, max: number, log: boolean): {
  toFrac: (v: number) => number;
  fromFrac: (f: number) => number;
} {
  const useLog = log && min > 0 && max > min;
  if (useLog) {
    const lmin = Math.log(min);
    const lspan = Math.log(max) - lmin;
    return {
      toFrac: (v) => (v > 0 ? (Math.log(v) - lmin) / lspan : 0),
      fromFrac: (f) => Math.exp(lmin + f * lspan),
    };
  }
  const span = max - min || 1;
  return {
    toFrac: (v) => (v - min) / span,
    fromFrac: (f) => min + f * span,
  };
}
