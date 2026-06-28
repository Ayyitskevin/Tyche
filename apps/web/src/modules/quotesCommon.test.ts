import { describe, it, expect } from 'vitest';
import type { Quote } from '@tyche/contracts';
import {
  QUOTE_COLUMN_CATALOG,
  DEFAULT_QUOTE_COLUMNS,
  buildQuoteColumns,
  cycleSort,
  formatAge,
  mergeQuotes,
  sortQuotes,
} from './quotesCommon';

function q(symbol: string, over: Partial<Quote> = {}): Quote {
  return {
    symbol,
    price: 100,
    change: 0,
    changePercent: 0,
    volume: 1000,
    timestamp: '2026-06-28T13:45:00.000Z',
    ...over,
  };
}

describe('QUOTE_COLUMN_CATALOG / buildQuoteColumns', () => {
  it('includes every documented column id', () => {
    for (const id of ['symbol', 'price', 'change', 'pct', 'vol', 'bid', 'ask', 'dayHigh', 'dayLow', 'open', 'prevClose', 'age']) {
      expect(QUOTE_COLUMN_CATALOG[id]).toBeDefined();
    }
  });

  it('builds an ordered column list and drops unknown ids', () => {
    const cols = buildQuoteColumns(['symbol', 'nope', 'age']);
    expect(cols.map((c) => c.key)).toEqual(['symbol', 'age']);
  });

  it('defaults include the age column', () => {
    expect(DEFAULT_QUOTE_COLUMNS).toContain('age');
  });
});

describe('sortQuotes', () => {
  const rows = [q('AAPL', { price: 100 }), q('MSFT', { price: 300 }), q('NVDA', { price: 200 })];

  it('returns rows unchanged when sort is null', () => {
    expect(sortQuotes(rows, null)).toBe(rows);
  });

  it('sorts numerically descending', () => {
    const sorted = sortQuotes(rows, { columnId: 'price', dir: 'desc' });
    expect(sorted.map((r) => r.symbol)).toEqual(['MSFT', 'NVDA', 'AAPL']);
  });

  it('sorts numerically ascending', () => {
    const sorted = sortQuotes(rows, { columnId: 'price', dir: 'asc' });
    expect(sorted.map((r) => r.symbol)).toEqual(['AAPL', 'NVDA', 'MSFT']);
  });

  it('sorts lexically by symbol', () => {
    const sorted = sortQuotes(rows, { columnId: 'symbol', dir: 'asc' });
    expect(sorted.map((r) => r.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });

  it('is stable with a symbol tiebreak', () => {
    const tied = [q('NVDA', { price: 50 }), q('AAPL', { price: 50 }), q('MSFT', { price: 50 })];
    const sorted = sortQuotes(tied, { columnId: 'price', dir: 'desc' });
    expect(sorted.map((r) => r.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    sortQuotes(rows, { columnId: 'price', dir: 'desc' });
    expect(rows).toEqual(copy);
  });
});

describe('cycleSort', () => {
  it('cycles none → desc → asc → none on the same column', () => {
    const a = cycleSort(null, 'price');
    expect(a).toEqual({ columnId: 'price', dir: 'desc' });
    const b = cycleSort(a, 'price');
    expect(b).toEqual({ columnId: 'price', dir: 'asc' });
    const c = cycleSort(b, 'price');
    expect(c).toBeNull();
  });

  it('starts fresh (desc) when a different column is clicked', () => {
    expect(cycleSort({ columnId: 'price', dir: 'asc' }, 'vol')).toEqual({ columnId: 'vol', dir: 'desc' });
  });
});

describe('formatAge', () => {
  const base = Date.parse('2026-06-28T13:45:00.000Z');
  it('renders seconds, minutes, and hours', () => {
    expect(formatAge('2026-06-28T13:45:00.000Z', base + 5_000)).toBe('5s');
    expect(formatAge('2026-06-28T13:45:00.000Z', base + 120_000)).toBe('2m');
    expect(formatAge('2026-06-28T13:45:00.000Z', base + 7_200_000)).toBe('2h');
  });

  it('clamps negative ages to 0s', () => {
    expect(formatAge('2026-06-28T13:45:00.000Z', base - 5_000)).toBe('0s');
  });

  it('returns an em dash for an unparseable timestamp', () => {
    expect(formatAge('not-a-date', base)).toBe('—');
  });
});

describe('mergeQuotes', () => {
  it('overlays live quotes over the initial batch, preserving symbol order', () => {
    const initial = [q('AAPL', { price: 100 }), q('MSFT', { price: 300 })];
    const live = { MSFT: q('MSFT', { price: 305 }) };
    const merged = mergeQuotes(['AAPL', 'MSFT'], initial, live);
    expect(merged.map((r) => r.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(merged[1]!.price).toBe(305);
  });

  it('skips symbols with no quote anywhere', () => {
    const merged = mergeQuotes(['AAPL', 'ZZZZ'], [q('AAPL')], {});
    expect(merged.map((r) => r.symbol)).toEqual(['AAPL']);
  });
});
