import type { DexPool } from '@tyche/contracts';

export interface DexAnalyticsRow {
  dex: string;
  chain: string;
  pair: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  /** 24h volume ÷ liquidity — how hard the pool turns over its depth; null when either is absent. */
  turnover: number | null;
  /** This pool's share of total measured liquidity, 0–1; null when total liquidity is 0/absent. */
  liquidityShare: number | null;
  /** (price − LWAP) / LWAP in basis points; null when the pool or book lacks a price. */
  priceDevBps: number | null;
}

export interface DexAnalytics {
  poolCount: number;
  chains: number;
  venues: number;
  totalLiquidityUsd: number | null;
  totalVolume24hUsd: number | null;
  /** Aggregate 24h volume ÷ aggregate liquidity. */
  turnover: number | null;
  /** Liquidity-weighted average USD price — the depth-weighted fair price across pools. */
  lwapUsd: number | null;
  medianPriceUsd: number | null;
  /** (max − min) price ÷ LWAP in basis points, across priced pools; null when < 2 priced pools. */
  priceDispersionBps: number | null;
  /** Deepest-liquidity venue. */
  topVenue: string | null;
  /** Deepest pool's share of total liquidity, 0–1. */
  topVenueShare: number | null;
  /** Herfindahl–Hirschman index of liquidity shares, 0–1 (1 = one pool holds all depth). */
  hhi: number | null;
  /** Aggregate 24h buys ÷ (buys + sells), 0–1; null when no pool reports transaction counts. */
  buyShare: number | null;
  /** Per-pool rows sorted by liquidity descending (pools without liquidity last). */
  rows: DexAnalyticsRow[];
}

function sum(values: number[]): number {
  return values.reduce((s, x) => s + x, 0);
}
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Cross-venue analytics over a set of on-chain DEX pool snapshots for one token:
 * the depth-weighted fair price (LWAP), how far venues disagree on price, where
 * the liquidity is concentrated, how hard each pool turns over, and net buy
 * pressure. Every statistic is computed only over the pools that actually report
 * the field it needs — a missing price/liquidity/volume is skipped, never treated
 * as zero. Descriptive on-chain market-structure analytics, not advice.
 */
export function dexAnalytics(pools: DexPool[]): DexAnalytics {
  const poolCount = pools.length;
  const chains = new Set(pools.map((p) => p.chain)).size;
  const venues = new Set(pools.map((p) => p.dex)).size;

  const withLiq = pools.filter((p) => p.liquidityUsd !== null && p.liquidityUsd > 0);
  const totalLiquidityUsd = withLiq.length > 0 ? sum(withLiq.map((p) => p.liquidityUsd!)) : null;

  const withVol = pools.filter((p) => p.volume24hUsd !== null);
  const totalVolume24hUsd = withVol.length > 0 ? sum(withVol.map((p) => p.volume24hUsd!)) : null;

  const turnover =
    totalVolume24hUsd !== null && totalLiquidityUsd !== null && totalLiquidityUsd > 0
      ? totalVolume24hUsd / totalLiquidityUsd
      : null;

  // LWAP over pools that report BOTH a price and positive liquidity.
  const priced = withLiq.filter((p) => p.priceUsd !== null);
  const lwapDenom = priced.length > 0 ? sum(priced.map((p) => p.liquidityUsd!)) : 0;
  const lwapUsd = lwapDenom > 0 ? sum(priced.map((p) => p.priceUsd! * p.liquidityUsd!)) / lwapDenom : null;

  const allPrices = pools.filter((p) => p.priceUsd !== null).map((p) => p.priceUsd!);
  const medianPriceUsd = median(allPrices);
  const priceDispersionBps =
    allPrices.length >= 2 && lwapUsd !== null && lwapUsd > 0
      ? ((Math.max(...allPrices) - Math.min(...allPrices)) / lwapUsd) * 10000
      : null;

  // Concentration: top pool share + HHI over liquidity shares.
  let topVenue: string | null = null;
  let topVenueShare: number | null = null;
  let hhi: number | null = null;
  if (totalLiquidityUsd !== null && totalLiquidityUsd > 0) {
    const deepest = withLiq.reduce((best, p) => (p.liquidityUsd! > best.liquidityUsd! ? p : best));
    topVenue = deepest.dex;
    topVenueShare = deepest.liquidityUsd! / totalLiquidityUsd;
    hhi = sum(withLiq.map((p) => (p.liquidityUsd! / totalLiquidityUsd) ** 2));
  }

  const withTx = pools.filter((p) => p.buys24h !== null && p.sells24h !== null);
  const buys = sum(withTx.map((p) => p.buys24h!));
  const sells = sum(withTx.map((p) => p.sells24h!));
  const buyShare = withTx.length > 0 && buys + sells > 0 ? buys / (buys + sells) : null;

  const rows: DexAnalyticsRow[] = pools
    .map((p) => ({
      dex: p.dex,
      chain: p.chain,
      pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`,
      priceUsd: p.priceUsd,
      liquidityUsd: p.liquidityUsd,
      volume24hUsd: p.volume24hUsd,
      turnover:
        p.volume24hUsd !== null && p.liquidityUsd !== null && p.liquidityUsd > 0
          ? p.volume24hUsd / p.liquidityUsd
          : null,
      liquidityShare:
        p.liquidityUsd !== null && totalLiquidityUsd !== null && totalLiquidityUsd > 0
          ? p.liquidityUsd / totalLiquidityUsd
          : null,
      priceDevBps:
        p.priceUsd !== null && lwapUsd !== null && lwapUsd > 0
          ? ((p.priceUsd - lwapUsd) / lwapUsd) * 10000
          : null,
    }))
    .sort((a, b) => (b.liquidityUsd ?? -Infinity) - (a.liquidityUsd ?? -Infinity));

  return {
    poolCount,
    chains,
    venues,
    totalLiquidityUsd,
    totalVolume24hUsd,
    turnover,
    lwapUsd,
    medianPriceUsd,
    priceDispersionBps,
    topVenue,
    topVenueShare,
    hhi,
    buyShare,
    rows,
  };
}
