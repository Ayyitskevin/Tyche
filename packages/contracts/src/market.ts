import { z } from 'zod';
import { IsoDateTime, Currency } from './common';

/** Bar interval for historical / intraday series. */
export const BarIntervalSchema = z.enum([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
]);
export type BarInterval = z.infer<typeof BarIntervalSchema>;

/** Lookback range, terminal-style. */
export const HistoryRangeSchema = z.enum([
  '1d',
  '5d',
  '1mo',
  '3mo',
  '6mo',
  '1y',
  '2y',
  '5y',
  'max',
]);
export type HistoryRange = z.infer<typeof HistoryRangeSchema>;

export const MarketStateSchema = z.enum(['pre', 'regular', 'post', 'closed']);
export type MarketState = z.infer<typeof MarketStateSchema>;

export const QuoteSchema = z.object({
  symbol: z.string(),
  currency: Currency.optional(),
  /** Last/most-recent trade price. */
  price: z.number(),
  bid: z.number().optional(),
  ask: z.number().optional(),
  bidSize: z.number().optional(),
  askSize: z.number().optional(),
  open: z.number().optional(),
  dayHigh: z.number().optional(),
  dayLow: z.number().optional(),
  prevClose: z.number().optional(),
  change: z.number().optional(),
  changePercent: z.number().optional(),
  volume: z.number().nonnegative().optional(),
  marketState: MarketStateSchema.optional(),
  timestamp: IsoDateTime,
});
export type Quote = z.infer<typeof QuoteSchema>;

export const QuoteBatchSchema = z.array(QuoteSchema);
export type QuoteBatch = z.infer<typeof QuoteBatchSchema>;

/** A single OHLCV candle. */
export const CandleSchema = z.object({
  t: IsoDateTime,
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nonnegative().optional(),
});
export type Candle = z.infer<typeof CandleSchema>;

export const HistoricalSeriesSchema = z.object({
  symbol: z.string(),
  interval: BarIntervalSchema,
  range: HistoryRangeSchema.optional(),
  currency: Currency.optional(),
  candles: z.array(CandleSchema),
});
export type HistoricalSeries = z.infer<typeof HistoricalSeriesSchema>;

export const TradeSideSchema = z.enum(['buy', 'sell', 'unknown']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

/** A time-and-sales print. */
export const TradePrintSchema = z.object({
  symbol: z.string(),
  timestamp: IsoDateTime,
  price: z.number(),
  size: z.number().nonnegative(),
  side: TradeSideSchema.default('unknown'),
  venue: z.string().optional(),
});
export type TradePrint = z.infer<typeof TradePrintSchema>;

export const OrderBookLevelSchema = z.object({
  price: z.number(),
  size: z.number().nonnegative(),
});
export type OrderBookLevel = z.infer<typeof OrderBookLevelSchema>;

export const OrderBookSchema = z.object({
  symbol: z.string(),
  timestamp: IsoDateTime,
  bids: z.array(OrderBookLevelSchema),
  asks: z.array(OrderBookLevelSchema),
});
export type OrderBook = z.infer<typeof OrderBookSchema>;

/** A per-venue quote used by composite/NBBO-style views. */
export const VenueQuoteSchema = z.object({
  venue: z.string(),
  bid: z.number().optional(),
  ask: z.number().optional(),
  last: z.number().optional(),
  volume: z.number().nonnegative().optional(),
  timestamp: IsoDateTime,
});
export type VenueQuote = z.infer<typeof VenueQuoteSchema>;
