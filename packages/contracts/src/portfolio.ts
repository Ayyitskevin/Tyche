import { z } from 'zod';
import { IsoDateTime, Currency, HexColor } from './common';
import { AssetClassSchema } from './instruments';

export const PositionSchema = z.object({
  symbol: z.string(),
  assetClass: AssetClassSchema.optional(),
  quantity: z.number(),
  averageCost: z.number().optional(),
  costBasis: z.number().optional(),
  currency: Currency.optional(),
  marketPrice: z.number().optional(),
  marketValue: z.number().optional(),
  unrealizedPnl: z.number().optional(),
  realizedPnl: z.number().optional(),
  openedAt: IsoDateTime.optional(),
});
export type Position = z.infer<typeof PositionSchema>;

export const PortfolioSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseCurrency: Currency.default('USD'),
  cash: z.number().default(0),
  positions: z.array(PositionSchema).default([]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

export const WatchlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbols: z.array(z.string()).default([]),
  color: HexColor.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Watchlist = z.infer<typeof WatchlistSchema>;
