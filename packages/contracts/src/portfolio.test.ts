import { describe, it, expect } from 'vitest';
import { WatchlistSchema } from './index';

const base = {
  id: 'wl_1',
  name: 'Megacaps',
  symbols: ['AAPL', 'MSFT'],
  createdAt: '2026-06-28T13:45:00.000Z',
  updatedAt: '2026-06-28T13:45:00.000Z',
};

describe('contracts: Watchlist order', () => {
  it('round-trips an explicit order', () => {
    const parsed = WatchlistSchema.parse({ ...base, order: 2 });
    expect(parsed.order).toBe(2);
  });

  it('parses a legacy list with no order (no migration needed)', () => {
    const parsed = WatchlistSchema.parse(base);
    expect(parsed.order).toBeUndefined();
    expect(parsed.symbols).toEqual(['AAPL', 'MSFT']);
  });

  it('defaults symbols to an empty array', () => {
    const parsed = WatchlistSchema.parse({
      id: 'wl_2',
      name: 'Empty',
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    });
    expect(parsed.symbols).toEqual([]);
  });

  it('rejects a non-numeric order', () => {
    const result = WatchlistSchema.safeParse({ ...base, order: 'first' });
    expect(result.success).toBe(false);
  });
});
