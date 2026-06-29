import { describe, it, expect } from 'vitest';
import {
  QuoteSchema,
  WorkspaceSchema,
  ProviderCapabilitiesSchema,
  NO_CAPABILITIES,
  envelope,
  Schemas,
  PROVIDER_CAPABILITY_KEYS,
  WORKSPACE_SCHEMA_VERSION,
} from './index';

describe('contracts: Quote', () => {
  it('accepts a well-formed quote', () => {
    const result = QuoteSchema.safeParse({
      symbol: 'AAPL',
      price: 195.12,
      change: 1.2,
      changePercent: 0.62,
      timestamp: '2026-06-28T13:45:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a quote missing the timestamp', () => {
    const result = QuoteSchema.safeParse({ symbol: 'AAPL', price: 1 });
    expect(result.success).toBe(false);
  });
});

describe('contracts: envelope', () => {
  it('wraps data with provenance', () => {
    const schema = envelope(QuoteSchema);
    const parsed = schema.safeParse({
      data: { symbol: 'AAPL', price: 1, timestamp: '2026-06-28T13:45:00.000Z' },
      provenance: {
        provider: 'mock',
        providerMode: 'mock',
        capability: 'quotes',
        retrievedAt: '2026-06-28T13:45:00.000Z',
        freshness: { asOf: '2026-06-28T13:45:00.000Z', tier: 'mock' },
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('contracts: provider capabilities', () => {
  it('NO_CAPABILITIES has every capability set to false', () => {
    const parsed = ProviderCapabilitiesSchema.parse(NO_CAPABILITIES);
    for (const key of PROVIDER_CAPABILITY_KEYS) {
      expect(parsed[key]).toBe(false);
    }
  });

  it('the keys array and the object schema stay in sync (both directions)', () => {
    const schemaKeys = Object.keys(ProviderCapabilitiesSchema.shape).sort();
    expect(schemaKeys).toEqual([...PROVIDER_CAPABILITY_KEYS].sort());
  });
});

describe('contracts: workspace defaults', () => {
  it('applies version + grid defaults', () => {
    const ws = WorkspaceSchema.parse({
      id: 'ws_1',
      name: 'Default',
      createdAt: '2026-06-28T13:45:00.000Z',
      updatedAt: '2026-06-28T13:45:00.000Z',
    });
    expect(ws.version).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(ws.cols).toBe(12);
    expect(ws.panels).toEqual([]);
    expect(ws.activeInstrument).toBeNull();
  });
});

describe('contracts: registry', () => {
  it('exposes the full domain surface', () => {
    expect(Object.keys(Schemas).length).toBeGreaterThan(30);
    expect(Schemas.Quote).toBe(QuoteSchema);
  });
});
