import { describe, it, expect } from 'vitest';
import type { FinancialStatement, FiscalPeriod, StatementType } from '@tyche/contracts';
import { altmanZScore, piotroskiFScore, fundamentalScorecard } from './scoring';
import { bundlePeriods } from './fundamentals';

type Rec = Record<string, number | null>;

function mk(type: StatementType, fiscalDate: string, items: Rec, period: FiscalPeriod): FinancialStatement {
  return {
    symbol: 'AAPL',
    type,
    period,
    fiscalDate,
    currency: 'USD',
    lineItems: Object.entries(items).map(([key, value], i) => ({ key, label: key, value, order: i })),
  };
}

function period(fiscalDate: string, income: Rec, balance: Rec, cash: Rec, p: FiscalPeriod = 'annual'): FinancialStatement[] {
  return [mk('income', fiscalDate, income, p), mk('balance', fiscalDate, balance, p), mk('cash_flow', fiscalDate, cash, p)];
}

const one = (fiscalDate: string, income: Rec, balance: Rec, cash: Rec) => bundlePeriods(period(fiscalDate, income, balance, cash))[0];

describe('altmanZScore', () => {
  it('computes the Z′ composite and distress zone from a full balance/income set', () => {
    const b = one(
      '2024-12-31',
      { totalRevenue: 1200, operatingIncome: 150 },
      { totalAssets: 1000, currentAssets: 500, currentLiabilities: 200, retainedEarnings: 400, totalLiabilities: 400, totalEquity: 600 },
      {},
    );
    const z = altmanZScore(b);
    // 0.717·0.3 + 0.847·0.4 + 3.107·0.15 + 0.42·1.5 + 0.998·1.2 = 2.85
    expect(z.complete).toBe(true);
    expect(z.score).toBeCloseTo(2.85, 2);
    expect(z.zone).toBe('grey'); // 1.23 ≤ 2.85 ≤ 2.9
    expect(z.components.find((c) => c.key === 'x4')!.value).toBeCloseTo(1.5, 5);
  });

  it('reports an incomplete score (null, never partial) when a component input is missing', () => {
    const b = one(
      '2024-12-31',
      { totalRevenue: 1200, operatingIncome: 150 },
      { totalAssets: 1000, currentAssets: 500, currentLiabilities: 200, totalLiabilities: 400, totalEquity: 600 }, // no retainedEarnings
      {},
    );
    const z = altmanZScore(b);
    expect(z.complete).toBe(false);
    expect(z.score).toBeNull();
    expect(z.zone).toBeNull();
    expect(z.components.find((c) => c.key === 'x2')!.value).toBeNull();
  });

  it('is safe on an undefined bundle', () => {
    const z = altmanZScore(undefined);
    expect(z.complete).toBe(false);
    expect(z.score).toBeNull();
  });
});

describe('piotroskiFScore', () => {
  const prior = one(
    '2023-12-31',
    { totalRevenue: 1000, grossProfit: 400, netIncome: 50 },
    { totalAssets: 1000, currentAssets: 500, currentLiabilities: 250, totalDebt: 400, sharesOutstanding: 100 },
    { operatingCashFlow: 80 },
  );
  const cur = one(
    '2024-12-31',
    { totalRevenue: 1100, grossProfit: 500, netIncome: 100 },
    { totalAssets: 1000, currentAssets: 600, currentLiabilities: 250, totalDebt: 300, sharesOutstanding: 100 },
    { operatingCashFlow: 150 },
  );

  it('awards all nine points to an unambiguously improving company', () => {
    const f = piotroskiFScore(cur, prior);
    expect(f.complete).toBe(true);
    expect(f.evaluable).toBe(9);
    expect(f.score).toBe(9);
    expect(f.band).toBe('strong');
  });

  it('marks YoY signals not-evaluable (null) when there is no prior period', () => {
    const f = piotroskiFScore(cur, undefined);
    expect(f.evaluable).toBe(3); // only the three current-only signals
    expect(f.complete).toBe(false);
    expect(f.band).toBeNull();
    expect(f.signals.find((s) => s.key === 'roaRising')!.pass).toBeNull();
    expect(f.signals.find((s) => s.key === 'roaPositive')!.pass).toBe(true);
  });

  it('scores the no-dilution signal false (not null) when shares increased', () => {
    const diluted = one(
      '2024-12-31',
      { totalRevenue: 1100, grossProfit: 500, netIncome: 100 },
      { totalAssets: 1000, currentAssets: 600, currentLiabilities: 250, totalDebt: 300, sharesOutstanding: 130 },
      { operatingCashFlow: 150 },
    );
    const f = piotroskiFScore(diluted, prior);
    expect(f.signals.find((s) => s.key === 'noDilution')!.pass).toBe(false);
    expect(f.complete).toBe(true);
    expect(f.score).toBe(8); // one fewer than the all-pass case
  });
});

describe('fundamentalScorecard', () => {
  it('uses the two most recent ANNUAL periods and ignores quarterly noise', () => {
    const statements = [
      ...period('2024-12-31', { totalRevenue: 1100, grossProfit: 500, netIncome: 100, operatingIncome: 150 }, { totalAssets: 1000, currentAssets: 600, currentLiabilities: 250, totalDebt: 300, retainedEarnings: 400, totalLiabilities: 400, totalEquity: 600, sharesOutstanding: 100 }, { operatingCashFlow: 150 }),
      ...period('2023-12-31', { totalRevenue: 1000, grossProfit: 400, netIncome: 50, operatingIncome: 120 }, { totalAssets: 1000, currentAssets: 500, currentLiabilities: 250, totalDebt: 400, retainedEarnings: 300, totalLiabilities: 450, totalEquity: 550, sharesOutstanding: 100 }, { operatingCashFlow: 80 }),
      ...period('2024-09-30', { totalRevenue: 300 }, { totalAssets: 900 }, {}, 'quarterly'), // must be ignored
    ];
    const sc = fundamentalScorecard(statements, 'AAPL');
    expect(sc.fiscalDate).toBe('2024-12-31');
    expect(sc.priorFiscalDate).toBe('2023-12-31'); // NOT the 2024-09-30 quarterly
    expect(sc.insufficientHistory).toBe(false);
    expect(sc.altmanZ.complete).toBe(true);
    expect(sc.piotroskiF.complete).toBe(true);
  });

  it('is empty-safe and flags insufficient history', () => {
    const sc = fundamentalScorecard([], 'ZZZ');
    expect(sc.fiscalDate).toBeNull();
    expect(sc.insufficientHistory).toBe(true);
    expect(sc.altmanZ.score).toBeNull();
    expect(sc.piotroskiF.evaluable).toBe(0);
  });
});
