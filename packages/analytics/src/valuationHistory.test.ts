import { describe, it, expect } from 'vitest';
import type { Candle, FinancialStatement, FiscalPeriod, StatementType } from '@tyche/contracts';
import { valuationHistory } from './valuationHistory';

type Rec = Record<string, number | null>;

function mk(type: StatementType, fiscalDate: string, items: Rec, fiscalYear: number): FinancialStatement {
  return {
    symbol: 'AAPL',
    type,
    period: 'annual' as FiscalPeriod,
    fiscalDate,
    fiscalYear,
    currency: 'USD',
    lineItems: Object.entries(items).map(([key, value], i) => ({ key, label: key, value, order: i })),
  };
}

function year(fiscalDate: string, fy: number, income: Rec, balance: Rec): FinancialStatement[] {
  return [mk('income', fiscalDate, income, fy), mk('balance', fiscalDate, balance, fy)];
}

const c = (t: string, close: number): Candle => ({ t: `${t}T00:00:00.000Z`, o: close, h: close, l: close, c: close });

describe('valuationHistory', () => {
  const statements = [
    ...year('2024-12-31', 2024, { eps: 6, totalRevenue: 1200 }, { sharesOutstanding: 100 }),
    ...year('2023-12-31', 2023, { eps: 5, totalRevenue: 1000 }, { sharesOutstanding: 100 }),
  ];
  const candles = [c('2023-12-29', 100), c('2024-12-31', 150), c('2025-06-30', 180)];

  it('pairs reported EPS / sales-per-share with the price on each fiscal date', () => {
    const v = valuationHistory(statements, candles, 'AAPL');
    expect(v.points).toHaveLength(2);
    const p24 = v.points[0]!;
    expect(p24.fiscalDate).toBe('2024-12-31');
    expect(p24.price).toBe(150); // close on/before the fiscal date
    expect(p24.pe).toBeCloseTo(25, 6); // 150 / 6
    expect(p24.salesPerShare).toBeCloseTo(12, 6); // 1200 / 100
    expect(p24.ps).toBeCloseTo(12.5, 6); // 150 / 12
    expect(v.points[1]!.pe).toBeCloseTo(20, 6); // 100 / 5
  });

  it('computes current multiples off the latest close and most-recent reported EPS', () => {
    const v = valuationHistory(statements, candles, 'AAPL');
    expect(v.currentPrice).toBe(180); // latest close
    expect(v.currentPe).toBeCloseTo(30, 6); // 180 / 6
    expect(v.currentPs).toBeCloseTo(15, 6); // 180 / 12
  });

  it('reports the P/E and P/S bands over the historical points', () => {
    const v = valuationHistory(statements, candles, 'AAPL');
    expect(v.peBand).toEqual({ min: 20, avg: 22.5, max: 25 });
    expect(v.psBand).toEqual({ min: 10, avg: 11.25, max: 12.5 });
  });

  it('leaves P/E null (never negative) when earnings were zero or negative', () => {
    const loss = year('2022-12-31', 2022, { eps: -2, totalRevenue: 500 }, { sharesOutstanding: 100 });
    const v = valuationHistory(loss, [c('2022-12-31', 50)], 'AAPL');
    const p = v.points[0]!;
    expect(p.pe).toBeNull(); // eps ≤ 0 → not meaningful
    expect(p.ps).toBeCloseTo(10, 6); // 50 / (500/100) still defined
    expect(v.peBand.avg).toBeNull(); // no valid P/E to average
  });

  it('is empty-safe', () => {
    const v = valuationHistory([], [], 'ZZZ');
    expect(v.points).toEqual([]);
    expect(v.currentPrice).toBeNull();
    expect(v.currentPe).toBeNull();
    expect(v.peBand).toEqual({ min: null, avg: null, max: null });
  });
});
