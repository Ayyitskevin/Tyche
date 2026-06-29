import { describe, it, expect } from 'vitest';
import { formatCitation } from './provenance';
import { provenanceToCitation } from './ai';
import type { DataProvenance } from './provenance';

const prov: DataProvenance = {
  provider: 'mock',
  providerMode: 'mock',
  capability: 'quotes',
  retrievedAt: '2026-06-28T13:45:00.000Z',
  freshness: { asOf: '2026-06-28T13:45:00.000Z', tier: 'live' },
};

describe('formatCitation', () => {
  it('renders provider · capability · tier · as of <date>', () => {
    expect(formatCitation(prov)).toBe('mock · quotes · live · as of 2026-06-28');
  });

  it('omits missing parts and falls back to unknown provider', () => {
    expect(formatCitation({})).toBe('unknown');
    expect(formatCitation({ provider: 'yahoo', capability: 'quotes' })).toBe('yahoo · quotes');
  });

  it('reads asOf from either freshness.asOf or a flat asOf (AI citation shape)', () => {
    expect(formatCitation({ provider: 'sec', asOf: '2026-01-02T00:00:00.000Z' })).toBe('sec · as of 2026-01-02');
  });
});

describe('provenanceToCitation', () => {
  it('builds a citation with the canonical label and carried fields', () => {
    const c = provenanceToCitation(prov);
    expect(c.label).toBe('mock · quotes · live · as of 2026-06-28');
    expect(c.provider).toBe('mock');
    expect(c.capability).toBe('quotes');
    expect(c.asOf).toBe('2026-06-28T13:45:00.000Z');
    expect(c.sourceUrl).toBeUndefined();
  });

  it('carries sourceUrl when present', () => {
    const c = provenanceToCitation({ ...prov, sourceUrl: 'https://sec.gov/x' });
    expect(c.sourceUrl).toBe('https://sec.gov/x');
  });
});
