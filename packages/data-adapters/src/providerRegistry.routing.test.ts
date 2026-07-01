import { describe, it, expect } from 'vitest';
import { FundingRateSchema } from '@tyche/contracts';
import { MockProvider } from './MockProvider';
import { BinanceProvider } from './BinanceProvider';
import { ProviderRegistry } from './providerRegistry';

describe('symbol-aware capability routing', () => {
  const registry = new ProviderRegistry();
  registry.register(new BinanceProvider({ fetchImpl: () => Promise.reject(new Error('offline')) }));
  registry.register(new MockProvider());

  it('routes crypto pairs to the venue adapter and everything else to mock', () => {
    expect(registry.forCapability('quotes', 'BTC-USDT')?.descriptor.name).toBe('binance');
    expect(registry.forCapability('quotes', 'AAPL')?.descriptor.name).toBe('mock');
    // USD-quoted mock pairs stay with mock — no silent USD→USDT mapping.
    expect(registry.forCapability('quotes', 'BTC-USD')?.descriptor.name).toBe('mock');
    // Without a symbol, order still decides (backward compatible).
    expect(registry.forCapability('quotes')?.descriptor.name).toBe('binance');
  });

  it('aggregates the new fundingRates capability', () => {
    expect(registry.aggregateCapabilities().fundingRates).toBe(true);
  });
});

describe('mock funding board', () => {
  const mock = new MockProvider({ referenceDate: new Date('2026-07-01T12:00:00Z') });

  it('serves a deterministic, schema-valid default board from the crypto seeds', async () => {
    const first = await mock.getFundingRates();
    const second = await mock.getFundingRates();
    expect(first.data.map((r) => r.symbol).sort()).toEqual(['BTC-USD', 'ETH-USD']);
    for (const row of first.data) {
      expect(FundingRateSchema.parse(row)).toBeTruthy();
      expect(row.annualizedPct).toBeCloseTo(Math.round(row.rate * 3 * 365 * 100 * 100) / 100, 6);
      expect(row.venue).toBe('mock');
    }
    expect(second.data).toEqual(first.data);
  });

  it('synthesizes rates for explicitly requested pairs', async () => {
    const { data } = await mock.getFundingRates(['DOGE-USDT']);
    expect(data).toHaveLength(1);
    expect(data[0]!.symbol).toBe('DOGE-USDT');
    expect(FundingRateSchema.parse(data[0])).toBeTruthy();
  });
});
