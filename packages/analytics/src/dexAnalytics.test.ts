import { describe, expect, it } from 'vitest';
import type { DexPool } from '@tyche/contracts';
import { dexAnalytics } from './dexAnalytics';

function pool(p: Partial<DexPool> & Pick<DexPool, 'dex' | 'chain'>): DexPool {
  return {
    pairAddress: `0x${p.dex}`,
    baseToken: { symbol: 'WETH', name: null, address: null },
    quoteToken: { symbol: 'USDC', name: null, address: null },
    priceUsd: null,
    change24hPct: null,
    volume24hUsd: null,
    liquidityUsd: null,
    fdvUsd: null,
    buys24h: null,
    sells24h: null,
    url: null,
    asOf: '2026-07-19T00:00:00.000Z',
    ...p,
  };
}

const pools: DexPool[] = [
  pool({ dex: 'uniswap', chain: 'ethereum', priceUsd: 3000, liquidityUsd: 1_000_000, volume24hUsd: 500_000, buys24h: 100, sells24h: 60 }),
  pool({ dex: 'sushiswap', chain: 'ethereum', priceUsd: 3010, liquidityUsd: 500_000, volume24hUsd: 100_000, buys24h: 20, sells24h: 30 }),
  pool({ dex: 'raydium', chain: 'solana', volume24hUsd: 50_000 }), // price/liquidity/tx unknown
];

describe('dexAnalytics', () => {
  it('counts pools, chains and venues', () => {
    const a = dexAnalytics(pools);
    expect(a.poolCount).toBe(3);
    expect(a.chains).toBe(2);
    expect(a.venues).toBe(3);
  });

  it('computes depth-weighted price, dispersion and turnover', () => {
    const a = dexAnalytics(pools);
    expect(a.totalLiquidityUsd).toBe(1_500_000);
    expect(a.totalVolume24hUsd).toBe(650_000);
    expect(a.turnover).toBeCloseTo(650_000 / 1_500_000, 6);
    // LWAP = (3000×1M + 3010×0.5M) / 1.5M
    expect(a.lwapUsd).toBeCloseTo(3003.3333, 3);
    expect(a.medianPriceUsd).toBe(3005);
    // (3010 − 3000) / LWAP × 1e4
    expect(a.priceDispersionBps).toBeCloseTo(33.2963, 3);
  });

  it('measures liquidity concentration and buy pressure', () => {
    const a = dexAnalytics(pools);
    expect(a.topVenue).toBe('uniswap');
    expect(a.topVenueShare).toBeCloseTo(2 / 3, 6);
    expect(a.hhi).toBeCloseTo((2 / 3) ** 2 + (1 / 3) ** 2, 6); // 0.5556
    expect(a.buyShare).toBeCloseTo(120 / 210, 6);
  });

  it('emits per-pool rows sorted by liquidity, nulling absent fields', () => {
    const a = dexAnalytics(pools);
    expect(a.rows.map((r) => r.dex)).toEqual(['uniswap', 'sushiswap', 'raydium']);
    const uni = a.rows[0]!;
    expect(uni.turnover).toBeCloseTo(0.5, 6);
    expect(uni.liquidityShare).toBeCloseTo(2 / 3, 6);
    expect(uni.priceDevBps).toBeCloseTo(((3000 - 3003.3333) / 3003.3333) * 10000, 2);
    const ray = a.rows[2]!;
    expect(ray.turnover).toBeNull(); // no liquidity → no turnover, not 0
    expect(ray.liquidityShare).toBeNull();
    expect(ray.priceDevBps).toBeNull();
  });

  it('returns nulls (never fabricated zeros) when no pool reports the field', () => {
    const a = dexAnalytics([pool({ dex: 'uniswap', chain: 'ethereum' })]);
    expect(a.poolCount).toBe(1);
    expect(a.totalLiquidityUsd).toBeNull();
    expect(a.lwapUsd).toBeNull();
    expect(a.priceDispersionBps).toBeNull();
    expect(a.topVenue).toBeNull();
    expect(a.hhi).toBeNull();
    expect(a.buyShare).toBeNull();
  });

  it('handles an empty pool set', () => {
    const a = dexAnalytics([]);
    expect(a).toMatchObject({ poolCount: 0, chains: 0, venues: 0, totalLiquidityUsd: null, lwapUsd: null, rows: [] });
  });
});
