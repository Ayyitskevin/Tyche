import { describe, it, expect } from 'vitest';
import { NewsQuerySchema } from './index';

describe('contracts: NewsQuery', () => {
  it('parses an empty query (global feed)', () => {
    const parsed = NewsQuerySchema.parse({});
    expect(parsed).toEqual({});
  });

  it('parses a full query and round-trips the symbols array', () => {
    const parsed = NewsQuerySchema.parse({
      symbols: ['AAPL', 'MSFT'],
      source: 'Tyche Wire',
      keyword: 'guidance',
      since: '2026-06-01T00:00:00.000Z',
      until: '2026-06-28T23:59:59.000Z',
      watchlistId: 'wl_1',
      limit: 25,
    });
    expect(parsed.symbols).toEqual(['AAPL', 'MSFT']);
    expect(parsed.keyword).toBe('guidance');
    expect(parsed.limit).toBe(25);
  });

  it('rejects a non-datetime since', () => {
    expect(NewsQuerySchema.safeParse({ since: '2026-06-01' }).success).toBe(false);
  });

  it('rejects a non-positive limit', () => {
    expect(NewsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});
