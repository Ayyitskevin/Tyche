import { describe, it, expect } from 'vitest';
import type { Position } from '@tyche/contracts';
import { parsePortfolioCsv, upsertPosition, upsertPositions } from './portfolioInput';

describe('parsePortfolioCsv', () => {
  it('parses symbol,quantity,avgCost rows', () => {
    const { positions, errors } = parsePortfolioCsv('AAPL,10,170.50\nMSFT,5,400');
    expect(errors).toEqual([]);
    expect(positions).toEqual([
      { symbol: 'AAPL', quantity: 10, averageCost: 170.5 },
      { symbol: 'MSFT', quantity: 5, averageCost: 400 },
    ]);
  });

  it('uppercases symbols, tolerates $ and whitespace, and allows a missing cost', () => {
    const { positions } = parsePortfolioCsv('  aapl , 10 , $170.50\nnvda,2');
    expect(positions[0]).toEqual({ symbol: 'AAPL', quantity: 10, averageCost: 170.5 });
    expect(positions[1]).toEqual({ symbol: 'NVDA', quantity: 2, averageCost: null });
  });

  it('skips a header row, blank lines, and # comments', () => {
    const { positions, errors } = parsePortfolioCsv('Symbol,Quantity,Cost\n\n# my holdings\nAAPL,1,100');
    expect(errors).toEqual([]);
    expect(positions).toEqual([{ symbol: 'AAPL', quantity: 1, averageCost: 100 }]);
  });

  it('collects per-line errors without aborting the rest', () => {
    const { positions, errors } = parsePortfolioCsv('AAPL,ten\n,5,100\nMSFT,3');
    expect(positions).toEqual([{ symbol: 'MSFT', quantity: 3, averageCost: null }]);
    expect(errors).toHaveLength(2);
  });

  it('accepts negative quantities (short positions)', () => {
    const { positions } = parsePortfolioCsv('TSLA,-4,250');
    expect(positions[0]).toEqual({ symbol: 'TSLA', quantity: -4, averageCost: 250 });
  });
});

describe('upsertPosition', () => {
  const base: Position[] = [{ symbol: 'AAPL', quantity: 10, averageCost: 100 }];

  it('appends a new symbol', () => {
    const next = upsertPosition(base, { symbol: 'MSFT', quantity: 5, averageCost: 200 });
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ symbol: 'MSFT', quantity: 5, averageCost: 200 });
    expect(base).toHaveLength(1); // input not mutated
  });

  it('merges quantity and blends average cost for an existing symbol', () => {
    const next = upsertPosition(base, { symbol: 'AAPL', quantity: 10, averageCost: 120 });
    expect(next).toHaveLength(1);
    expect(next[0]!.quantity).toBe(20);
    expect(next[0]!.averageCost).toBeCloseTo(110, 6); // (10*100 + 10*120)/20
  });

  it('omits averageCost when neither side has one', () => {
    const next = upsertPosition([{ symbol: 'AAPL', quantity: 1 }], { symbol: 'AAPL', quantity: 1, averageCost: null });
    expect(next[0]!.averageCost).toBeUndefined();
  });

  it('folds many holdings left to right', () => {
    const next = upsertPositions([], [
      { symbol: 'AAPL', quantity: 10, averageCost: 100 },
      { symbol: 'AAPL', quantity: 10, averageCost: 120 },
      { symbol: 'MSFT', quantity: 5, averageCost: 200 },
    ]);
    expect(next).toHaveLength(2);
    expect(next[0]!.quantity).toBe(20);
    expect(next[0]!.averageCost).toBeCloseTo(110, 6);
  });
});
