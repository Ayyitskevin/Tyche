import { describe, it, expect } from 'vitest';
import type { FinancialStatement, StatementType } from '@tyche/contracts';
import {
  bundlePeriods,
  financialRatios,
  growth,
  lineItem,
  ratio,
} from './fundamentals';

/** Build a minimal statement with the given line items (key → value). */
function stmt(
  type: StatementType,
  fiscalDate: string,
  items: Record<string, number | null>,
  extra: Partial<FinancialStatement> = {},
): FinancialStatement {
  return {
    symbol: 'TEST',
    type,
    period: 'annual',
    fiscalDate,
    currency: 'USD',
    lineItems: Object.entries(items).map(([key, value]) => ({ key, label: key, value })),
    ...extra,
  };
}

describe('lineItem & ratio', () => {
  it('reads a finite value by key and returns null for missing/non-finite/absent statement', () => {
    const income = stmt('income', '2025-12-31', { totalRevenue: 100, netIncome: null });
    expect(lineItem(income, 'totalRevenue')).toBe(100);
    expect(lineItem(income, 'netIncome')).toBeNull(); // present but null
    expect(lineItem(income, 'grossProfit')).toBeNull(); // absent key
    expect(lineItem(undefined, 'totalRevenue')).toBeNull(); // no statement
  });

  it('is null-safe on missing operands and zero denominators', () => {
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(50, 0)).toBeNull(); // divide by zero
    expect(ratio(null, 100)).toBeNull();
    expect(ratio(50, null)).toBeNull();
    expect(ratio(-10, 100)).toBe(-0.1); // negatives pass through
  });
});

describe('bundlePeriods', () => {
  it('groups the three statement types by fiscal date, newest-first, carrying fiscal labels', () => {
    const statements: FinancialStatement[] = [
      stmt('income', '2023-12-31', { totalRevenue: 80 }, { fiscalYear: 2023 }),
      stmt('income', '2025-12-31', { totalRevenue: 120 }, { fiscalYear: 2025 }),
      stmt('balance', '2025-12-31', { totalAssets: 300 }, { fiscalYear: 2025 }),
      stmt('income', '2024-12-31', { totalRevenue: 100 }, { fiscalYear: 2024 }),
      stmt('cash_flow', '2025-12-31', { freeCashFlow: 25 }, { fiscalYear: 2025 }),
    ];
    const bundles = bundlePeriods(statements);
    expect(bundles.map((b) => b.fiscalDate)).toEqual(['2025-12-31', '2024-12-31', '2023-12-31']);
    const latest = bundles[0]!;
    expect(latest.fiscalYear).toBe(2025);
    expect(lineItem(latest.income, 'totalRevenue')).toBe(120);
    expect(lineItem(latest.balance, 'totalAssets')).toBe(300);
    expect(lineItem(latest.cashFlow, 'freeCashFlow')).toBe(25);
    // A period with only an income statement has undefined balance/cashFlow.
    expect(bundles[1]!.balance).toBeUndefined();
  });

  it('returns [] for no statements', () => {
    expect(bundlePeriods([])).toEqual([]);
  });
});

describe('financialRatios', () => {
  it('computes margins, returns and leverage from a full period', () => {
    const bundles = bundlePeriods([
      stmt('income', '2025-12-31', {
        totalRevenue: 1000,
        grossProfit: 400,
        operatingIncome: 250,
        netIncome: 200,
      }),
      stmt('balance', '2025-12-31', { totalAssets: 2000, totalEquity: 800, totalDebt: 400 }),
      stmt('cash_flow', '2025-12-31', { freeCashFlow: 150 }),
    ]);
    const r = financialRatios(bundles[0]!);
    expect(r.grossMargin).toBeCloseTo(0.4, 12);
    expect(r.operatingMargin).toBeCloseTo(0.25, 12);
    expect(r.netMargin).toBeCloseTo(0.2, 12);
    expect(r.fcfMargin).toBeCloseTo(0.15, 12);
    expect(r.returnOnAssets).toBeCloseTo(0.1, 12);
    expect(r.returnOnEquity).toBeCloseTo(0.25, 12);
    expect(r.debtToEquity).toBeCloseTo(0.5, 12);
    expect(r.debtToAssets).toBeCloseTo(0.2, 12);
    expect(r.assetTurnover).toBeCloseTo(0.5, 12);
  });

  it('yields null ratios for the pieces a sparse period cannot support', () => {
    // Income only: margins that need the balance/cash-flow sheet are null.
    const bundles = bundlePeriods([
      stmt('income', '2025-12-31', { totalRevenue: 1000, netIncome: 200 }),
    ]);
    const r = financialRatios(bundles[0]!);
    expect(r.netMargin).toBeCloseTo(0.2, 12);
    expect(r.grossMargin).toBeNull(); // no grossProfit line
    expect(r.returnOnEquity).toBeNull(); // no balance sheet
    expect(r.fcfMargin).toBeNull(); // no cash-flow sheet
  });
});

describe('growth', () => {
  it('computes period-over-period growth against |prior|', () => {
    expect(growth(120, 100)).toBeCloseTo(0.2, 12);
    expect(growth(80, 100)).toBeCloseTo(-0.2, 12);
    // Negative base: sign points in the direction of change.
    expect(growth(-50, -100)).toBeCloseTo(0.5, 12); // loss shrank → improvement
    expect(growth(100, 0)).toBeNull(); // zero base
    expect(growth(null, 100)).toBeNull();
    expect(growth(120, null)).toBeNull();
  });
});
