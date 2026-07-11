import type { Candle } from '@tyche/contracts';
import { simpleReturns } from './returns';
import { beta, portfolioReturns, portfolioRiskStats, type PortfolioRiskStats } from './portfolioRisk';

/**
 * Aggregation layer that turns raw per-holding candles + a benchmark into a
 * portfolio risk bundle. Pure and dependency-free: the caller fetches the
 * candles (respecting provenance) and this aligns them by date, derives
 * market-value weights, and computes the stats. Educational analytics only.
 */

export interface HoldingCandles {
  symbol: string;
  quantity: number;
  candles: Candle[];
}

export interface HoldingRisk {
  symbol: string;
  /** Gross-normalized signed value weight (Σ|weight| = 1), matching the marks table. */
  weight: number;
  /** Beta vs the benchmark; null when no benchmark history was available. */
  beta: number | null;
}

export interface PortfolioRiskResult {
  stats: PortfolioRiskStats;
  holdings: HoldingRisk[];
  /** Number of aligned return periods the stats were computed over. */
  observations: number;
  /** How many holdings had usable (≥2-point) history, of the total requested. */
  coverage: { priced: number; total: number };
}

function closesByDate(candles: Candle[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of candles) m.set(c.t, c.c);
  return m;
}

export function computePortfolioRisk(
  holdings: HoldingCandles[],
  benchmark: Candle[] | null,
  opts: { riskFreeRate?: number; periodsPerYear?: number; confidence?: number } = {},
): PortfolioRiskResult {
  const priced = holdings.filter((h) => h.candles.length >= 2);
  const coverage = { priced: priced.length, total: holdings.length };
  const benchMap = benchmark && benchmark.length >= 2 ? closesByDate(benchmark) : null;

  const maps = priced.map((h) => ({ h, map: closesByDate(h.candles) }));

  // Dates present in EVERY priced holding (and the benchmark, if any), ascending.
  let common: string[] = [];
  if (maps.length > 0) {
    common = [...maps[0]!.map.keys()]
      .filter((d) => maps.every((m) => m.map.has(d)) && (!benchMap || benchMap.has(d)))
      .sort();
  }
  const observations = Math.max(0, common.length - 1);

  if (observations < 1) {
    return {
      stats: portfolioRiskStats([], null, opts),
      holdings: priced.map((h) => ({ symbol: h.symbol, weight: 0, beta: null })),
      observations: 0,
      coverage,
    };
  }

  // Weights from the latest common-date market value (quantity × close), gross-
  // normalized and signed so a short contributes negatively — same convention as
  // the marks table's Wt%.
  const latest = common[common.length - 1]!;
  const values = maps.map(({ h, map }) => h.quantity * (map.get(latest) ?? 0));
  const gross = values.reduce((s, v) => s + Math.abs(v), 0);
  const weights = values.map((v) => (gross === 0 ? 0 : v / gross));

  const returnsByAsset = maps.map(({ map }) => simpleReturns(common.map((d) => map.get(d)!)));
  const benchReturns = benchMap ? simpleReturns(common.map((d) => benchMap.get(d)!)) : null;

  const stats = portfolioRiskStats(portfolioReturns(weights, returnsByAsset), benchReturns, opts);

  const holdingsRisk: HoldingRisk[] = maps.map(({ h }, i) => ({
    symbol: h.symbol,
    weight: weights[i]!,
    beta: benchReturns ? beta(returnsByAsset[i]!, benchReturns) : null,
  }));

  return { stats, holdings: holdingsRisk, observations, coverage };
}
