import { describe, it, expect } from 'vitest';
import { costOfEquity, afterTaxCostOfDebt, wacc } from './capm';

describe('costOfEquity', () => {
  it('is r_f + β·ERP', () => {
    expect(costOfEquity({ riskFreeRate: 0.04, beta: 1.2, equityRiskPremium: 0.05 })).toBeCloseTo(0.1, 6);
    // β = 0 → cost of equity collapses to the risk-free rate
    expect(costOfEquity({ riskFreeRate: 0.04, beta: 0, equityRiskPremium: 0.05 })).toBeCloseTo(0.04, 6);
  });
});

describe('afterTaxCostOfDebt', () => {
  it('applies the tax shield', () => {
    expect(afterTaxCostOfDebt(0.05, 0.21)).toBeCloseTo(0.0395, 6);
    expect(afterTaxCostOfDebt(0.05, 0)).toBeCloseTo(0.05, 6);
  });
});

describe('wacc', () => {
  it('value-weights the taxed debt and equity legs', () => {
    const r = wacc({
      costOfEquity: 0.1,
      pretaxCostOfDebt: 0.05,
      taxRate: 0.21,
      equityValue: 800,
      debtValue: 200,
    });
    expect(r.weightEquity).toBeCloseTo(0.8, 6);
    expect(r.weightDebt).toBeCloseTo(0.2, 6);
    expect(r.afterTaxCostOfDebt).toBeCloseTo(0.0395, 6);
    // 0.8·0.10 + 0.2·0.0395 = 0.0879
    expect(r.wacc).toBeCloseTo(0.0879, 6);
  });

  it('weights are invariant to the capital-value units (share, not level)', () => {
    const small = wacc({ costOfEquity: 0.1, pretaxCostOfDebt: 0.05, taxRate: 0.21, equityValue: 8, debtValue: 2 });
    expect(small.wacc).toBeCloseTo(0.0879, 6);
  });

  it('is all-debt cost when there is no equity', () => {
    const r = wacc({ costOfEquity: 0.1, pretaxCostOfDebt: 0.05, taxRate: 0.21, equityValue: 0, debtValue: 100 });
    expect(r.weightDebt).toBeCloseTo(1, 6);
    expect(r.wacc).toBeCloseTo(0.0395, 6);
  });

  it('returns nulls when there is no capital', () => {
    const r = wacc({ costOfEquity: 0.1, pretaxCostOfDebt: 0.05, taxRate: 0.21, equityValue: 0, debtValue: 0 });
    expect(r.weightEquity).toBeNull();
    expect(r.weightDebt).toBeNull();
    expect(r.wacc).toBeNull();
  });
});
