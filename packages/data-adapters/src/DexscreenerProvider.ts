import {
  NO_CAPABILITIES,
  type DataProvenance,
  type DexPool,
  type Envelope,
  type ProviderDescriptor,
} from '@tyche/contracts';
import { StubProvider } from './Provider';
import { ProviderError } from './errors';
import { MemoryCache, type CacheStore } from './cache';
import { makeProvenance, withProvenance } from './provenance';
import type { FetchLike } from './stubs/FredProvider';

const BASE_URL = 'https://api.dexscreener.com';

const SEARCH_TTL = 60 * 1000; // pools reprice constantly; cache only briefly
const MAX_LIMIT = 50;

/** The subset of Dexscreener's pair payload the adapter reads. */
interface DexscreenerPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  txns?: { h24?: { buys?: number; sells?: number } };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
}

interface SearchResponse {
  pairs?: DexscreenerPair[] | null;
}

export interface DexscreenerProviderOptions {
  cache?: CacheStore;
  fetchImpl?: FetchLike;
  minIntervalMs?: number;
}

/**
 * Dexscreener adapter — real, keyless on-chain DEX pool data: where a token
 * trades across decentralized venues (chain, DEX, price, 24h volume, liquidity
 * depth, FDV, buy/sell counts). Serves only the `dexPools` capability — pool
 * snapshots are a market-structure view, not a quote feed — so it never
 * intercepts symbol-routed capabilities. Enabled via
 * `TYCHE_PROVIDERS=dexscreener` (alias `dex`).
 */
export class DexscreenerProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'dexscreener',
    mode: 'public',
    capabilities: {
      ...NO_CAPABILITIES,
      dexPools: true,
    },
    freshness: [{ capability: 'dexPools', tier: 'live', delaySeconds: 0 }],
    attribution: 'On-chain DEX pool data via Dexscreener',
    attributionRequired: true,
    rateLimit: { requestsPerMinute: 300, notes: 'Public search endpoint limit published by Dexscreener.' },
    homepage: 'https://dexscreener.com',
    description:
      'Keyless on-chain DEX pool search: price, 24h volume, liquidity, FDV and transaction counts across chains and venues.',
    requiresConfiguration: false,
  };

  private readonly cache: CacheStore;
  private readonly fetchImpl: FetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: DexscreenerProviderOptions = {}) {
    super();
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 250;
  }

  override async getDexPools(query: string, limit = 12): Promise<Envelope<DexPool[]>> {
    const q = query.trim();
    if (!q) throw new ProviderError('dexscreener', 'A token or pair query is required (e.g. DEX ETH).');
    const capped = Math.max(1, Math.min(limit, MAX_LIMIT));

    const key = `dexscreener:search:${q.toLowerCase()}`;
    let pools = await this.cache.get<DexPool[]>(key);
    if (!pools) {
      const res = await this.getJson<SearchResponse>(
        `${BASE_URL}/latest/dex/search?q=${encodeURIComponent(q)}`,
      );
      const asOf = new Date().toISOString();
      pools = (res.pairs ?? [])
        .map((pair) => this.toPool(pair, asOf))
        .filter((p): p is DexPool => p !== null)
        // Deepest pools first: liquidity is the primary signal for which venue
        // actually carries a token's market.
        .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
      await this.cache.set(key, pools, SEARCH_TTL);
    }
    return withProvenance(pools.slice(0, capped), this.prov());
  }

  // --- internals -----------------------------------------------------------

  private toPool(pair: DexscreenerPair, asOf: string): DexPool | null {
    if (!pair.pairAddress || !pair.chainId || !pair.dexId || !pair.baseToken?.symbol || !pair.quoteToken?.symbol) {
      return null;
    }
    const num = (value: unknown): number | null => {
      const n = typeof value === 'string' ? Number(value) : (value as number | undefined);
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    };
    const count = (value: unknown): number | null => {
      const n = num(value);
      return n !== null && n >= 0 ? Math.round(n) : null;
    };
    return {
      pairAddress: pair.pairAddress,
      chain: pair.chainId,
      dex: pair.dexId,
      baseToken: {
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name ?? null,
        address: pair.baseToken.address ?? null,
      },
      quoteToken: {
        symbol: pair.quoteToken.symbol,
        name: pair.quoteToken.name ?? null,
        address: pair.quoteToken.address ?? null,
      },
      priceUsd: num(pair.priceUsd),
      change24hPct: num(pair.priceChange?.h24),
      volume24hUsd: num(pair.volume?.h24),
      liquidityUsd: num(pair.liquidity?.usd),
      fdvUsd: num(pair.fdv),
      buys24h: count(pair.txns?.h24?.buys),
      sells24h: count(pair.txns?.h24?.sells),
      url: pair.url && /^https:\/\//.test(pair.url) ? pair.url : null,
      asOf,
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.throttle(() => this.fetchImpl(url, { headers: { Accept: 'application/json' } }));
    } catch {
      throw new ProviderError('dexscreener', 'Dexscreener request failed.');
    }
    if (!res.ok) throw new ProviderError('dexscreener', `Dexscreener responded ${res.status}.`);
    return (await res.json()) as T;
  }

  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastCallAt = Date.now();
      return fn();
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private prov(): DataProvenance {
    return makeProvenance({
      provider: 'dexscreener',
      providerMode: 'public',
      capability: 'dexPools',
      tier: 'live',
      attribution: 'On-chain DEX pool data via Dexscreener',
      sourceUrl: 'https://dexscreener.com',
    });
  }
}
