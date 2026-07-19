import { describe, expect, it } from 'vitest';
import type { OrderBook } from '@tyche/contracts';
import { bookAnalytics, costToFill } from './bookAnalytics';

function book(bids: [number, number][], asks: [number, number][]): OrderBook {
  return {
    symbol: 'TEST',
    timestamp: '2026-07-19T00:00:00.000Z',
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
  };
}

// mid = 100.5; bid notional 300+495=795; ask notional 202+408=610.
const b = book(
  [
    [100, 3],
    [99, 5],
  ],
  [
    [101, 2],
    [102, 4],
  ],
);

describe('bookAnalytics', () => {
  it('computes mid, microprice, spread and full-book imbalance', () => {
    const a = bookAnalytics(b);
    expect(a.bestBid).toBe(100);
    expect(a.bestAsk).toBe(101);
    expect(a.mid).toBe(100.5);
    expect(a.spread).toBe(1);
    expect(a.spreadBps).toBeCloseTo(99.50249, 4);
    // size-weighted toward the thinner ask side → above mid
    expect(a.microprice).toBeCloseTo(100.6, 6);
    expect(a.bidNotional).toBeCloseTo(795, 6);
    expect(a.askNotional).toBeCloseTo(610, 6);
    expect(a.imbalance).toBeCloseTo(185 / 1405, 6);
  });

  it('measures depth within price bands', () => {
    const a = bookAnalytics(b, [50, 1500]);
    const [tight, wide] = a.bands;
    // ±50 bps of 100.5 = [99.9975, 101.0025] → only the top level each side
    expect(tight!.bidQty).toBe(3);
    expect(tight!.askQty).toBe(2);
    expect(tight!.bidNotional).toBeCloseTo(300, 6);
    expect(tight!.askNotional).toBeCloseTo(202, 6);
    expect(tight!.imbalance).toBeCloseTo(98 / 502, 6);
    // ±1500 bps captures every level
    expect(wide!.bidQty).toBe(8);
    expect(wide!.askQty).toBe(6);
    expect(wide!.imbalance).toBeCloseTo(185 / 1405, 6);
  });

  it('nulls side-dependent metrics when a side is empty (never fabricates)', () => {
    const a = bookAnalytics(book([[100, 3]], []));
    expect(a.mid).toBeNull();
    expect(a.microprice).toBeNull();
    expect(a.spread).toBeNull();
    expect(a.spreadBps).toBeNull();
    expect(a.imbalance).toBe(1); // bids-only book is fully bid-weighted
    expect(a.bands[0]!.bidQty).toBe(0); // no mid → no band
  });
});

describe('costToFill', () => {
  it('fills within one level with the level price', () => {
    const r = costToFill(b, 'buy', 202); // exactly the top ask notional
    expect(r.filled).toBe(true);
    expect(r.avgPrice).toBeCloseTo(101, 6);
    expect(r.slippageBps).toBeCloseTo(49.75124, 4);
  });

  it('walks multiple levels for a larger order', () => {
    const r = costToFill(b, 'sell', 300); // consumes the 100×3 bid exactly
    expect(r.filled).toBe(true);
    expect(r.avgPrice).toBeCloseTo(100, 6);
    expect(r.slippageBps).toBeCloseTo(49.75124, 4);
  });

  it('reports a partial fill when the book is too thin', () => {
    const r = costToFill(b, 'buy', 700); // ask side only holds 610
    expect(r.filled).toBe(false);
    expect(r.filledNotional).toBeCloseTo(610, 6);
    expect(r.avgPrice).toBeCloseTo(610 / 6, 6); // (202+408)/(2+4)
    expect(r.slippageBps).toBeCloseTo(116.0862, 3);
  });

  it('returns an unfilled result on an empty side or non-positive size', () => {
    expect(costToFill(book([[100, 3]], []), 'buy', 100)).toMatchObject({ filled: false, avgPrice: null, slippageBps: null });
    expect(costToFill(b, 'buy', 0)).toMatchObject({ filled: false, avgPrice: null });
    expect(costToFill(b, 'buy', -5)).toMatchObject({ filled: false, avgPrice: null });
  });
});
