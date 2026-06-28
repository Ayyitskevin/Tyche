import { describe, it, expect } from 'vitest';
import type { SearchResult } from '@tyche/contracts';
import type { EnvelopeResult } from '../providers/apiClient';
import {
  MAX_IMPORT_SYMBOLS,
  parseSymbolList,
  validateSymbols,
  type SymbolSearchFn,
} from './batchImport';

describe('parseSymbolList', () => {
  it('splits on newlines, commas, and whitespace', () => {
    expect(parseSymbolList('aapl, msft\nnvda tsla')).toEqual(['AAPL', 'MSFT', 'NVDA', 'TSLA']);
  });

  it('trims, uppercases, and strips surrounding quotes', () => {
    expect(parseSymbolList('"aapl"\n  msft  \n\'nvda\'')).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });

  it('extracts symbols from CSV rows, dropping purely numeric columns', () => {
    const csv = 'AAPL,150.20,1000000\nMSFT,300.10,2000000';
    expect(parseSymbolList(csv)).toEqual(['AAPL', 'MSFT']);
  });

  it('de-dupes preserving first-seen order', () => {
    expect(parseSymbolList('AAPL,aapl,MSFT,AAPL')).toEqual(['AAPL', 'MSFT']);
  });

  it('drops empty and purely-numeric tokens', () => {
    expect(parseSymbolList(',,\n  ,\n42\nAAPL\n')).toEqual(['AAPL']);
  });

  it('caps output at MAX_IMPORT_SYMBOLS', () => {
    const many = Array.from({ length: MAX_IMPORT_SYMBOLS + 50 }, (_, i) => `S${i}`).join('\n');
    expect(parseSymbolList(many)).toHaveLength(MAX_IMPORT_SYMBOLS);
  });
});

function mockSearch(universe: string[]): SymbolSearchFn {
  const set = new Set(universe.map((s) => s.toUpperCase()));
  return async (q): Promise<EnvelopeResult<SearchResult[]>> => {
    const sym = q.toUpperCase();
    if (!set.has(sym)) return { ok: true, data: [], provenance: null };
    const data: SearchResult[] = [{ identifier: { symbol: sym, assetClass: 'equity' }, name: sym }];
    return { ok: true, data, provenance: null };
  };
}

describe('validateSymbols', () => {
  it('classifies valid, duplicate, and unknown', async () => {
    const search = mockSearch(['AAPL', 'MSFT', 'NVDA']);
    const result = await validateSymbols(['AAPL', 'MSFT', 'ZZZZ'], ['AAPL'], search);
    expect(result.valid).toEqual(['MSFT']);
    expect(result.duplicate).toEqual(['AAPL']);
    expect(result.unknown).toEqual(['ZZZZ']);
  });

  it('preserves candidate order in results', async () => {
    const search = mockSearch(['A', 'B', 'C']);
    const result = await validateSymbols(['C', 'B', 'A'], [], search);
    expect(result.results.map((r) => r.symbol)).toEqual(['C', 'B', 'A']);
    expect(result.valid).toEqual(['C', 'B', 'A']);
  });

  it('treats a failed search as unknown', async () => {
    const search: SymbolSearchFn = async () => ({
      ok: false,
      error: { kind: 'network_error', message: 'down' },
      provenance: null,
    });
    const result = await validateSymbols(['AAPL'], [], search);
    expect(result.unknown).toEqual(['AAPL']);
  });

  it('runs every candidate even with bounded concurrency', async () => {
    const search = mockSearch(Array.from({ length: 20 }, (_, i) => `S${i}`));
    const candidates = Array.from({ length: 20 }, (_, i) => `S${i}`);
    const result = await validateSymbols(candidates, [], search, 4);
    expect(result.valid).toHaveLength(20);
  });
});
