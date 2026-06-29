import { describe, it, expect } from 'vitest';
import { cagr, futureValue, loanPayment, presentValue } from './tvm';

describe('tvm', () => {
  it('future value of a savings annuity', () => {
    expect(futureValue(0, 100, 0.005, 120)).toBeCloseTo(16387.93, 2);
  });

  it('future value with a zero rate is linear', () => {
    expect(futureValue(1000, 100, 0, 12)).toBe(2200);
  });

  it('present value discounts a future sum', () => {
    expect(presentValue(1000, 0, 0.05, 10)).toBeCloseTo(613.91, 2);
  });

  it('loan payment fully amortizes the principal', () => {
    expect(loanPayment(10000, 0.01, 12)).toBeCloseTo(888.49, 2);
  });

  it('loan payment with a zero rate splits the principal evenly', () => {
    expect(loanPayment(1200, 0, 12)).toBe(100);
  });

  it('cagr computes compound growth and guards bad inputs', () => {
    expect(cagr(100, 200, 10)).toBeCloseTo(0.0718, 4);
    expect(Number.isNaN(cagr(0, 200, 10))).toBe(true);
    expect(Number.isNaN(cagr(100, 200, 0))).toBe(true);
  });
});
