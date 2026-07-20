import { describe, it, expect } from 'vitest';
import { FORMULAS, formulasNeedingReview, getFormula, listFormulaIds } from './formulas';

describe('formula registry', () => {
  it('registers every audited formula with a disclaimer and non-empty assumptions', () => {
    const ids = listFormulaIds();
    expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const id of ids) {
      const f = getFormula(id)!;
      expect(f.id).toBe(id);
      expect(f.assumptions.length).toBeGreaterThan(0);
      expect(f.limitations.length).toBeGreaterThan(0);
      expect(f.disclaimer.toLowerCase()).toMatch(/not investment advice/);
      // Authority may be null only when needsHumanReview is true.
      if (f.authority === null) expect(f.needsHumanReview).toBe(true);
    }
  });

  it('does not invent authority for formulas marked for human review', () => {
    const needs = formulasNeedingReview();
    for (const f of needs) {
      expect(f.needsHumanReview || f.authority === null).toBe(true);
      expect(f.limitations.some((l) => /HUMAN REVIEW|review/i.test(l) || f.authority === null)).toBe(true);
    }
    // trade-flow authority is the in-repo pure aggregate as coded.
    expect(FORMULAS['flow.trade-tape.v1']?.needsHumanReview).toBe(false);
    expect(FORMULAS['flow.trade-tape.v1']?.authority).toMatch(/tradeFlow\.ts/);
  });

  it('covers the representative mission modules', () => {
    const required = [
      'dcf.gordon-growth.v1',
      'dcf.reverse.v1',
      'capm.cost-of-equity.v1',
      'capm.wacc.v1',
      'risk.correlation.v1',
      'risk.beta.v1',
      'risk.market-sensitivity.v1',
      'scoring.altman-z-prime.v1',
      'scoring.piotroski-f.v1',
      'scoring.beneish-m.v1',
      'comps.multiples.v1',
      'funding.carry.v1',
      'book.depth-slippage.v1',
      'yield.curve-spread.v1',
    ];
    for (const id of required) {
      expect(getFormula(id), id).toBeDefined();
    }
  });
});
