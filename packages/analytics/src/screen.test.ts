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
    altmanZ: null,
    piotroskiF: null,
    beneishM: null,
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

  it('filters and sorts by forensic score fields (Altman Z / Piotroski F)', () => {
    const u: ScreenRow[] = [
      row({ symbol: 'SAFE', altmanZ: 5.2, piotroskiF: 8 }),
      row({ symbol: 'GREY', altmanZ: 2.0, piotroskiF: 5 }),
      row({ symbol: 'DIST', altmanZ: 0.8, piotroskiF: 2 }),
      row({ symbol: 'CRYP', altmanZ: null, piotroskiF: null }), // non-equity: no forensic
    ];
    // Distress screen: Altman Z′ below the 1.23 distress line, excluding nulls.
    const distress = applyScreen(u, { filters: [{ field: 'altmanZ', op: 'lt', value: 1.23 }], limit: 50 });
    expect(distress.map((r) => r.symbol)).toEqual(['DIST']); // CRYP null is excluded, not "< 1.23"
    // Quality rank by Piotroski F desc (a null-scored name is filtered out first).
    const ranked = applyScreen(u, { filters: [{ field: 'piotroskiF', op: 'gt', value: 0 }], sort: { field: 'piotroskiF', dir: 'desc' }, limit: 50 });
    expect(ranked.map((r) => r.symbol)).toEqual(['SAFE', 'GREY', 'DIST']);
  });

  it('screens by Beneish M above the −1.78 manipulation-risk threshold', () => {
    const u: ScreenRow[] = [
      row({ symbol: 'FLAG', beneishM: -1.2 }), // above −1.78 → elevated
      row({ symbol: 'OKAY', beneishM: -2.5 }), // below → low risk
      row({ symbol: 'NONE', beneishM: null }),
    ];
    const elevated = applyScreen(u, { filters: [{ field: 'beneishM', op: 'gt', value: -1.78 }], limit: 50 });
    expect(elevated.map((r) => r.symbol)).toEqual(['FLAG']); // OKAY below threshold, NONE null → excluded
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
