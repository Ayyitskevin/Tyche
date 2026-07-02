import { describe, it, expect } from 'vitest';
import { DexPoolSchema } from '@tyche/contracts';
import { DexscreenerProvider } from './DexscreenerProvider';
import type { FetchLike } from './stubs/FredProvider';

const SEARCH = {
  schemaVersion: '1.0.0',
  pairs: [
    {
      chainId: 'ethereum',
      dexId: 'uniswap',
      url: 'https://dexscreener.com/ethereum/0xpool1',
      pairAddress: '0xpool1',
      baseToken: { address: '0xbase', name: 'Wrapped Ether', symbol: 'WETH' },
      quoteToken: { address: '0xquote', name: 'USD Coin', symbol: 'USDC' },
      priceUsd: '3412.55',
      txns: { h24: { buys: 1200, sells: 980 } },
      volume: { h24: 250_000_000 },
      priceChange: { h24: -1.42 },
      liquidity: { usd: 120_000_000 },
      fdv: 410_000_000_000,
    },
    {
      chainId: 'base',
      dexId: 'aerodrome',
      url: 'http://insecure.example/pool', // non-https ⇒ dropped
      pairAddress: '0xpool2',
      baseToken: { address: '0xbase2', symbol: 'WETH' }, // no name
      quoteToken: { symbol: 'USDbC' },
      priceUsd: '3410.01',
      volume: {}, // no h24
      liquidity: { usd: 340_000_000 }, // deeper than pool1 ⇒ sorts first
    },
    {
      // No pairAddress ⇒ unusable, dropped entirely.
      chainId: 'solana',
      dexId: 'raydium',
      baseToken: { symbol: 'WETH' },
      quoteToken: { symbol: 'SOL' },
    },
  ],
};

function fakeFetch(payload: unknown, calls: { n: number } = { n: 0 }, ok = true, status = 200): FetchLike {
  return () => {
    calls.n += 1;
    return Promise.resolve({ ok, status, json: () => Promise.resolve(payload) });
  };
}

describe('DexscreenerProvider', () => {
  it('maps pairs to valid DexPool contracts, dropping unusable entries', async () => {
    const p = new DexscreenerProvider({ fetchImpl: fakeFetch(SEARCH), minIntervalMs: 0 });
    const { data, provenance } = await p.getDexPools('WETH');
    expect(data).toHaveLength(2);
    for (const pool of data) expect(DexPoolSchema.parse(pool)).toBeTruthy();
    const uni = data.find((pool) => pool.dex === 'uniswap')!;
    expect(uni.priceUsd).toBe(3412.55); // string → number
    expect(uni.change24hPct).toBe(-1.42);
    expect(uni.buys24h).toBe(1200);
    expect(uni.url).toBe('https://dexscreener.com/ethereum/0xpool1');
    expect(provenance.provider).toBe('dexscreener');
    expect(provenance.freshness.tier).toBe('live');
  });

  it('sorts by liquidity descending and nulls absent metrics', async () => {
    const p = new DexscreenerProvider({ fetchImpl: fakeFetch(SEARCH), minIntervalMs: 0 });
    const { data } = await p.getDexPools('WETH');
    expect(data.map((pool) => pool.dex)).toEqual(['aerodrome', 'uniswap']);
    const aero = data[0]!;
    expect(aero.volume24hUsd).toBeNull(); // volume.h24 missing
    expect(aero.change24hPct).toBeNull();
    expect(aero.baseToken.name).toBeNull();
    expect(aero.url).toBeNull(); // non-https link rejected
  });

  it('caches a query and respects the limit on the cached result', async () => {
    const calls = { n: 0 };
    const p = new DexscreenerProvider({ fetchImpl: fakeFetch(SEARCH, calls), minIntervalMs: 0 });
    const first = await p.getDexPools('WETH', 1);
    expect(first.data).toHaveLength(1);
    const second = await p.getDexPools('WETH', 2);
    expect(second.data).toHaveLength(2);
    expect(calls.n).toBe(1); // second call served from cache
  });

  it('rejects empty queries and non-OK responses with clear errors', async () => {
    const p = new DexscreenerProvider({ fetchImpl: fakeFetch(SEARCH), minIntervalMs: 0 });
    await expect(p.getDexPools('   ')).rejects.toThrow(/query is required/);
    const failing = new DexscreenerProvider({ fetchImpl: fakeFetch({}, { n: 0 }, false, 429), minIntervalMs: 0 });
    await expect(failing.getDexPools('WETH')).rejects.toThrow(/responded 429/);
  });

  it('declares only the dexPools capability so it never intercepts quote routing', () => {
    const p = new DexscreenerProvider({ fetchImpl: fakeFetch(SEARCH) });
    const caps = p.descriptor.capabilities;
    expect(caps.dexPools).toBe(true);
    expect(Object.entries(caps).filter(([, on]) => on)).toHaveLength(1);
  });
});
