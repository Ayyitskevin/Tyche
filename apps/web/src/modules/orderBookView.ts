import type { OrderBook } from '@tyche/contracts';

export interface LadderRow {
  price: number;
  size: number;
  /** Running sum from the touch outward. */
  cumulative: number;
  /** cumulative / deepest cumulative on either side — drives the depth bar. */
  share: number;
}

export interface BookView {
  /** Asks sorted ascending (best ask first). Render reversed for a ladder. */
  asks: LadderRow[];
  /** Bids sorted descending (best bid first). */
  bids: LadderRow[];
  spread: number | null;
  spreadPct: number | null;
  mid: number | null;
  bidTotal: number;
  askTotal: number;
  /** Bid share of total resting size, 0..1 (0.5 = balanced). */
  imbalance: number | null;
}

/** Shape a raw order book into a renderable ladder with cumulative depth. */
export function buildBookView(book: OrderBook, depth = 20): BookView {
  const bids = [...book.bids].sort((a, b) => b.price - a.price).slice(0, depth);
  const asks = [...book.asks].sort((a, b) => a.price - b.price).slice(0, depth);

  let running = 0;
  const bidRows = bids.map((level) => ({ ...level, cumulative: (running += level.size), share: 0 }));
  const bidTotal = running;
  running = 0;
  const askRows = asks.map((level) => ({ ...level, cumulative: (running += level.size), share: 0 }));
  const askTotal = running;

  const deepest = Math.max(bidTotal, askTotal, 1e-12);
  for (const row of bidRows) row.share = row.cumulative / deepest;
  for (const row of askRows) row.share = row.cumulative / deepest;

  const bestBid = bidRows[0]?.price ?? null;
  const bestAsk = askRows[0]?.price ?? null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spreadPct = spread !== null && mid !== null && mid > 0 ? (spread / mid) * 100 : null;
  const total = bidTotal + askTotal;

  return {
    asks: askRows,
    bids: bidRows,
    spread,
    spreadPct,
    mid,
    bidTotal,
    askTotal,
    imbalance: total > 0 ? bidTotal / total : null,
  };
}
