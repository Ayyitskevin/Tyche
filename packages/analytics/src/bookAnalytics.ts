import type { OrderBook, OrderBookLevel } from '@tyche/contracts';
import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';

/** Depth available within a price band of ±`bps` around the mid. */
export interface DepthBand {
  bps: number;
  /** Base-asset quantity resting within the band. */
  bidQty: number;
  askQty: number;
  /** Quote-currency notional (Σ price × size) resting within the band. */
  bidNotional: number;
  askNotional: number;
  /** (bidNotional − askNotional) / (bidNotional + askNotional); null when both sides empty. */
  imbalance: number | null;
}

export interface BookAnalytics {
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  /** Size-weighted fair value = (bid×askSize + ask×bidSize) / (bidSize+askSize); null when a side is empty. */
  microprice: number | null;
  spread: number | null;
  spreadBps: number | null;
  /** Full-book notional imbalance (bid vs ask), −1…1; null when the book is empty. */
  imbalance: number | null;
  bidNotional: number;
  askNotional: number;
  bands: DepthBand[];
  meta: AnalyticalMeta;
}

export type FillSide = 'buy' | 'sell';

export interface FillResult {
  side: FillSide;
  /** Requested quote-currency notional. */
  notional: number;
  filledNotional: number;
  /** True when the book could fill the full requested notional. */
  filled: boolean;
  /** Volume-weighted average fill price; null when nothing could be filled. */
  avgPrice: number | null;
  /** Slippage vs mid in basis points (always ≥ 0 for a real book); null when unfillable/no mid. */
  slippageBps: number | null;
}

function live(levels: OrderBookLevel[]): OrderBookLevel[] {
  return levels.filter((l) => Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.size) && l.size > 0);
}
/** Bids high→low, asks low→high — the direction each side is consumed. */
function sortSide(levels: OrderBookLevel[], side: FillSide): OrderBookLevel[] {
  return [...live(levels)].sort((a, b) => (side === 'buy' ? a.price - b.price : b.price - a.price));
}
function notionalOf(levels: OrderBookLevel[]): number {
  return levels.reduce((sum, l) => sum + l.price * l.size, 0);
}

/**
 * Order-book microstructure analytics over a single depth snapshot: the mid and
 * size-weighted microprice, the spread in basis points, the notional resting
 * within a set of price bands (±bps) on each side, and the resulting depth
 * imbalance. Descriptive market-structure math — it never fabricates: a metric
 * that needs a side the book does not have (empty bids or asks) is null, not 0.
 * Not a signal, not advice.
 */
export function bookAnalytics(book: OrderBook, bandsBps: number[] = [10, 25, 50]): BookAnalytics {
  const bids = sortSide(book.bids, 'sell'); // high→low
  const asks = sortSide(book.asks, 'buy'); // low→high
  const bestBid = bids.length > 0 ? bids[0]!.price : null;
  const bestAsk = asks.length > 0 ? asks[0]!.price : null;
  const bestBidSize = bids.length > 0 ? bids[0]!.size : 0;
  const bestAskSize = asks.length > 0 ? asks[0]!.size : 0;

  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const spreadBps = spread !== null && mid !== null && mid > 0 ? (spread / mid) * 10000 : null;
  const microprice =
    bestBid !== null && bestAsk !== null && bestBidSize + bestAskSize > 0
      ? (bestBid * bestAskSize + bestAsk * bestBidSize) / (bestBidSize + bestAskSize)
      : null;

  const bidNotional = notionalOf(bids);
  const askNotional = notionalOf(asks);
  const totalNotional = bidNotional + askNotional;
  const imbalance = totalNotional > 0 ? (bidNotional - askNotional) / totalNotional : null;

  const bands: DepthBand[] = bandsBps.map((bps) => {
    if (mid === null) {
      return { bps, bidQty: 0, askQty: 0, bidNotional: 0, askNotional: 0, imbalance: null };
    }
    const lo = mid * (1 - bps / 10000);
    const hi = mid * (1 + bps / 10000);
    const inBids = bids.filter((l) => l.price >= lo);
    const inAsks = asks.filter((l) => l.price <= hi);
    const bn = notionalOf(inBids);
    const an = notionalOf(inAsks);
    const t = bn + an;
    return {
      bps,
      bidQty: inBids.reduce((s, l) => s + l.size, 0),
      askQty: inAsks.reduce((s, l) => s + l.size, 0),
      bidNotional: bn,
      askNotional: an,
      imbalance: t > 0 ? (bn - an) / t : null,
    };
  });

  return {
    bestBid,
    bestAsk,
    mid,
    microprice,
    spread,
    spreadBps,
    imbalance,
    bidNotional,
    askNotional,
    bands,
    meta: analyticalMeta({
      formulaId: 'book.depth-slippage.v1',
      status: mid === null ? 'unavailable' : 'estimated',
      units: 'bps',
      source: 'order book',
      asOf: book.timestamp,
      notes: mid === null ? 'One or both sides empty — mid/spread undefined' : 'Depth snapshot microstructure',
      value: mid,
    }),
  };
}

/**
 * Walk the book to fill `notional` (quote currency) as a market order and report
 * the volume-weighted average price and slippage vs mid. A buy consumes asks
 * ascending; a sell consumes bids descending. If the book cannot fill the whole
 * size, `filled` is false and the numbers describe the fillable portion only —
 * never an extrapolated price. Descriptive, not advice.
 */
export function costToFill(book: OrderBook, side: FillSide, notional: number): FillResult {
  const bids = sortSide(book.bids, 'sell');
  const asks = sortSide(book.asks, 'buy');
  const bestBid = bids.length > 0 ? bids[0]!.price : null;
  const bestAsk = asks.length > 0 ? asks[0]!.price : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const levels = side === 'buy' ? asks : bids;

  if (!(notional > 0) || levels.length === 0) {
    return { side, notional: notional > 0 ? notional : 0, filledNotional: 0, filled: false, avgPrice: null, slippageBps: null };
  }

  let remaining = notional;
  let filledBase = 0;
  let filledQuote = 0;
  for (const l of levels) {
    if (remaining <= 0) break;
    const levelNotional = l.price * l.size;
    const take = Math.min(remaining, levelNotional);
    filledQuote += take;
    filledBase += take / l.price;
    remaining -= take;
  }
  const avgPrice = filledBase > 0 ? filledQuote / filledBase : null;
  const slippageBps =
    avgPrice !== null && mid !== null && mid > 0
      ? side === 'buy'
        ? ((avgPrice - mid) / mid) * 10000
        : ((mid - avgPrice) / mid) * 10000
      : null;
  return {
    side,
    notional,
    filledNotional: filledQuote,
    filled: remaining <= 1e-9,
    avgPrice,
    slippageBps,
  };
}
