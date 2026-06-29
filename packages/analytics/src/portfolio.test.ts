import { describe, it, expect } from 'vitest';
import type { Position } from '@tyche/contracts';
import { markPortfolio } from './portfolio';

function pos(over: Partial<Position> & { symbol: string; quantity: number }): Position {
  return { ...over };
}

const prices: Record<string, number> = { AAPL: 120, MSFT: 180 };
const priceFor = (s: string): number | undefined => prices[s];

describe('markPortfolio', () => {
  const positions: Position[] = [
    pos({ symbol: 'AAPL', quantity: 10, averageCost: 100 }),
    pos({ symbol: 'MSFT', quantity: 5, averageCost: 200 }),
    pos({ symbol: 'NVDA', quantity: 2, averageCost: 50 }), // no live price
  ];
  const { marks, summary } = markPortfolio(positions, priceFor, 500);

  it('marks each position against its live price', () => {
    const aapl = marks[0]!;
    expect(aapl.marketValue).toBe(1200);
    expect(aapl.costValue).toBe(1000);
    expect(aapl.unrealizedPnl).toBe(200);
    expect(aapl.unrealizedPnlPct).toBeCloseTo(20, 5);

    const msft = marks[1]!;
    expect(msft.marketValue).toBe(900);
    expect(msft.unrealizedPnl).toBe(-100);
    expect(msft.unrealizedPnlPct).toBeCloseTo(-10, 5);
  });

  it('leaves marks null for an unpriced position but keeps its cost', () => {
    const nvda = marks[2]!;
    expect(nvda.marketPrice).toBeNull();
    expect(nvda.marketValue).toBeNull();
    expect(nvda.unrealizedPnl).toBeNull();
    expect(nvda.costValue).toBe(100);
    expect(nvda.weight).toBeNull();
  });

  it('computes weights against gross market value', () => {
    expect(marks[0]!.weight).toBeCloseTo((1200 / 2100) * 100, 4);
    expect(marks[1]!.weight).toBeCloseTo((900 / 2100) * 100, 4);
  });

  it('summarizes totals, P&L%, priced count, and total value incl. cash', () => {
    expect(summary.positionCount).toBe(3);
    expect(summary.pricedCount).toBe(2);
    expect(summary.marketValue).toBe(2100);
    expect(summary.unrealizedPnl).toBe(100);
    // P&L% is denominated only on the cost of priced positions (2000), not all cost.
    expect(summary.unrealizedPnlPct).toBeCloseTo(5, 5);
    expect(summary.cash).toBe(500);
    expect(summary.totalValue).toBe(2600);
  });

  it('handles a position with no average cost (value but no P&L)', () => {
    const { marks: m } = markPortfolio([pos({ symbol: 'AAPL', quantity: 3 })], priceFor);
    expect(m[0]!.marketValue).toBe(360);
    expect(m[0]!.costValue).toBeNull();
    expect(m[0]!.unrealizedPnl).toBeNull();
    expect(m[0]!.weight).toBeCloseTo(100, 5);
  });

  it('keeps short-position P&L% sign-aligned with the dollar P&L and weights gross', () => {
    // A profitable short: TSLA −4 @ 250 marked at 200 → +$200 gain.
    const shortPrices: Record<string, number> = { AAPL: 120, TSLA: 200 };
    const { marks: m, summary: s } = markPortfolio(
      [pos({ symbol: 'AAPL', quantity: 10, averageCost: 100 }), pos({ symbol: 'TSLA', quantity: -4, averageCost: 250 })],
      (sym) => shortPrices[sym],
    );
    const tsla = m[1]!;
    expect(tsla.marketValue).toBe(-800);
    expect(tsla.costValue).toBe(-1000);
    expect(tsla.unrealizedPnl).toBe(200); // (200 − 250) × −4
    expect(tsla.unrealizedPnlPct).toBeCloseTo(20, 5); // positive: a winning short, despite a negative cost basis
    // Weights are signed magnitudes over gross exposure (1200 + 800 = 2000).
    expect(m[0]!.weight).toBeCloseTo(60, 4);
    expect(tsla.weight).toBeCloseTo(-40, 4);
    // Summary P&L% on gross cost (1000 + 1000) stays consistent with the +$400 dollar P&L.
    expect(s.unrealizedPnl).toBe(400);
    expect(s.unrealizedPnlPct).toBeCloseTo(20, 5);
  });

  it('returns a zeroed summary for an empty portfolio', () => {
    const { marks: m, summary: s } = markPortfolio([], priceFor, 250);
    expect(m).toEqual([]);
    expect(s.marketValue).toBe(0);
    expect(s.unrealizedPnl).toBe(0);
    expect(s.unrealizedPnlPct).toBeNull();
    expect(s.totalValue).toBe(250);
  });
});
