import type { OptionContract } from '@tyche/contracts';
import { blackScholes, type OptionType } from './options';

/**
 * Higher-level options analytics built on the Black–Scholes core: implied
 * volatility, strategy payoff diagrams, breakevens, and open-interest max pain.
 * Pure and dependency-free; educational analytics only — nothing here is
 * investment advice or a recommendation to trade any structure.
 */

/** Intrinsic value of a single option at an underlying price (per share, ×1). */
function intrinsicValue(type: OptionType, strike: number, price: number): number {
  return type === 'call' ? Math.max(0, price - strike) : Math.max(0, strike - price);
}

export interface ImpliedVolInput {
  spot: number;
  strike: number;
  /** Time to expiry in years. */
  timeYears: number;
  /** Risk-free rate (annualized decimal). */
  rate: number;
  /** Continuous dividend yield (annualized decimal). Defaults to 0. */
  dividendYield?: number;
  type: OptionType;
}

/**
 * Back out the Black–Scholes implied volatility that reprices `marketPrice`, via
 * bisection (robust where vega → 0 for deep ITM/OTM options). Returns null when
 * the target price is outside the achievable band [σ=lo, σ=hi] — e.g. a quote
 * below discounted intrinsic — or the inputs are degenerate.
 */
export function impliedVolatility(
  marketPrice: number,
  input: ImpliedVolInput,
  opts: { lo?: number; hi?: number; tol?: number; maxIter?: number } = {},
): number | null {
  const { lo = 1e-4, hi = 5, tol = 1e-6, maxIter = 128 } = opts;
  if (!(marketPrice > 0) || input.timeYears <= 0 || input.spot <= 0 || input.strike <= 0) return null;

  const priceAt = (vol: number): number => blackScholes({ ...input, vol }).price;
  // Black–Scholes price is monotonically increasing in volatility, so the target
  // must sit within the prices at the search bounds.
  if (marketPrice < priceAt(lo) - tol || marketPrice > priceAt(hi) + tol) return null;

  let a = lo;
  let b = hi;
  for (let i = 0; i < maxIter; i++) {
    const mid = (a + b) / 2;
    const pm = priceAt(mid);
    if (Math.abs(pm - marketPrice) < tol) return mid;
    if (pm < marketPrice) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/** One leg of an options strategy. `quantity` > 0 is long, < 0 is short. */
export interface OptionLeg {
  type: OptionType;
  strike: number;
  quantity: number;
  /** Premium paid (long) or received (short), per share. */
  premium: number;
}

/** Profit/loss of one leg at an expiry price: quantity·(intrinsic − premium). */
export function legPayoff(leg: OptionLeg, priceAtExpiry: number): number {
  return leg.quantity * (intrinsicValue(leg.type, leg.strike, priceAtExpiry) - leg.premium);
}

/** Combined profit/loss of a strategy at a single expiry price. */
export function strategyPayoff(legs: OptionLeg[], priceAtExpiry: number): number {
  return legs.reduce((sum, leg) => sum + legPayoff(leg, priceAtExpiry), 0);
}

export interface PayoffPoint {
  price: number;
  payoff: number;
}

/** Sample a strategy's payoff over an evenly-spaced price grid ([] for a bad range). */
export function payoffCurve(
  legs: OptionLeg[],
  opts: { min: number; max: number; steps?: number },
): PayoffPoint[] {
  const { min, max, steps = 50 } = opts;
  if (!(max > min) || steps < 1) return [];
  const out: PayoffPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const price = min + (i / steps) * (max - min);
    out.push({ price, payoff: strategyPayoff(legs, price) });
  }
  return out;
}

/**
 * Breakeven prices where the payoff curve crosses zero. A grid node that lands
 * exactly on zero is reported once; between two non-zero nodes of opposite sign
 * the crossing is linearly interpolated (so exact-zero nodes aren't double
 * counted by the adjacent segment).
 */
export function breakevens(curve: PayoffPoint[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i]!;
    if (p.payoff === 0) {
      out.push(p.price);
      continue;
    }
    if (i === 0) continue;
    const a = curve[i - 1]!;
    if (a.payoff !== 0 && a.payoff < 0 !== p.payoff < 0) {
      const t = a.payoff / (a.payoff - p.payoff);
      out.push(a.price + t * (p.price - a.price));
    }
  }
  return out;
}

export interface PayoffSummary {
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
}

/**
 * Max profit / max loss over the sampled range plus the breakevens. Note the
 * extremes are bounded by the grid, so an unbounded structure reports the value
 * at the grid edge (the caller sizes the range to be meaningful).
 */
export function payoffSummary(curve: PayoffPoint[]): PayoffSummary {
  if (curve.length === 0) return { maxProfit: 0, maxLoss: 0, breakevens: [] };
  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  for (const p of curve) {
    if (p.payoff > maxProfit) maxProfit = p.payoff;
    if (p.payoff < maxLoss) maxLoss = p.payoff;
  }
  return { maxProfit, maxLoss, breakevens: breakevens(curve) };
}

/**
 * Max-pain strike: the expiry underlying price (among listed strikes) that
 * minimizes the total intrinsic payout across all open interest — i.e. where the
 * most option value expires worthless. Null when no contract carries open
 * interest. Uses openInterest weighting on calls (max(0, P−K)) and puts
 * (max(0, K−P)).
 */
export function maxPain(contracts: OptionContract[]): number | null {
  const withOi = contracts.filter((c) => (c.openInterest ?? 0) > 0);
  if (withOi.length === 0) return null;
  const strikes = [...new Set(withOi.map((c) => c.strike))].sort((a, b) => a - b);
  let best: number | null = null;
  let bestTotal = Infinity;
  for (const candidate of strikes) {
    let total = 0;
    for (const c of withOi) {
      total += (c.openInterest ?? 0) * intrinsicValue(c.type, c.strike, candidate);
    }
    if (total < bestTotal) {
      bestTotal = total;
      best = candidate;
    }
  }
  return best;
}

export interface IvPoint {
  strike: number;
  impliedVolatility: number;
  type: OptionType;
}

/**
 * Implied-volatility skew: the contracts that carry a finite IV, optionally
 * filtered to a single option type and/or expiry, as {strike, iv} points sorted
 * by strike (the shape a skew/smile plot consumes).
 */
export function ivSkew(
  contracts: OptionContract[],
  opts: { type?: OptionType; expiry?: string } = {},
): IvPoint[] {
  const { type, expiry } = opts;
  return contracts
    .filter(
      (c) =>
        c.impliedVolatility !== undefined &&
        Number.isFinite(c.impliedVolatility) &&
        (type ? c.type === type : true) &&
        (expiry ? c.expiry === expiry : true),
    )
    .map((c) => ({ strike: c.strike, impliedVolatility: c.impliedVolatility as number, type: c.type }))
    .sort((a, b) => a.strike - b.strike);
}
