import { describe, it, expect } from 'vitest';
import { HistoricalSeriesSchema, QuoteSchema } from '@tyche/contracts';
import { FrankfurterProvider } from './FrankfurterProvider';
import { BinanceProvider } from './BinanceProvider';
import type { FetchLike } from './stubs/FredProvider';

const SERIES = {
  base: 'EUR',
  rates: {
    '2026-06-29': { USD: 1.0812 },
    '2026-06-30': { USD: 1.0845 },
    '2026-07-01': { USD: 1.0901 },
  },
};

function fakeFetch(payload: unknown, calls: { n: number } = { n: 0 }): FetchLike {
  return () => {
    calls.n += 1;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
  };
}

describe('FrankfurterProvider', () => {
  it('serves only ECB currency pairs', () => {
    const p = new FrankfurterProvider({ fetchImpl: fakeFetch(SERIES) });
    expect(p.servesSymbol('EUR-USD')).toBe(true);
    expect(p.servesSymbol('chf-jpy')).toBe(true);
    expect(p.servesSymbol('EUR-EUR')).toBe(false); // degenerate
    expect(p.servesSymbol('BTC-USD')).toBe(false); // not an ECB currency
    expect(p.servesSymbol('AAPL')).toBe(false);
  });

  it('maps the ECB series to a valid EOD quote with change vs the prior fixing', async () => {
    const p = new FrankfurterProvider({ fetchImpl: fakeFetch(SERIES), minIntervalMs: 0 });
    const { data, provenance } = await p.getQuote('EUR-USD');
    expect(QuoteSchema.parse(data)).toBeTruthy();
    expect(data.price).toBe(1.0901);
    expect(data.prevClose).toBe(1.0845);
    expect(data.change).toBeCloseTo(0.0056, 6);
    expect(data.changePercent).toBeCloseTo(0.52, 2);
    expect(provenance.provider).toBe('frankfurter');
    expect(provenance.freshness.tier).toBe('eod');
    await expect(p.getQuote('BTC-USD')).rejects.toThrow(/ECB currency pair/);
  });

  it('serves flat daily candles (one fixing per day) sorted ascending, and caches the series', async () => {
    const calls = { n: 0 };
    const p = new FrankfurterProvider({ fetchImpl: fakeFetch(SERIES, calls), minIntervalMs: 0 });
    const { data } = await p.getHistory('EUR-USD', { range: '1mo' });
    expect(HistoricalSeriesSchema.parse(data)).toBeTruthy();
    expect(data.candles.map((c) => c.c)).toEqual([1.0812, 1.0845, 1.0901]);
    expect(data.candles[0]).toMatchObject({ o: 1.0812, h: 1.0812, l: 1.0812 });
    await p.getHistory('EUR-USD', { range: '1mo' });
    expect(calls.n).toBe(1); // cached
  });

  it('keeps quote batches best-effort across mixed pairs', async () => {
    const p = new FrankfurterProvider({ fetchImpl: fakeFetch(SERIES), minIntervalMs: 0 });
    const { data } = await p.getQuotes(['EUR-USD', 'NOT-A-PAIR']);
    expect(data).toHaveLength(1);
    expect(data[0]!.symbol).toBe('EUR-USD');
  });
});

describe('Binance vs FX routing boundary', () => {
  it('binance declines pure fiat/fiat pairs so the FX adapter can serve them', () => {
    const b = new BinanceProvider({ fetchImpl: fakeFetch({}) });
    expect(b.servesSymbol('CHF-JPY')).toBe(false);
    expect(b.servesSymbol('EUR-GBP')).toBe(false);
    expect(b.servesSymbol('EUR-USDT')).toBe(true); // stablecoin quote = crypto market
    expect(b.servesSymbol('BTC-EUR')).toBe(true);
  });
});
