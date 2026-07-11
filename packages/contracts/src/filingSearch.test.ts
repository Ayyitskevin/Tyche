import { describe, it, expect } from 'vitest';
import { FilingSearchHitSchema, FilingSearchQuerySchema } from './index';

describe('contracts: FilingSearchQuery', () => {
  it('parses a minimal and a full query', () => {
    expect(FilingSearchQuerySchema.parse({ query: 'climate risk' }).query).toBe('climate risk');
    const full = FilingSearchQuerySchema.parse({
      query: 'share repurchase',
      forms: ['10-K', '8-K'],
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      limit: 25,
    });
    expect(full.forms).toEqual(['10-K', '8-K']);
    expect(full.limit).toBe(25);
  });

  it('rejects an empty query, an empty date, and an over-large limit', () => {
    expect(FilingSearchQuerySchema.safeParse({ query: '' }).success).toBe(false);
    expect(FilingSearchQuerySchema.safeParse({ query: 'x', dateFrom: '' }).success).toBe(false);
    expect(FilingSearchQuerySchema.safeParse({ query: 'x', limit: 500 }).success).toBe(false);
  });
});

describe('contracts: FilingSearchHit', () => {
  it('parses a hit and rejects a non-url link', () => {
    const hit = FilingSearchHitSchema.parse({
      entity: 'Apple Inc. (AAPL)',
      cik: '0000320193',
      form: '10-K',
      filedAt: '2024-11-01',
      url: 'https://www.sec.gov/Archives/edgar/data/320193/x.htm',
      accessionNumber: '0000320193-24-000123',
    });
    expect(hit.form).toBe('10-K');
    expect(FilingSearchHitSchema.safeParse({ entity: 'X', form: '10-K', filedAt: '2024-11-01', url: 'not-a-url' }).success).toBe(false);
  });
});
