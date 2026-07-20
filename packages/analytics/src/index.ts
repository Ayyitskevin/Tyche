/**
 * @tyche/analytics — small, dependency-free analytics helpers operating on
 * normalized contract types (returns, indicators, risk). Educational analytics
 * only — nothing here constitutes investment advice.
 *
 * Shared validation / analytical provenance: validation.ts, analyticalMeta.ts,
 * formulas.ts — attach formula ids, units, and status so unavailable results
 * cannot silently appear as zeros.
 */
export * from './returns';
export * from './indicators';
export * from './technicals';
export * from './risk';
export * from './portfolio';
export * from './portfolioRisk';
export * from './portfolioRiskAgg';
export * from './fundamentals';
export * from './screen';
export * from './options';
export * from './optionsAnalytics';
export * from './tvm';
export * from './dcf';
export * from './relativeValue';
export * from './capm';
export * from './insider';
export * from './eightK';
export * from './scoring';
export * from './performance';
export * from './marketBeta';
export * from './seasonality';
export * from './valuationHistory';
export * from './fundingAnalytics';
export * from './bookAnalytics';
export * from './dexAnalytics';
export * from './tradeFlow';
export * from './validation';
export * from './analyticalMeta';
export * from './formulas';
