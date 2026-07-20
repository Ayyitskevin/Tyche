import type { PortfolioRiskStats } from '@tyche/contracts';

/**
 * Serialize portfolio risk stats for the API envelope.
 * Non-finite values become null (unavailable ≠ fabricated 0). Legitimate finite
 * zeros pass through. Skill ratios already arrive as number | null from analytics.
 */
export function finOrNull(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : v;
}

export function sanitizePortfolioRiskStats(s: {
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdown: number;
  valueAtRisk: number;
  beta: number | null;
  trackingError: number | null;
  informationRatio: number | null;
}): PortfolioRiskStats {
  return {
    annualizedReturn: finOrNull(s.annualizedReturn),
    annualizedVolatility: finOrNull(s.annualizedVolatility),
    sharpe: finOrNull(s.sharpe),
    sortino: finOrNull(s.sortino),
    calmar: finOrNull(s.calmar),
    maxDrawdown: finOrNull(s.maxDrawdown),
    valueAtRisk: finOrNull(s.valueAtRisk),
    beta: finOrNull(s.beta),
    trackingError: finOrNull(s.trackingError),
    informationRatio: finOrNull(s.informationRatio),
  };
}
