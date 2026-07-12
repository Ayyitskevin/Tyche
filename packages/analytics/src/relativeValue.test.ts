import { describe, it, expect } from 'vitest';
import {
  compMultiples,
  median,
  peerMedians,
  premiumToPeers,
  type CompFinancials,
} from './relativeValue';

const full: CompFinancials = {
  symbol: 'AAA',
  marketCap: 1000,
  revenue: 500,
  priorRevenue: 400,
  netIncome: 100,
  operatingIncome: 120,
  grossProfit: 300,
  depreciationAmortization: 30, // EBITDA = 150
  totalEquity: 400,
  totalDebt: 200,
  cash: 50, // EV = 1000 + 200 − 50 = 1150
  freeCashFlow: 80,
};

describe('compMultiples', () => {
  it('computes every multiple from a full input', () => {
    const r = compMultiples(full);
    expect(r.enterpriseValue).toBeCloseTo(1150, 6);
    expect(r.pe).toBeCloseTo(10, 6); // 1000 / 100
    expect(r.ps).toBeCloseTo(2, 6); // 1000 / 500
    expect(r.pb).toBeCloseTo(2.5, 6); // 1000 / 400
    expect(r.evEbitda).toBeCloseTo(1150 / 150, 6);
    expect(r.evSales).toBeCloseTo(2.3, 6); // 1150 / 500
    expect(r.fcfYield).toBeCloseTo(0.08, 6); // 80 / 1000
    expect(r.grossMargin).toBeCloseTo(0.6, 6);
    expect(r.operatingMargin).toBeCloseTo(0.24, 6);
    expect(r.netMargin).toBeCloseTo(0.2, 6);
    expect(r.revenueGrowth).toBeCloseTo(0.25, 6); // 500/400 − 1
  });

  it('marks loss-making / negative-denominator multiples as not-meaningful (null)', () => {
    expect(compMultiples({ ...full, netIncome: -20 }).pe).toBeNull();
    expect(compMultiples({ ...full, totalEquity: -10 }).pb).toBeNull();
    // Negative EBITDA (operating loss with no D&A offset)
    expect(compMultiples({ ...full, operatingIncome: -10, depreciationAmortization: 0 }).evEbitda).toBeNull();
  });

  it('nulls the price-based multiples (and EV) when market cap is unknown', () => {
    const r = compMultiples({ ...full, marketCap: null });
    expect(r.enterpriseValue).toBeNull();
    expect(r.pe).toBeNull();
    expect(r.ps).toBeNull();
    expect(r.pb).toBeNull();
    expect(r.evEbitda).toBeNull();
    // margins are independent of price and still compute
    expect(r.netMargin).toBeCloseTo(0.2, 6);
  });

  it('nulls revenue growth when the prior base is missing or non-positive', () => {
    expect(compMultiples({ ...full, priorRevenue: null }).revenueGrowth).toBeNull();
    expect(compMultiples({ ...full, priorRevenue: 0 }).revenueGrowth).toBeNull();
  });
});

describe('median', () => {
  it('handles odd, even, and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([NaN, Infinity, 5])).toBe(5); // non-finite dropped
  });
});

describe('peerMedians', () => {
  it('takes the per-metric median across rows, dropping nulls', () => {
    const rows = [
      compMultiples(full), // pe 10, ps 2
      compMultiples({ ...full, symbol: 'BBB', marketCap: 2000 }), // pe 20, ps 4
      compMultiples({ ...full, symbol: 'CCC', netIncome: -5, marketCap: 3000 }), // pe null, ps 6
    ];
    const m = peerMedians(rows);
    expect(m.pe).toBeCloseTo(15, 6); // median of [10, 20] (null dropped)
    expect(m.ps).toBeCloseTo(4, 6); // median of [2, 4, 6]
  });
});

describe('premiumToPeers', () => {
  it('is the signed premium/discount to a reference', () => {
    expect(premiumToPeers(12, 10)).toBeCloseTo(0.2, 6);
    expect(premiumToPeers(8, 10)).toBeCloseTo(-0.2, 6);
    expect(premiumToPeers(10, null)).toBeNull();
    expect(premiumToPeers(10, 0)).toBeNull();
  });
});
