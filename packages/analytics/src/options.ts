/**
 * Black–Scholes–Merton European option pricing and Greeks. Standard public-domain
 * formulas; educational analytics only — nothing here is investment advice.
 *
 * Conventions: `timeYears`, `rate`, `vol`, and `dividendYield` are annualized and
 * expressed as decimals (e.g. 0.25 = 25%). The returned `vega` is per 1.00 change
 * in volatility and `theta` is per year — callers scale to per-1% / per-day for
 * display.
 */

export type OptionType = 'call' | 'put';

export interface BlackScholesInput {
  spot: number;
  strike: number;
  /** Time to expiry in years. */
  timeYears: number;
  /** Risk-free rate (annualized decimal). */
  rate: number;
  /** Volatility (annualized decimal). */
  vol: number;
  /** Continuous dividend yield (annualized decimal). Defaults to 0. */
  dividendYield?: number;
  type: OptionType;
}

export interface OptionValuation {
  price: number;
  delta: number;
  gamma: number;
  /** Per 1.00 change in volatility. */
  vega: number;
  /** Per year. */
  theta: number;
  /** Per 1.00 change in rate. */
  rho: number;
  intrinsic: number;
  d1: number;
  d2: number;
}

/** Standard normal PDF. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation
 * (|error| < 1.5e-7). Dependency-free and deterministic.
 */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/**
 * Price a European option and its Greeks. Degenerate inputs (non-positive time
 * or volatility) collapse to the discounted intrinsic value with delta ∈ {0, ±1}
 * and all second-order Greeks zero, so the function never returns NaN.
 */
export function blackScholes(input: BlackScholesInput): OptionValuation {
  const { spot: S, strike: K, timeYears: T, rate: r, vol, type } = input;
  const q = input.dividendYield ?? 0;
  const isCall = type === 'call';
  const intrinsic = Math.max(0, isCall ? S - K : K - S);

  if (T <= 0 || vol <= 0 || S <= 0 || K <= 0) {
    const inMoney = isCall ? S > K : S < K;
    return {
      price: intrinsic,
      delta: inMoney ? (isCall ? 1 : -1) : 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
      intrinsic,
      d1: 0,
      d2: 0,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (vol * vol) / 2) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const discR = Math.exp(-r * T);
  const discQ = Math.exp(-q * T);
  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const pdf = normPdf(d1);

  const price = isCall
    ? S * discQ * nd1 - K * discR * nd2
    : K * discR * normCdf(-d2) - S * discQ * normCdf(-d1);
  const delta = isCall ? discQ * nd1 : discQ * (nd1 - 1);
  const gamma = (discQ * pdf) / (S * vol * sqrtT);
  const vega = S * discQ * pdf * sqrtT;
  const theta = isCall
    ? -(S * discQ * pdf * vol) / (2 * sqrtT) - r * K * discR * nd2 + q * S * discQ * nd1
    : -(S * discQ * pdf * vol) / (2 * sqrtT) + r * K * discR * normCdf(-d2) - q * S * discQ * normCdf(-d1);
  const rho = isCall ? K * T * discR * nd2 : -K * T * discR * normCdf(-d2);

  return { price, delta, gamma, vega, theta, rho, intrinsic, d1, d2 };
}
