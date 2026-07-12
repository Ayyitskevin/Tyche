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

/**
 * Client-side analytics transforms applied over the fetched observation window.
 * These are pure and frequency-agnostic so they work across the mixed cadences
 * FRED serves (quarterly GDP, monthly CPI/UNRATE, daily DGS10).
 *
 * - `level`     raw values (identity)
 * - `yoy`       % change vs the observation ~1 calendar year earlier
 * - `pop`       % change vs the immediately preceding valued observation
 *               (i.e. QoQ for quarterly data, MoM for monthly, DoD for daily)
 * - `index100`  rebase every value to 100 at the first valued observation
 */
export const ECON_TRANSFORMS = [
  { id: 'level', label: 'Level' },
  { id: 'yoy', label: 'YoY %' },
  { id: 'pop', label: 'Δ% prd' },
  { id: 'index100', label: 'Index=100' },
] as const;
export type EconTransform = (typeof ECON_TRANSFORMS)[number]['id'];

const DAY_MS = 86_400_000;

function toMs(date: string): number {
  return Date.parse(date.includes('T') ? date : `${date}T00:00:00.000Z`);
}

/** Same calendar day one year earlier, as epoch ms (UTC). */
function oneYearBeforeMs(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate());
}

function medianGapMs(sortedMs: number[]): number {
  if (sortedMs.length < 2) return 365 * DAY_MS;
  const gaps: number[] = [];
  for (let i = 1; i < sortedMs.length; i += 1) gaps.push(sortedMs[i]! - sortedMs[i - 1]!);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
}

function nulled(observations: EconomicObservation[]): EconomicObservation[] {
  return observations.map((o) => ({ date: o.date, value: null }));
}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/**
 * Year-over-year % change. For each valued observation, compares against the
 * valued observation nearest to exactly one year prior. The match tolerance is
 * scaled to the series' own cadence (with a small floor for daily data that
 * skips weekends/holidays), so early points with no year-ago counterpart — and
 * off-grid gaps — are left null rather than compared to the wrong period.
 */
function yearOverYearPercent(observations: EconomicObservation[]): EconomicObservation[] {
  const out = nulled(observations);
  const valued = observations
    .map((o, i) => ({ i, ms: toMs(o.date), v: o.value }))
    .filter((x): x is { i: number; ms: number; v: number } => x.v !== null);
  if (valued.length < 2) return out;
  const tol = Math.max(4 * DAY_MS, 0.6 * medianGapMs(valued.map((x) => x.ms)));
  let j = 0; // last valued index with ms <= target; monotonic since targets ascend
  for (const cur of valued) {
    const target = oneYearBeforeMs(cur.ms);
    while (j + 1 < valued.length && valued[j + 1]!.ms <= target) j += 1;
    let best = valued[j]!;
    const next = valued[j + 1];
    if (next && Math.abs(next.ms - target) < Math.abs(best.ms - target)) best = next;
    if (best.i !== cur.i && best.v !== 0 && Math.abs(best.ms - target) <= tol) {
      out[cur.i] = { date: observations[cur.i]!.date, value: finiteOrNull(((cur.v - best.v) / best.v) * 100) };
    }
  }
  return out;
}

/** Period-over-period % change vs the previous valued observation. */
function periodOverPercent(observations: EconomicObservation[]): EconomicObservation[] {
  const out = nulled(observations);
  let prev: number | null = null;
  for (let i = 0; i < observations.length; i += 1) {
    const v = observations[i]!.value;
    if (v === null) continue;
    if (prev !== null && prev !== 0) {
      out[i] = { date: observations[i]!.date, value: finiteOrNull(((v - prev) / prev) * 100) };
    }
    prev = v;
  }
  return out;
}

/** Rebase to 100 at the first valued observation in the window. */
function indexToHundred(observations: EconomicObservation[]): EconomicObservation[] {
  const base = observations.find((o) => o.value !== null)?.value ?? null;
  if (base === null || base === 0) return nulled(observations);
  return observations.map((o) =>
    o.value === null ? { date: o.date, value: null } : { date: o.date, value: finiteOrNull((o.value / base) * 100) },
  );
}

/** Apply a transform kind, returning a same-length, same-dated observation list. */
export function applyTransform(
  observations: EconomicObservation[],
  kind: EconTransform,
): EconomicObservation[] {
  switch (kind) {
    case 'yoy':
      return yearOverYearPercent(observations);
    case 'pop':
      return periodOverPercent(observations);
    case 'index100':
      return indexToHundred(observations);
    case 'level':
    default:
      return observations;
  }
}

/** Human-readable units for the active transform (falls back to the series units). */
export function transformUnitsLabel(kind: EconTransform, baseUnits?: string | null): string {
  switch (kind) {
    case 'yoy':
      return '% change, year ago';
    case 'pop':
      return '% change, period';
    case 'index100':
      return 'Index (start = 100)';
    case 'level':
    default:
      return baseUnits ?? '';
  }
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
