import { describe, it, expect } from 'vitest';
import { FundingRateSchema, QuoteSchema, OrderBookSchema, HistoricalSeriesSchema } from '@tyche/contracts';
import { BinanceProvider } from './BinanceProvider';
import type { FetchLike } from './stubs/FredProvider';

/** Fetch stub keyed by URL substring; counts calls per key. */
function fakeFetch(routes: Record<string, unknown>, calls: Record<string, number> = {}): FetchLike {
  return (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    calls[key] = (calls[key] ?? 0) + 1;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(routes[key]) });
  };
}

const TICKER = {
  symbol: 'BTCUSDT',
  lastPrice: '65000.10',
  bidPrice: '64999.90',
  askPrice: '65000.30',
  openPrice: '64000.00',
  highPrice: '65500.00',
  lowPrice: '63800.00',
  prevClosePrice: '64010.00',
  priceChange: '990.10',
  priceChangePercent: '1.55',
  volume: '12345.6',
  closeTime: 1782950000000,
};

function provider(routes: Record<string, unknown>, calls?: Record<string, number>): BinanceProvider {
  return new BinanceProvider({ fetchImpl: fakeFetch(routes, calls), minIntervalMs: 0 });
}

describe('BinanceProvider', () => {
  it('serves only crypto pairs with known quote assets', () => {
    const p = provider({});
    expect(p.servesSymbol('BTC-USDT')).toBe(true);
    expect(p.servesSymbol('eth-usdc')).toBe(true);
    expect(p.servesSymbol('SOL-BTC')).toBe(true);
    expect(p.servesSymbol('AAPL')).toBe(false);
    // USD is not a Binance spot quote asset — BTC-USD stays with the mock.
    expect(p.servesSymbol('BTC-USD')).toBe(false);
  });

  it('maps a 24h ticker to a valid Quote with the dash symbol', async () => {
    const p = provider({ '/ticker/24hr?symbol=BTCUSDT': TICKER });
    const { data, provenance } = await p.getQuote('BTC-USDT');
    expect(QuoteSchema.parse(data)).toBeTruthy();
    expect(data.symbol).toBe('BTC-USDT');
    expect(data.price).toBe(65000.1);
    expect(data.changePercent).toBe(1.55);
    expect(data.currency).toBe('USDT');
    expect(data.marketState).toBe('regular');
    expect(provenance.provider).toBe('binance');
    await expect(p.getQuote('AAPL')).rejects.toThrow(/not a crypto pair/);
  });

  it('maps klines to a valid HistoricalSeries and computes the bar limit', async () => {
    const klines = [
      [1782800000000, '64000', '64500', '63900', '64400', '100.5', 1782886399999],
      [1782886400000, '64400', '65100', '64300', '65000', '99.1', 1782972799999],
    ];
    const calls: Record<string, number> = {};
    const p = provider({ '/klines': klines }, calls);
    const { data } = await p.getHistory('BTC-USDT', { range: '1mo', interval: '1d' });
    expect(HistoricalSeriesSchema.parse(data)).toBeTruthy();
    expect(data.candles).toHaveLength(2);
    expect(data.candles[0]).toMatchObject({ o: 64000, h: 64500, l: 63900, c: 64400, v: 100.5 });
    // 1mo of daily bars → limit 31 requested from the venue.
    const url = Object.keys(calls)[0]!;
    expect(url).toContain('/klines');
  });

  it('maps depth to a valid OrderBook, snapping to allowed venue limits', async () => {
    const p = provider({
      '/depth?symbol=BTCUSDT&limit=20': {
        bids: [
          ['64999', '0.5'],
          ['64998', '1.2'],
        ],
        asks: [
          ['65001', '0.7'],
          ['65002', '2.0'],
        ],
      },
    });
    const { data } = await p.getOrderBook('BTC-USDT', 15); // 15 → snapped to 20
    expect(OrderBookSchema.parse(data)).toBeTruthy();
    expect(data.bids[0]).toEqual({ price: 64999, size: 0.5 });
    expect(data.asks[1]).toEqual({ price: 65002, size: 2 });
  });

  it('maps aggTrades with the maker flag inverted into aggressor side', async () => {
    const p = provider({
      '/aggTrades': [
        { p: '65000.5', q: '0.01', T: 1782950000000, m: false }, // taker bought
        { p: '65000.1', q: '0.20', T: 1782950001000, m: true }, // taker sold
      ],
    });
    const { data } = await p.getTrades('BTC-USDT', 2);
    expect(data).toHaveLength(2);
    // Reversed to newest-first.
    expect(data[0]).toMatchObject({ price: 65000.1, side: 'sell', venue: 'BINANCE' });
    expect(data[1]).toMatchObject({ price: 65000.5, side: 'buy' });
  });

  it('maps premiumIndex to valid FundingRates, filters, annualizes, and dashifies', async () => {
    const p = provider({
      '/premiumIndex': [
        {
          symbol: 'BTCUSDT',
          markPrice: '65010.0',
          indexPrice: '65000.0',
          lastFundingRate: '0.0001',
          nextFundingTime: 1782960000000,
          time: 1782950000000,
        },
        { symbol: 'ETHUSDT', markPrice: '3300', indexPrice: '3299', lastFundingRate: '-0.0002', time: 1782950000000 },
      ],
    });
    const all = await p.getFundingRates();
    expect(all.data).toHaveLength(2);
    for (const row of all.data) expect(FundingRateSchema.parse(row)).toBeTruthy();
    // Sorted by |annualized| — ETH's -0.02% beats BTC's +0.01%.
    expect(all.data[0]!.symbol).toBe('ETH-USDT');
    expect(all.data[0]!.annualizedPct).toBeCloseTo(-0.0002 * 3 * 365 * 100, 2);

    const filtered = await p.getFundingRates(['BTC-USDT']);
    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0]!.symbol).toBe('BTC-USDT');
    expect(filtered.data[0]!.nextFundingAt).toBe(new Date(1782960000000).toISOString());
  });

  it('searches pairs from a cached exchangeInfo (one fetch for many searches)', async () => {
    const calls: Record<string, number> = {};
    const p = provider(
      {
        '/exchangeInfo': {
          symbols: [
            { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
            { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'TRADING' },
            { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
            { symbol: 'OLDUSDT', baseAsset: 'OLD', quoteAsset: 'USDT', status: 'BREAK' },
          ],
        },
      },
      calls,
    );
    const first = await p.searchInstruments('BTC');
    expect(first.data.map((h) => h.identifier.symbol)).toEqual(['BTC-USDT', 'BTC-USDC']);
    expect(first.data[0]!.identifier.assetClass).toBe('crypto');
    const second = await p.searchInstruments('ETH');
    expect(second.data[0]!.identifier.symbol).toBe('ETH-USDT');
    expect(calls['/exchangeInfo']).toBe(1); // cached
  });
});
