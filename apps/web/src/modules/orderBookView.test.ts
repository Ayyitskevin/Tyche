import { describe, it, expect } from 'vitest';
import { buildBookView } from './orderBookView';

const book = {
  symbol: 'BTC-USDT',
  timestamp: '2026-07-01T00:00:00.000Z',
  // Deliberately out of order to prove defensive sorting.
  bids: [
    { price: 99, size: 2 },
    { price: 100, size: 1 },
    { price: 98, size: 3 },
  ],
  asks: [
    { price: 102, size: 4 },
    { price: 101, size: 1 },
    { price: 103, size: 5 },
  ],
};

describe('buildBookView', () => {
  it('sorts, accumulates, and computes spread/mid/imbalance', () => {
    const view = buildBookView(book, 20);
    expect(view.bids.map((r) => r.price)).toEqual([100, 99, 98]);
    expect(view.asks.map((r) => r.price)).toEqual([101, 102, 103]);
    expect(view.bids.map((r) => r.cumulative)).toEqual([1, 3, 6]);
    expect(view.asks.map((r) => r.cumulative)).toEqual([1, 5, 10]);
    expect(view.spread).toBe(1);
    expect(view.mid).toBe(100.5);
    expect(view.spreadPct).toBeCloseTo(0.995, 2);
    expect(view.bidTotal).toBe(6);
    expect(view.askTotal).toBe(10);
    expect(view.imbalance).toBeCloseTo(6 / 16, 6);
    // Depth bars are normalized against the deeper side.
    expect(view.asks[2]!.share).toBe(1);
    expect(view.bids[2]!.share).toBeCloseTo(0.6, 6);
  });

  it('respects the depth cap and survives an empty side', () => {
    const capped = buildBookView(book, 2);
    expect(capped.bids).toHaveLength(2);
    expect(capped.asks).toHaveLength(2);

    const oneSided = buildBookView({ ...book, asks: [] }, 20);
    expect(oneSided.spread).toBeNull();
    expect(oneSided.mid).toBeNull();
    expect(oneSided.imbalance).toBe(1);
  });
});
