import { describe, it, expect } from 'vitest';
import {
  InstitutionalHoldingSchema,
  InstitutionalPortfolioSchema,
  InstitutionalHoldingsQuerySchema,
} from './institutional';

const HOLDING = { issuer: 'APPLE INC', cusip: '037833100', value: 1000, shares: 10, weightPercent: 5 };

describe('InstitutionalHoldingSchema', () => {
  it('accepts a minimal holding', () => {
    expect(InstitutionalHoldingSchema.safeParse(HOLDING).success).toBe(true);
  });
  it('accepts a full holding with class, ticker and option overlay', () => {
    expect(
      InstitutionalHoldingSchema.safeParse({
        ...HOLDING,
        ticker: 'AAPL',
        class: 'COM',
        sharesType: 'SH',
        putCall: 'Put',
      }).success,
    ).toBe(true);
  });
  it('rejects a negative value and a bad sharesType', () => {
    expect(InstitutionalHoldingSchema.safeParse({ ...HOLDING, value: -1 }).success).toBe(false);
    expect(InstitutionalHoldingSchema.safeParse({ ...HOLDING, sharesType: 'XX' }).success).toBe(false);
  });
});

describe('InstitutionalPortfolioSchema', () => {
  it('accepts a portfolio snapshot', () => {
    expect(
      InstitutionalPortfolioSchema.safeParse({
        manager: 'Berkshire Hathaway',
        cik: '0001067983',
        reportDate: '2024-03-31',
        filedAt: '2024-05-15',
        totalValue: 1000,
        positionCount: 1,
        holdings: [HOLDING],
      }).success,
    ).toBe(true);
  });
  it('requires manager, cik, totalValue, positionCount and holdings', () => {
    expect(InstitutionalPortfolioSchema.safeParse({ manager: 'X' }).success).toBe(false);
  });
});

describe('InstitutionalHoldingsQuerySchema', () => {
  it('accepts a manager query with an optional limit', () => {
    expect(InstitutionalHoldingsQuerySchema.safeParse({ manager: 'BERKSHIRE' }).success).toBe(true);
    expect(InstitutionalHoldingsQuerySchema.safeParse({ manager: '1067983', limit: 50 }).success).toBe(true);
  });
  it('rejects a limit over 200 or below 1', () => {
    expect(InstitutionalHoldingsQuerySchema.safeParse({ manager: 'X', limit: 500 }).success).toBe(false);
    expect(InstitutionalHoldingsQuerySchema.safeParse({ manager: 'X', limit: 0 }).success).toBe(false);
  });
});
