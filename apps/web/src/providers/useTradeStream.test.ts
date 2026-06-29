import { describe, it, expect } from 'vitest';
import type { TradePrint } from '@tyche/contracts';
import { mergeTradePrints } from './useTradeStream';

function p(price: number): TradePrint {
  return { symbol: 'AAPL', timestamp: '2026-06-29T00:00:00.000Z', price, size: 1, side: 'buy' };
}

describe('mergeTradePrints (ring buffer)', () => {
  it('prepends a tick newest-first and caps the buffer', () => {
    const prev = [p(3), p(2), p(1)];
    // Within a tick, the last element is the newest print.
    const out = mergeTradePrints(prev, [p(10), p(11)], 4);
    expect(out.map((x) => x.price)).toEqual([11, 10, 3, 2]); // newest on top, capped to 4
  });

  it('caps from an empty buffer', () => {
    const out = mergeTradePrints([], [p(1), p(2), p(3)], 2);
    expect(out.map((x) => x.price)).toEqual([3, 2]);
  });

  it('is a no-op shape for an empty tick', () => {
    const prev = [p(1)];
    expect(mergeTradePrints(prev, [], 10)).toEqual(prev);
  });
});
