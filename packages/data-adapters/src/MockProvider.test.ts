import { describe, it, expect } from 'vitest';
import { QuoteSchema, HistoricalSeriesSchema } from '@tyche/contracts';
import { MockProvider } from './MockProvider';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';
import { SEED_SYMBOLS } from './seed';

const fixedDate = new Date('2026-06-15T20:00:00.000Z');

describe('MockProvider conformance', () => {
  it('honors every declared capability with schema-valid envelopes', async () => {
    const provider = new MockProvider({ referenceDate: fixedDate });
    const report = await checkProviderConformance(provider);
    const failed = report.checks.filter((c) => !c.passed);
    expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);
    expect(report.ok).toBe(true);
  });
});

describe('MockProvider data', () => {
  const provider = new MockProvider({ referenceDate: fixedDate });

  it('serves quotes for every seed symbol', async () => {
    for (const symbol of SEED_SYMBOLS) {
      const { data, provenance } = await provider.getQuote(symbol);
      expect(QuoteSchema.safeParse(data).success).toBe(true);
      expect(data.symbol).toBe(symbol);
      expect(provenance.provider).toBe('mock');
      expect(provenance.freshness.asOf).toBeDefined();
    }
  });

  it('is deterministic across instances for the same reference date', async () => {
    const a = new MockProvider({ referenceDate: fixedDate });
    const b = new MockProvider({ referenceDate: fixedDate });
    const [qa, qb] = await Promise.all([a.getQuote('AAPL'), b.getQuote('AAPL')]);
    expect(qa.data.price).toBe(qb.data.price);
  });

  it('respects history range length and validates the series', async () => {
    const { data } = await provider.getHistory('MSFT', { range: '1mo', interval: '1d' });
    expect(HistoricalSeriesSchema.safeParse(data).success).toBe(true);
    expect(data.candles.length).toBeGreaterThan(10);
    expect(data.candles.length).toBeLessThanOrEqual(22);
    // OHLC invariants
    for (const c of data.candles) {
      expect(c.h).toBeGreaterThanOrEqual(c.l);
      expect(c.h).toBeGreaterThanOrEqual(c.o);
      expect(c.h).toBeGreaterThanOrEqual(c.c);
    }
  });

  it('returns empty (not an error) for inapplicable capabilities on crypto', async () => {
    const { data } = await provider.getFinancials('BTC-USD');
    expect(data).toEqual([]);
  });

  it('synthesizes data for unknown symbols so DES never crashes', async () => {
    const { data } = await provider.getInstrument('NFLX');
    expect(data.symbol).toBe('NFLX');
    expect(data.name.length).toBeGreaterThan(0);
  });
});

describe('ProviderRegistry', () => {
  it('always provides mock and resolves capabilities', () => {
    const registry = createProviderRegistry({ providers: ['yahoo'] });
    expect(registry.get('mock')).toBeDefined();
    expect(registry.get('yahoo')).toBeDefined();
    // yahoo stub declares nothing, so quotes resolve to mock
    expect(registry.forCapability('quotes')?.descriptor.name).toBe('mock');
    expect(registry.aggregateCapabilities().quotes).toBe(true);
    expect(registry.aggregateCapabilities().futures).toBe(false);
    expect(registry.missingCapabilities(['quotes', 'futures'])).toEqual(['futures']);
  });
});
