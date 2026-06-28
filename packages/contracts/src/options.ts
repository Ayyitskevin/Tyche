import { z } from 'zod';
import { IsoDate } from './common';

export const OptionTypeSchema = z.enum(['call', 'put']);
export type OptionType = z.infer<typeof OptionTypeSchema>;

export const OptionGreeksSchema = z.object({
  delta: z.number().optional(),
  gamma: z.number().optional(),
  theta: z.number().optional(),
  vega: z.number().optional(),
  rho: z.number().optional(),
});
export type OptionGreeks = z.infer<typeof OptionGreeksSchema>;

export const OptionContractSchema = z.object({
  /** OCC-style contract symbol. */
  contractSymbol: z.string(),
  underlying: z.string(),
  type: OptionTypeSchema,
  strike: z.number().positive(),
  expiry: IsoDate,
  bid: z.number().optional(),
  ask: z.number().optional(),
  last: z.number().optional(),
  volume: z.number().nonnegative().optional(),
  openInterest: z.number().nonnegative().optional(),
  impliedVolatility: z.number().optional(),
  inTheMoney: z.boolean().optional(),
  greeks: OptionGreeksSchema.optional(),
});
export type OptionContract = z.infer<typeof OptionContractSchema>;

export const OptionChainSchema = z.object({
  underlying: z.string(),
  expirations: z.array(IsoDate),
  strikes: z.array(z.number()).optional(),
  contracts: z.array(OptionContractSchema),
});
export type OptionChain = z.infer<typeof OptionChainSchema>;
