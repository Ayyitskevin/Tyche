/** Locally-derived forward valuation multiples (view-model only, never transported). */
export interface ImpliedMultiples {
  pe: number | null;
  ps: number | null;
  pcf: number | null;
}

function finite(n: number | null): number | null {
  return n !== null && Number.isFinite(n) ? n : null;
}

/**
 * Compute implied P/E, P/S, and P/CF from a forward EPS/revenue estimate plus
 * price, shares outstanding, and operating cash flow. Every guard returns null
 * (→ em-dash) rather than NaN/Infinity: a null input or a non-positive divisor
 * yields a null multiple. Pure + unit-testable.
 */
export function computeImpliedMultiples(opts: {
  epsMean: number | null;
  revMean: number | null;
  price: number | null;
  shares: number | null;
  operatingCashFlow: number | null;
}): ImpliedMultiples {
  const { epsMean, revMean, price, shares, operatingCashFlow } = opts;
  const pe = price !== null && epsMean !== null && epsMean > 0 ? price / epsMean : null;
  const ps = price !== null && shares !== null && revMean !== null && revMean > 0 ? (price * shares) / revMean : null;
  const pcf =
    price !== null && shares !== null && operatingCashFlow !== null && operatingCashFlow > 0
      ? (price * shares) / operatingCashFlow
      : null;
  return { pe: finite(pe), ps: finite(ps), pcf: finite(pcf) };
}
