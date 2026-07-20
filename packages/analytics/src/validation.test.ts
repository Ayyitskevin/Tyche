import { describe, it, expect } from 'vitest';
import {
  annualizeFundingPct,
  clampCorrelation,
  compoundAnnualize,
  finiteOrNull,
  isMissing,
  posDenomRatio,
  reconciles,
  safeRatio,
  sqrtAnnualize,
  unavailableNotZero,
} from './validation';

describe('isMissing / finiteOrNull', () => {
  it('treats null, undefined, NaN, and Infinity as missing', () => {
    expect(isMissing(null)).toBe(true);
    expect(isMissing(undefined)).toBe(true);
    expect(isMissing(Number.NaN)).toBe(true);
    expect(isMissing(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isMissing(0)).toBe(false);
    expect(isMissing(-1.5)).toBe(false);
  });

  it('collapses non-finite numbers to null', () => {
    expect(finiteOrNull(1.25)).toBe(1.25);
    expect(finiteOrNull(Number.NaN)).toBeNull();
    expect(finiteOrNull(Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

describe('posDenomRatio / safeRatio', () => {
  it('returns null on non-positive denominator (never Infinity)', () => {
    expect(posDenomRatio(100, 0)).toBeNull();
    expect(posDenomRatio(100, -5)).toBeNull();
    expect(posDenomRatio(100, null)).toBeNull();
    expect(posDenomRatio(null, 10)).toBeNull();
  });

  it('allows signed numerators when denom is strictly positive', () => {
    expect(posDenomRatio(-20, 100)).toBeCloseTo(-0.2, 6);
    expect(posDenomRatio(50, 200)).toBeCloseTo(0.25, 6);
  });

  it('safeRatio allows negative denominators but not zero', () => {
    expect(safeRatio(10, -2)).toBeCloseTo(-5, 6);
    expect(safeRatio(10, 0)).toBeNull();
  });
});

describe('clampCorrelation / annualization', () => {
  it('clamps correlation into [-1, 1]', () => {
    expect(clampCorrelation(1.0000001)).toBe(1);
    expect(clampCorrelation(-1.0000001)).toBe(-1);
    expect(clampCorrelation(0.5)).toBe(0.5);
  });

  it('compound-annualizes and sqrt-annualizes with null guards', () => {
    expect(compoundAnnualize(0.01, 252)).toBeCloseTo(1.01 ** 252 - 1, 6);
    expect(compoundAnnualize(-1.5, 252)).toBe(-1); // wipeout
    expect(compoundAnnualize(0.01, 0)).toBeNull();
    expect(sqrtAnnualize(0.01, 252)).toBeCloseTo(0.01 * Math.sqrt(252), 6);
    expect(sqrtAnnualize(0.01, -1)).toBeNull();
  });

  it('annualizes funding rates matching the contract formula', () => {
    // rate 0.0001, 8h → 0.0001 * 3 * 365 * 100 = 10.95%
    expect(annualizeFundingPct(0.0001, 8)).toBeCloseTo(10.95, 6);
    expect(annualizeFundingPct(0.0001, 0)).toBeNull();
  });
});

describe('reconciles / unavailableNotZero', () => {
  it('reconciles a total to the sum of components', () => {
    expect(reconciles(6, [1, 2, 3])).toBe(true);
    expect(reconciles(6.0000000001, [1, 2, 3], 1e-9)).toBe(true);
    expect(reconciles(7, [1, 2, 3])).toBe(false);
    expect(reconciles(null, [null, null])).toBe(true);
    expect(reconciles(null, [1, null])).toBe(false);
    expect(reconciles(3, [1, null, 2])).toBe(false);
  });

  it('unavailableNotZero rejects fabricated zeros', () => {
    expect(unavailableNotZero(null)).toBe(true);
    expect(unavailableNotZero(undefined)).toBe(true);
    expect(unavailableNotZero(0)).toBe(false);
    expect(unavailableNotZero(0, { allowZero: true })).toBe(true);
  });
});
