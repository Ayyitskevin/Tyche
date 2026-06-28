import { describe, it, expect } from 'vitest';
import { QuoteSchema, CandleSchema, TradePrintSchema, OrderBookLevelSchema } from './market';

const ts = '2026-06-28T13:45:00.000Z';

describe('market numeric guards', () => {
  it('rejects NaN / Infinity / non-positive prices on Quote', () => {
    expect(QuoteSchema.safeParse({ symbol: 'AAPL', price: NaN, timestamp: ts }).success).toBe(false);
    expect(QuoteSchema.safeParse({ symbol: 'AAPL', price: Infinity, timestamp: ts }).success).toBe(false);
    expect(QuoteSchema.safeParse({ symbol: 'AAPL', price: -1, timestamp: ts }).success).toBe(false);
    expect(QuoteSchema.safeParse({ symbol: 'AAPL', price: 0, timestamp: ts }).success).toBe(false);
  });

  it('accepts a valid quote and allows a negative change', () => {
    const r = QuoteSchema.safeParse({
      symbol: 'AAPL',
      price: 195.1,
      change: -2.3,
      changePercent: -1.2,
      volume: 1000,
      timestamp: ts,
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-finite / non-positive candle OHLC', () => {
    const base = { t: ts, o: 1, h: 1, l: 1, c: 1 };
    expect(CandleSchema.safeParse(base).success).toBe(true);
    expect(CandleSchema.safeParse({ ...base, h: Infinity }).success).toBe(false);
    expect(CandleSchema.safeParse({ ...base, l: -1 }).success).toBe(false);
    expect(CandleSchema.safeParse({ ...base, v: Infinity }).success).toBe(false);
  });

  it('rejects non-finite trade and order-book values', () => {
    expect(TradePrintSchema.safeParse({ symbol: 'AAPL', timestamp: ts, price: NaN, size: 1 }).success).toBe(false);
    expect(OrderBookLevelSchema.safeParse({ price: -1, size: 1 }).success).toBe(false);
    expect(OrderBookLevelSchema.safeParse({ price: 1, size: Infinity }).success).toBe(false);
    expect(OrderBookLevelSchema.safeParse({ price: 1, size: 1 }).success).toBe(true);
  });
});
