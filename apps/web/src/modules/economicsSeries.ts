import type { Candle, EconomicObservation } from '@tyche/contracts';

/** Curated quick-pick series so the panel is useful without knowing FRED ids. */
export const ECON_PRESETS = [
  { id: 'GDP', label: 'GDP' },
  { id: 'CPIAUCSL', label: 'CPI' },
  { id: 'UNRATE', label: 'Unemployment' },
  { id: 'FEDFUNDS', label: 'Fed Funds' },
  { id: 'DGS10', label: '10Y Treasury' },
] as const;

export const ECON_RANGES = ['5y', '10y', 'max'] as const;
export type EconRange = (typeof ECON_RANGES)[number];

/** Lookback start (YYYY-MM-DD) for a range relative to `from`, or undefined for `max`. */
export function rangeStartIso(range: EconRange, from: Date): string | undefined {
  if (range === 'max') return undefined;
  const years = range === '5y' ? 5 : 10;
  return new Date(Date.UTC(from.getUTCFullYear() - years, from.getUTCMonth(), from.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/**
 * Map observations to flat OHLC candles for the (line-mode) AdvancedChart: each
 * non-null observation becomes a candle whose open/high/low/close are its value.
 * Null observations (source gaps) are skipped.
 */
export function observationsToCandles(observations: EconomicObservation[]): Candle[] {
  const out: Candle[] = [];
  for (const o of observations) {
    if (o.value === null) continue;
    const t = o.date.includes('T') ? o.date : `${o.date}T00:00:00.000Z`;
    out.push({ t, o: o.value, h: o.value, l: o.value, c: o.value });
  }
  return out;
}

export interface SeriesStats {
  latest: EconomicObservation | null;
  previous: EconomicObservation | null;
  change: number | null;
  changePercent: number | null;
}

/** Latest valued observation and its change vs the previous valued observation. */
export function seriesStats(observations: EconomicObservation[]): SeriesStats {
  const valued = observations.filter((o) => o.value !== null);
  const latest = valued[valued.length - 1] ?? null;
  const previous = valued[valued.length - 2] ?? null;
  let change: number | null = null;
  let changePercent: number | null = null;
  if (latest?.value != null && previous?.value != null) {
    change = latest.value - previous.value;
    changePercent = previous.value !== 0 ? (change / previous.value) * 100 : null;
  }
  return { latest, previous, change, changePercent };
}
