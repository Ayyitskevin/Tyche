import { describe, it, expect } from 'vitest';
import { InsiderTransactionSchema } from './index';

describe('contracts: InsiderTransaction', () => {
  it('parses a full transaction and defaults the form to 4', () => {
    const t = InsiderTransactionSchema.parse({
      symbol: 'AAPL',
      owner: 'COOK TIMOTHY D',
      relationship: 'Chief Executive Officer',
      date: '2024-04-01',
      code: 'S',
      acquiredDisposed: 'D',
      shares: 100000,
      pricePerShare: 170.5,
      sharesOwnedFollowing: 3280000,
    });
    expect(t.form).toBe('4');
    expect(t.acquiredDisposed).toBe('D');
  });

  it('accepts null price / owned-after and rejects a bad acquiredDisposed and negative shares', () => {
    expect(
      InsiderTransactionSchema.parse({ symbol: 'X', owner: 'A', date: '2024-01-01', code: 'A', shares: 10, pricePerShare: null }).pricePerShare,
    ).toBeNull();
    expect(InsiderTransactionSchema.safeParse({ symbol: 'X', owner: 'A', date: '2024-01-01', code: 'S', shares: 10, acquiredDisposed: 'X' }).success).toBe(false);
    expect(InsiderTransactionSchema.safeParse({ symbol: 'X', owner: 'A', date: '2024-01-01', code: 'S', shares: -1 }).success).toBe(false);
  });
});
