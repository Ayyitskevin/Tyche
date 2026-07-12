import { describe, it, expect } from 'vitest';
import { discountedCashFlow, impliedGrowthRate, dcfSensitivity, type DcfInputs } from './dcf';

// A hand-checkable base case:
//   FCF1 = 110 (pv 100), FCF2 = 121 (pv 100)  -> sumPvFcf = 200
//   TV   = 121 * 1.02 / (0.10 - 0.02) = 1542.75, pvTV = 1542.75 / 1.21 = 1275
//   EV   = 1475, equity = 1475, /10 shares = 147.5
const base: DcfInputs = {
  baseFcf: 100,
  forecastYears: 2,
  growthRate: 0.1,
  terminalGrowthRate: 0.02,
  discountRate: 0.1,
  netDebt: 0,
  sharesOutstanding: 10,
};

describe('discountedCashFlow', () => {
  it('projects, discounts, and terminates to a per-share fair value', () => {
    const r = discountedCashFlow(base);
    expect(r.years).toHaveLength(2);
    expect(r.years[0]).toMatchObject({ year: 1 });
    expect(r.years[0]?.fcf).toBeCloseTo(110, 6);
    expect(r.years[0]?.presentValue).toBeCloseTo(100, 6);
    expect(r.years[1]?.fcf).toBeCloseTo(121, 6);
    expect(r.years[1]?.presentValue).toBeCloseTo(100, 6);
    expect(r.sumPvFcf).toBeCloseTo(200, 6);
    expect(r.terminalValue).toBeCloseTo(1542.75, 4);
    expect(r.pvTerminalValue).toBeCloseTo(1275, 4);
    expect(r.enterpriseValue).toBeCloseTo(1475, 4);
    expect(r.equityValue).toBeCloseTo(1475, 4);
    expect(r.fairValuePerShare).toBeCloseTo(147.5, 4);
  });

  it('subtracts net debt from enterprise value', () => {
    const r = discountedCashFlow({ ...base, netDebt: 475 });
    expect(r.equityValue).toBeCloseTo(1000, 4);
    expect(r.fairValuePerShare).toBeCloseTo(100, 4);
  });

  it('leaves per-share null when shares are absent or non-positive', () => {
    expect(discountedCashFlow({ ...base, sharesOutstanding: undefined }).fairValuePerShare).toBeNull();
    expect(discountedCashFlow({ ...base, sharesOutstanding: 0 }).fairValuePerShare).toBeNull();
  });

  it('nulls the terminal value (and everything downstream) when WACC ≤ terminal growth', () => {
    const r = discountedCashFlow({ ...base, discountRate: 0.02, terminalGrowthRate: 0.02 });
    expect(r.terminalValue).toBeNull();
    expect(r.pvTerminalValue).toBeNull();
    expect(r.enterpriseValue).toBeNull();
    expect(r.equityValue).toBeNull();
    expect(r.fairValuePerShare).toBeNull();
    expect(r.years).toHaveLength(2); // the explicit forecast is still there
  });

  it('coerces the forecast horizon to an integer ≥ 1', () => {
    expect(discountedCashFlow({ ...base, forecastYears: 0 }).years).toHaveLength(1);
    expect(discountedCashFlow({ ...base, forecastYears: 2.9 }).years).toHaveLength(2);
  });
});

describe('impliedGrowthRate (reverse DCF)', () => {
  const rev: DcfInputs = {
    baseFcf: 100,
    forecastYears: 5,
    growthRate: 0.08,
    terminalGrowthRate: 0.025,
    discountRate: 0.09,
  };

  it('recovers the growth rate that produced a given equity value', () => {
    const equity = discountedCashFlow(rev).equityValue!;
    expect(impliedGrowthRate(rev, equity)).toBeCloseTo(0.08, 4);
  });

  it('implies higher growth for a higher target valuation', () => {
    const equity = discountedCashFlow(rev).equityValue!;
    const lo = impliedGrowthRate(rev, equity * 0.8)!;
    const hi = impliedGrowthRate(rev, equity * 1.2)!;
    expect(hi).toBeGreaterThan(lo);
  });

  it('returns null for non-positive base FCF, divergent terminal, or an unreachable target', () => {
    expect(impliedGrowthRate({ ...rev, baseFcf: -5 }, 1000)).toBeNull();
    expect(impliedGrowthRate({ ...rev, discountRate: 0.02 }, 1000)).toBeNull();
    expect(impliedGrowthRate(rev, 1e18)).toBeNull();
  });
});

describe('dcfSensitivity', () => {
  it('produces an equity-value grid monotonic in WACC and terminal growth', () => {
    const grid = dcfSensitivity(base, [0.08, 0.1], [0.02, 0.03]);
    expect(grid).toHaveLength(2);
    expect(grid[0]).toHaveLength(2);
    // Higher WACC -> lower value (down a column).
    expect(grid[0]![0]!).toBeGreaterThan(grid[1]![0]!);
    // Higher terminal growth -> higher value (across a row).
    expect(grid[0]![1]!).toBeGreaterThan(grid[0]![0]!);
  });

  it('nulls cells where WACC does not exceed terminal growth', () => {
    const grid = dcfSensitivity(base, [0.03], [0.05]);
    expect(grid[0]![0]).toBeNull();
  });
});
