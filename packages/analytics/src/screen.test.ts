import { describe, it, expect } from 'vitest';
import type { ScreenRow } from '@tyche/contracts';
import { applyScreen } from './screen';

function row(over: Partial<ScreenRow> & { symbol: string }): ScreenRow {
  return {
    name: over.symbol,
    assetClass: 'equity',
    sector: null,
    price: null,
    changePercent: null,
    marketCap: null,
    volume: null,
    ...over,
  };
}

const universe: ScreenRow[] = [
  row({ symbol: 'AAA', sector: 'Tech', price: 100, changePercent: 2, marketCap: 3_000, volume: 1_000 }),
  row({ symbol: 'BBB', sector: 'Tech', price: 50, changePercent: -1, marketCap: 1_000, volume: 5_000 }),
  row({ symbol: 'CCC', sector: 'Energy', price: 200, changePercent: 5, marketCap: 8_000, volume: 200 }),
  row({ symbol: 'DDD', sector: 'Energy', price: 10, changePercent: 0, marketCap: null, volume: 9_000 }),
];

describe('applyScreen', () => {
  it('filters by a numeric comparison (AND across filters)', () => {
    const out = applyScreen(universe, { filters: [{ field: 'price', op: 'gt', value: 40 }, { field: 'changePercent', op: 'gte', value: 2 }], limit: 50 });
    expect(out.map((r) => r.symbol)).toEqual(['AAA', 'CCC']);
  });

  it('filters categorical fields case-insensitively (eq/neq)', () => {
    const tech = applyScreen(universe, { filters: [{ field: 'sector', op: 'eq', value: 'tech' }], limit: 50 });
    expect(tech.map((r) => r.symbol).sort()).toEqual(['AAA', 'BBB']);
    const notTech = applyScreen(universe, { filters: [{ field: 'sector', op: 'neq', value: 'Tech' }], limit: 50 });
    expect(notTech.map((r) => r.symbol).sort()).toEqual(['CCC', 'DDD']);
  });

  it('excludes rows whose filtered metric is null', () => {
    const out = applyScreen(universe, { filters: [{ field: 'marketCap', op: 'gt', value: 0 }], limit: 50 });
    expect(out.map((r) => r.symbol)).not.toContain('DDD'); // DDD.marketCap is null
  });

  it('sorts descending by default and puts nulls last', () => {
    const out = applyScreen(universe, { filters: [], sort: { field: 'marketCap', dir: 'desc' }, limit: 50 });
    expect(out.map((r) => r.symbol)).toEqual(['CCC', 'AAA', 'BBB', 'DDD']); // DDD (null) last
  });

  it('sorts ascending and respects the limit', () => {
    const out = applyScreen(universe, { filters: [], sort: { field: 'price', dir: 'asc' }, limit: 2 });
    expect(out.map((r) => r.symbol)).toEqual(['DDD', 'BBB']);
  });

  it('keeps nulls last even when sorting ascending', () => {
    const out = applyScreen(universe, { filters: [], sort: { field: 'marketCap', dir: 'asc' }, limit: 50 });
    expect(out.map((r) => r.symbol)).toEqual(['BBB', 'AAA', 'CCC', 'DDD']); // DDD (null) still last
  });

  it('returns the whole universe (capped) when there are no filters', () => {
    expect(applyScreen(universe, { filters: [], limit: 50 })).toHaveLength(4);
    expect(applyScreen(universe, { filters: [], limit: 1 })).toHaveLength(1);
  });
});
