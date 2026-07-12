import { describe, it, expect } from 'vitest';
import { EconomicReleaseSchema, EconomicReleaseQuerySchema } from './economicReleases';

describe('EconomicReleaseSchema', () => {
  it('accepts a minimal scheduled release (name + date)', () => {
    expect(EconomicReleaseSchema.safeParse({ name: 'Consumer Price Index', date: '2025-06-11' }).success).toBe(true);
  });
  it('accepts a full released row with actual/previous/consensus', () => {
    const r = EconomicReleaseSchema.safeParse({
      releaseId: '10',
      seriesId: 'CPIAUCSL',
      name: 'Consumer Price Index',
      date: '2025-06-11',
      period: 'May 2025',
      importance: 'high',
      unit: '% YoY',
      actual: 3.1,
      previous: 3.0,
      consensus: 3.2,
    });
    expect(r.success).toBe(true);
  });
  it('allows null actual/consensus (unreleased / no estimate)', () => {
    expect(
      EconomicReleaseSchema.safeParse({ name: 'GDP', date: '2025-07-30', actual: null, consensus: null }).success,
    ).toBe(true);
  });
  it('rejects an empty name and a non-finite value', () => {
    expect(EconomicReleaseSchema.safeParse({ name: '', date: '2025-06-11' }).success).toBe(false);
    expect(EconomicReleaseSchema.safeParse({ name: 'CPI', date: '2025-06-11', actual: Infinity }).success).toBe(false);
  });
  it('rejects an out-of-range importance', () => {
    expect(EconomicReleaseSchema.safeParse({ name: 'CPI', date: '2025-06-11', importance: 'critical' }).success).toBe(
      false,
    );
  });
});

describe('EconomicReleaseQuerySchema', () => {
  it('accepts an empty query and a windowed/importance query', () => {
    expect(EconomicReleaseQuerySchema.safeParse({}).success).toBe(true);
    expect(
      EconomicReleaseQuerySchema.safeParse({ from: '2025-06-01', to: '2025-06-30', importance: 'high', limit: 50 })
        .success,
    ).toBe(true);
  });
});
