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

// Numeric guards: reject NaN/Infinity (and, for prices, non-positive values) at
// the boundary so bad data fails cleanly instead of producing NaN/Infinity cells.
const FinitePrice = z.number().finite();
const FinitePositivePrice = z.number().finite().positive();
const FiniteNonnegative = z.number().finite().nonnegative();

export const QuoteSchema = z.object({
  symbol: z.string(),
  currency: Currency.optional(),
  /** Last/most-recent trade price. */
  price: FinitePositivePrice,
  bid: FinitePositivePrice.optional(),
  ask: FinitePositivePrice.optional(),
  bidSize: FiniteNonnegative.optional(),
  askSize: FiniteNonnegative.optional(),
  open: FinitePositivePrice.optional(),
  dayHigh: FinitePositivePrice.optional(),
  dayLow: FinitePositivePrice.optional(),
  prevClose: FinitePositivePrice.optional(),
  change: FinitePrice.optional(),
  changePercent: FinitePrice.optional(),
  /** Year-to-date move, percent. Optional; providers that lack it omit it. */
  ytdPercent: FinitePrice.optional(),
  volume: FiniteNonnegative.optional(),
  marketState: MarketStateSchema.optional(),
  timestamp: IsoDateTime,
});
export type Quote = z.infer<typeof QuoteSchema>;

export const QuoteBatchSchema = z.array(QuoteSchema);
export type QuoteBatch = z.infer<typeof QuoteBatchSchema>;

/** A single OHLCV candle. */
export const CandleSchema = z.object({
  t: IsoDateTime,
  o: FinitePositivePrice,
  h: FinitePositivePrice,
  l: FinitePositivePrice,
  c: FinitePositivePrice,
  v: FiniteNonnegative.optional(),
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
  price: FinitePositivePrice,
  size: FiniteNonnegative,
  side: TradeSideSchema.default('unknown'),
  venue: z.string().optional(),
});
export type TradePrint = z.infer<typeof TradePrintSchema>;

export const OrderBookLevelSchema = z.object({
  price: FinitePositivePrice,
  size: FiniteNonnegative,
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
  bid: FinitePositivePrice.optional(),
  ask: FinitePositivePrice.optional(),
  last: FinitePositivePrice.optional(),
  volume: FiniteNonnegative.optional(),
  timestamp: IsoDateTime,
});
export type VenueQuote = z.infer<typeof VenueQuoteSchema>;
