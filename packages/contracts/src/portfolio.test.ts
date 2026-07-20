import { describe, it, expect } from 'vitest';
import { PortfolioRiskSchema, PortfolioRiskStatsSchema, WatchlistSchema } from './index';

const base = {
  id: 'wl_1',
  name: 'Megacaps',
  symbols: ['AAPL', 'MSFT'],
  createdAt: '2026-06-28T13:45:00.000Z',
  updatedAt: '2026-06-28T13:45:00.000Z',
};

describe('contracts: PortfolioRiskStats nullable skill ratios', () => {
  const finitePath = {
    annualizedReturn: 0.1,
    annualizedVolatility: 0.2,
    maxDrawdown: -0.15,
    valueAtRisk: -0.03,
  };

  it('accepts null Sharpe/Sortino/Calmar/IR/beta (unavailable ≠ 0)', () => {
    const parsed = PortfolioRiskStatsSchema.safeParse({
      ...finitePath,
      sharpe: null,
      sortino: null,
      calmar: null,
      beta: null,
      trackingError: null,
      informationRatio: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sharpe).toBeNull();
      expect(parsed.data.sortino).toBeNull();
      expect(parsed.data.calmar).toBeNull();
      expect(parsed.data.informationRatio).toBeNull();
    }
  });

  it('accepts finite skill ratios when defined', () => {
    const parsed = PortfolioRiskStatsSchema.safeParse({
      ...finitePath,
      sharpe: 1.2,
      sortino: 1.5,
      calmar: 0.8,
      beta: 1.0,
      trackingError: 0.05,
      informationRatio: 0.3,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects non-finite skill ratios (NaN must not pass the contract)', () => {
    expect(
      PortfolioRiskStatsSchema.safeParse({
        ...finitePath,
        sharpe: Number.NaN,
        sortino: 1,
        calmar: 1,
        beta: null,
        trackingError: null,
        informationRatio: null,
      }).success,
    ).toBe(false);
  });

  it('round-trips a full PortfolioRisk envelope shape with null ratios', () => {
    const parsed = PortfolioRiskSchema.safeParse({
      portfolioId: 'pf_1',
      benchmark: 'SPY',
      periodsPerYear: 252,
      observations: 0,
      coverage: { priced: 0, total: 0 },
      stats: {
        ...finitePath,
        annualizedReturn: 0,
        annualizedVolatility: 0,
        maxDrawdown: 0,
        valueAtRisk: 0,
        sharpe: null,
        sortino: null,
        calmar: null,
        beta: null,
        trackingError: null,
        informationRatio: null,
      },
      holdings: [],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('contracts: Watchlist order', () => {
  it('round-trips an explicit order', () => {
    const parsed = WatchlistSchema.parse({ ...base, order: 2 });
    expect(parsed.order).toBe(2);
  });

  it('parses a legacy list with no order (no migration needed)', () => {
    const parsed = WatchlistSchema.parse(base);
    expect(parsed.order).toBeUndefined();
    expect(parsed.symbols).toEqual(['AAPL', 'MSFT']);
  });

  it('defaults symbols to an empty array', () => {
    const parsed = WatchlistSchema.parse({
      id: 'wl_2',
      name: 'Empty',
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    });
    expect(parsed.symbols).toEqual([]);
  });

  it('rejects a non-numeric order', () => {
    const result = WatchlistSchema.safeParse({ ...base, order: 'first' });
    expect(result.success).toBe(false);
  });
});
