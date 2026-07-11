import { describe, it, expect } from 'vitest';
import type { OptionContract } from '@tyche/contracts';
import { blackScholes } from './options';
import {
  breakevens,
  impliedVolatility,
  ivSkew,
  legPayoff,
  maxPain,
  payoffCurve,
  payoffSummary,
  strategyPayoff,
  type OptionLeg,
} from './optionsAnalytics';

describe('impliedVolatility', () => {
  it('round-trips: recovers the vol that priced an option', () => {
    const input = { spot: 100, strike: 100, timeYears: 0.5, rate: 0.03, type: 'call' as const };
    const trueVol = 0.28;
    const price = blackScholes({ ...input, vol: trueVol }).price;
    const iv = impliedVolatility(price, input);
    expect(iv).not.toBeNull();
    expect(iv!).toBeCloseTo(trueVol, 4);
  });

  it('recovers vol for a put too', () => {
    const input = { spot: 90, strike: 100, timeYears: 1, rate: 0.02, type: 'put' as const };
    const price = blackScholes({ ...input, vol: 0.45 }).price;
    expect(impliedVolatility(price, input)!).toBeCloseTo(0.45, 4);
  });

  it('returns null when the target price is unachievable or inputs degenerate', () => {
    const input = { spot: 100, strike: 100, timeYears: 0.5, rate: 0.03, type: 'call' as const };
    // A price above the σ=hi bound cannot be matched.
    expect(impliedVolatility(99, input, { hi: 2 })).toBeNull();
    expect(impliedVolatility(0, input)).toBeNull();
    expect(impliedVolatility(5, { ...input, timeYears: 0 })).toBeNull();
  });
});

describe('payoff diagrams', () => {
  it('prices a long call leg: below strike loses the premium, above pays intrinsic', () => {
    const leg: OptionLeg = { type: 'call', strike: 100, quantity: 1, premium: 5 };
    expect(legPayoff(leg, 90)).toBeCloseTo(-5, 10); // expires worthless
    expect(legPayoff(leg, 110)).toBeCloseTo(5, 10); // 10 intrinsic − 5 premium
    // Short call is the mirror image.
    expect(legPayoff({ ...leg, quantity: -1 }, 110)).toBeCloseTo(-5, 10);
  });

  it('a long straddle profits on a large move and loses the combined premium at the strike', () => {
    const legs: OptionLeg[] = [
      { type: 'call', strike: 100, quantity: 1, premium: 4 },
      { type: 'put', strike: 100, quantity: 1, premium: 4 },
    ];
    expect(strategyPayoff(legs, 100)).toBeCloseTo(-8, 10); // both expire worthless
    expect(strategyPayoff(legs, 120)).toBeCloseTo(12, 10); // call 20 − 8 premium
    const curve = payoffCurve(legs, { min: 60, max: 140, steps: 80 });
    const be = breakevens(curve).sort((a, b) => a - b);
    // Breakevens at strike ± total premium: 92 and 108.
    expect(be).toHaveLength(2);
    expect(be[0]!).toBeCloseTo(92, 6);
    expect(be[1]!).toBeCloseTo(108, 6);
    const summary = payoffSummary(curve);
    expect(summary.maxLoss).toBeCloseTo(-8, 6); // worst case at the strike
    expect(summary.maxProfit).toBeGreaterThan(0);
  });

  it('a bull call spread caps profit and loss between the strikes', () => {
    const legs: OptionLeg[] = [
      { type: 'call', strike: 100, quantity: 1, premium: 6 },
      { type: 'call', strike: 110, quantity: -1, premium: 2 },
    ];
    const curve = payoffCurve(legs, { min: 80, max: 130, steps: 100 });
    const summary = payoffSummary(curve);
    // Net debit 4 → max loss −4 (below 100), max profit 10 − 4 = 6 (above 110).
    expect(summary.maxLoss).toBeCloseTo(-4, 6);
    expect(summary.maxProfit).toBeCloseTo(6, 6);
  });

  it('returns an empty curve for a degenerate range', () => {
    expect(payoffCurve([], { min: 100, max: 100 })).toEqual([]);
    expect(payoffSummary([])).toEqual({ maxProfit: 0, maxLoss: 0, breakevens: [] });
  });
});

describe('maxPain', () => {
  function contract(type: 'call' | 'put', strike: number, openInterest: number): OptionContract {
    return {
      contractSymbol: `X${type}${strike}`,
      underlying: 'X',
      type,
      strike,
      expiry: '2026-12-18',
      openInterest,
    };
  }

  it('finds the strike minimizing total intrinsic payout across open interest', () => {
    // Heavy call OI at 90 and put OI at 110 → pain sits between; with symmetric
    // walls the minimizing listed strike is the interior 100.
    const contracts = [
      contract('call', 90, 1000),
      contract('call', 100, 200),
      contract('call', 110, 100),
      contract('put', 110, 1000),
      contract('put', 100, 200),
      contract('put', 90, 100),
    ];
    expect(maxPain(contracts)).toBe(100);
  });

  it('is null when no contract carries open interest', () => {
    expect(maxPain([contract('call', 100, 0)])).toBeNull();
    expect(maxPain([])).toBeNull();
  });
});

describe('ivSkew', () => {
  function withIv(type: 'call' | 'put', strike: number, iv: number | undefined): OptionContract {
    return {
      contractSymbol: `X${type}${strike}`,
      underlying: 'X',
      type,
      strike,
      expiry: '2026-12-18',
      ...(iv === undefined ? {} : { impliedVolatility: iv }),
    };
  }

  it('returns finite-IV points sorted by strike, filterable by type', () => {
    const contracts = [
      withIv('call', 110, 0.22),
      withIv('call', 90, 0.35),
      withIv('put', 100, 0.28),
      withIv('call', 100, undefined), // no IV → excluded
    ];
    const calls = ivSkew(contracts, { type: 'call' });
    expect(calls.map((p) => p.strike)).toEqual([90, 110]); // sorted, IV-less dropped
    expect(calls[0]!.impliedVolatility).toBe(0.35);
    // Without a type filter, the put is included too.
    expect(ivSkew(contracts).map((p) => p.strike)).toEqual([90, 100, 110]);
  });
});
