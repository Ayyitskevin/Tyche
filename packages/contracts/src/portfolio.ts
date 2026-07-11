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

/** Headline risk statistics for a portfolio's return series (mirrors @tyche/analytics). */
export const PortfolioRiskStatsSchema = z.object({
  annualizedReturn: z.number(),
  annualizedVolatility: z.number(),
  sharpe: z.number(),
  sortino: z.number(),
  calmar: z.number(),
  maxDrawdown: z.number(),
  /** Historical 1-period VaR at the requested confidence (a negative return). */
  valueAtRisk: z.number(),
  /** Benchmark-relative fields are null when no benchmark history was available. */
  beta: z.number().nullable(),
  trackingError: z.number().nullable(),
  informationRatio: z.number().nullable(),
});
export type PortfolioRiskStats = z.infer<typeof PortfolioRiskStatsSchema>;

export const HoldingRiskSchema = z.object({
  symbol: z.string(),
  /** Gross-normalized signed value weight (Σ|weight| = 1). */
  weight: z.number(),
  beta: z.number().nullable(),
});
export type HoldingRisk = z.infer<typeof HoldingRiskSchema>;

/** Response of GET /api/portfolios/:id/risk — derived analytics over market data. */
export const PortfolioRiskSchema = z.object({
  portfolioId: z.string(),
  benchmark: z.string(),
  periodsPerYear: z.number(),
  observations: z.number(),
  coverage: z.object({ priced: z.number(), total: z.number() }),
  stats: PortfolioRiskStatsSchema,
  holdings: z.array(HoldingRiskSchema),
});
export type PortfolioRisk = z.infer<typeof PortfolioRiskSchema>;

export const WatchlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbols: z.array(z.string()).default([]),
  color: HexColor.optional(),
  /** Stable tab ordering. Optional so existing persisted lists parse without migration. */
  order: z.number().optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Watchlist = z.infer<typeof WatchlistSchema>;
