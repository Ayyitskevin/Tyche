import { z } from 'zod';
import { IsoDateTime } from './common';

/** One leg of a DEX pair (the token being priced or the token pricing it). */
export const DexTokenSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable().default(null),
  /** On-chain contract address (mint on Solana). */
  address: z.string().nullable().default(null),
});
export type DexToken = z.infer<typeof DexTokenSchema>;

/**
 * An on-chain DEX liquidity pool snapshot: where a token actually trades on
 * decentralized venues, at what price, and with how much depth behind it.
 * This is the on-chain market-structure view a listed-markets terminal lacks.
 */
export const DexPoolSchema = z.object({
  /** The pool/pair contract address — the stable identifier on its chain. */
  pairAddress: z.string(),
  /** Chain the pool lives on (e.g. `ethereum`, `solana`, `base`). */
  chain: z.string(),
  /** Venue/protocol (e.g. `uniswap`, `raydium`). */
  dex: z.string(),
  baseToken: DexTokenSchema,
  quoteToken: DexTokenSchema,
  /** Last trade price of the base token in USD, when the source provides it. */
  priceUsd: z.number().finite().nullable().default(null),
  /** 24h price change in percent. */
  change24hPct: z.number().finite().nullable().default(null),
  /** 24h traded volume in USD. */
  volume24hUsd: z.number().finite().nullable().default(null),
  /** Total pool liquidity in USD — the depth behind the price. */
  liquidityUsd: z.number().finite().nullable().default(null),
  /** Fully-diluted valuation of the base token in USD. */
  fdvUsd: z.number().finite().nullable().default(null),
  /** 24h buy/sell transaction counts, when the source provides them. */
  buys24h: z.number().int().nonnegative().nullable().default(null),
  sells24h: z.number().int().nonnegative().nullable().default(null),
  /** External link to the pool page at the source. */
  url: z.string().url().nullable().default(null),
  asOf: IsoDateTime,
});
export type DexPool = z.infer<typeof DexPoolSchema>;
