import type { Candle } from '@tyche/contracts';

/**
 * Return seasonality: how an instrument has historically performed in each calendar
 * month, from month-end close-to-close returns over its price history. Purely a
 * descriptive tally of PAST months — with a small sample per month (roughly one
 * observation per year), it is not predictive and not investment advice. Pure and
 * deterministic (anchored to the data, no wall clock).
 */

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthSeasonality {
  /** 1–12. */
  month: number;
  label: string;
  /** Mean month-end return for this calendar month; null when never observed. */
  avgReturn: number | null;
  medianReturn: number | null;
  /** Fraction of observations that were positive; null when never observed. */
  positiveRate: number | null;
  /** Number of years this month was observed. */
  count: number;
  best: number | null;
  worst: number | null;
}

export interface Seasonality {
  symbol: string;
  /** Twelve entries, Jan→Dec. */
  months: MonthSeasonality[];
  firstDate: string | null;
  lastDate: string | null;
  /** Total number of monthly-return observations. */
  observations: number;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

const emptyMonths = (): MonthSeasonality[] =>
  MONTH_LABELS.map((label, i) => ({
    month: i + 1,
    label,
    avgReturn: null,
    medianReturn: null,
    positiveRate: null,
    count: 0,
    best: null,
    worst: null,
  }));

/**
 * Compute per-calendar-month return statistics from a candle series. Month-end
 * closes are the last close of each calendar month; the return attributed to a month
 * is that month's close over the prior month's close. Empty-safe. Descriptive
 * analytics over past prices; not predictive and not investment advice.
 */
export function seasonality(candles: Candle[], symbol: string): Seasonality {
  const sorted = [...candles].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (sorted.length === 0) {
    return { symbol, months: emptyMonths(), firstDate: null, lastDate: null, observations: 0 };
  }

  // Last close of each calendar month, in chronological order.
  const monthEnds: Array<{ month: number; close: number }> = [];
  let curKey = '';
  for (const c of sorted) {
    const key = c.t.slice(0, 7); // YYYY-MM
    if (key !== curKey) {
      monthEnds.push({ month: Number(c.t.slice(5, 7)), close: c.c });
      curKey = key;
    } else {
      monthEnds[monthEnds.length - 1]!.close = c.c;
    }
  }

  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < monthEnds.length; i++) {
    const prev = monthEnds[i - 1]!.close;
    const cur = monthEnds[i]!;
    if (prev !== 0) byMonth[cur.month - 1]!.push(cur.close / prev - 1);
  }

  const months: MonthSeasonality[] = MONTH_LABELS.map((label, i) => {
    const rs = byMonth[i]!;
    if (rs.length === 0) {
      return { month: i + 1, label, avgReturn: null, medianReturn: null, positiveRate: null, count: 0, best: null, worst: null };
    }
    const sortedRs = [...rs].sort((a, b) => a - b);
    const sum = rs.reduce((s, r) => s + r, 0);
    const positives = rs.filter((r) => r > 0).length;
    return {
      month: i + 1,
      label,
      avgReturn: sum / rs.length,
      medianReturn: median(sortedRs),
      positiveRate: positives / rs.length,
      count: rs.length,
      best: sortedRs[sortedRs.length - 1]!,
      worst: sortedRs[0]!,
    };
  });

  return {
    symbol,
    months,
    firstDate: sorted[0]!.t.slice(0, 10),
    lastDate: sorted[sorted.length - 1]!.t.slice(0, 10),
    observations: Math.max(0, monthEnds.length - 1),
  };
}
