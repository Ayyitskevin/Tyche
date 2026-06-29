import { describe, it, expect } from 'vitest';
import {
  EconomicSeriesSchema,
  EconomicObservationSchema,
  EconomicSeriesQuerySchema,
} from './economics';

const base = {
  seriesId: 'GDP',
  title: 'Gross Domestic Product',
  units: 'Billions of Dollars',
  frequency: 'Quarterly',
  observations: [
    { date: '2024-01-01', value: 27000.1 },
    { date: '2024-04-01', value: null },
    { date: '2024-07-01', value: 27500.4 },
  ],
};

describe('contracts: EconomicSeries', () => {
  it('accepts a well-formed series with a null observation', () => {
    expect(EconomicSeriesSchema.safeParse(base).success).toBe(true);
  });

  it('requires a non-empty seriesId', () => {
    expect(EconomicSeriesSchema.safeParse({ ...base, seriesId: '' }).success).toBe(false);
  });

  it('allows negative observation values (e.g. real rates, net exports)', () => {
    expect(EconomicObservationSchema.safeParse({ date: '2024-01-01', value: -1.5 }).success).toBe(true);
  });

  it('rejects non-finite observation values', () => {
    expect(EconomicObservationSchema.safeParse({ date: '2024-01-01', value: Infinity }).success).toBe(false);
  });

  it('bounds the query limit to a positive integer', () => {
    expect(EconomicSeriesQuerySchema.safeParse({ limit: 500 }).success).toBe(true);
    expect(EconomicSeriesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(EconomicSeriesQuerySchema.safeParse({ limit: 2.5 }).success).toBe(false);
  });
});
