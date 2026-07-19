import { describe, expect, it } from 'vitest';
import type { TradePrint, TradeSide } from '@tyche/contracts';
import { tradeFlow } from './tradeFlow';

function print(price: number, size: number, side: TradeSide): TradePrint {
  return { symbol: 'TEST', timestamp: '2026-07-19T00:00:00.000Z', price, size, side };
}

describe('tradeFlow', () => {
  const tape: TradePrint[] = [
    print(100, 10, 'buy'),
    print(101, 5, 'sell'),
    print(100.5, 20, 'buy'),
    print(99, 3, 'unknown'),
  ];

  it('aggregates volume, notional and VWAP', () => {
    const f = tradeFlow(tape);
    expect(f.count).toBe(4);
    expect(f.totalVolume).toBe(38);
    expect(f.notional).toBeCloseTo(3812, 6); // 1000 + 505 + 2010 + 297
    expect(f.vwap).toBeCloseTo(3812 / 38, 6);
    expect(f.avgSize).toBeCloseTo(9.5, 6);
    expect(f.high).toBe(101);
    expect(f.low).toBe(99);
  });

  it('splits buy/sell flow by aggressor side and never guesses unknown', () => {
    const f = tradeFlow(tape);
    expect(f.buyVolume).toBe(30);
    expect(f.sellVolume).toBe(5);
    expect(f.unknownVolume).toBe(3);
    expect(f.buyShare).toBeCloseTo(30 / 35, 6); // over classified volume only
    expect(f.netVolume).toBe(25);
    expect(f.netNotional).toBeCloseTo(1000 - 505 + 2010, 6); // 2505 (unknown contributes 0)
    expect(f.buyCount).toBe(2);
    expect(f.sellCount).toBe(1);
  });

  it('reports the single largest print', () => {
    const f = tradeFlow(tape);
    expect(f.largest).toEqual({ price: 100.5, size: 20, side: 'buy' });
  });

  it('returns nulls (not fabricated zeros) on an empty tape', () => {
    const f = tradeFlow([]);
    expect(f.count).toBe(0);
    expect(f.vwap).toBeNull();
    expect(f.avgSize).toBeNull();
    expect(f.buyShare).toBeNull();
    expect(f.largest).toBeNull();
    expect(f.high).toBeNull();
  });

  it('nulls buyShare when no print is classified', () => {
    const f = tradeFlow([print(100, 5, 'unknown'), print(100, 5, 'unknown')]);
    expect(f.buyShare).toBeNull(); // no buy/sell classification → not 0.5
    expect(f.unknownVolume).toBe(10);
    expect(f.netVolume).toBe(0);
  });

  it('drops non-positive size/price prints', () => {
    const f = tradeFlow([print(100, 0, 'buy'), print(100, 4, 'sell')]);
    expect(f.count).toBe(1);
    expect(f.sellVolume).toBe(4);
  });
});
