import type { FinancialStatement } from '@tyche/contracts';
import { bundlePeriods, lineItem, ratio, type PeriodBundle } from './fundamentals';

/**
 * Fundamental scoring: the Altman Z′-Score (financial-distress composite) and the
 * Piotroski F-Score (9-point fundamental-strength checklist), computed over the
 * normalized financial statements the terminal already fetches. Pure and
 * dependency-free; every input is read null-safely, and a score is reported as
 * incomplete (never fabricated) whenever a required line item is missing.
 * Educational analytics only — a descriptive read of reported filings, not a
 * signal, rating, or investment advice.
 */

// --- Altman Z′-Score --------------------------------------------------------

export interface ZScoreComponent {
  key: string;
  label: string;
  /** The Xi ratio; null when an input line item is missing. */
  value: number | null;
  weight: number;
  /** weight × value; null when value is null. */
  contribution: number | null;
}

export interface AltmanZScore {
  /** Total Z′ score, or null when any component could not be computed. */
  score: number | null;
  components: ZScoreComponent[];
  /** Z′ distress bands: >2.9 safe · 1.23–2.9 grey · <1.23 distress. Null when score is null. */
  zone: 'safe' | 'grey' | 'distress' | null;
  /** True only when all five components were computable. */
  complete: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Altman Z′-Score — the private-firm / market-cap-free variant. X4 uses the BOOK
 * value of equity ÷ total liabilities (not market cap ÷ liabilities), so the whole
 * score is computed from statements alone with no price input; EBIT is taken as
 * operating income. A partial score is meaningless for a calibrated composite, so
 * the total is null unless all five components are present.
 */
export function altmanZScore(bundle: PeriodBundle | undefined): AltmanZScore {
  const totalAssets = lineItem(bundle?.balance, 'totalAssets');
  const currentAssets = lineItem(bundle?.balance, 'currentAssets');
  const currentLiabilities = lineItem(bundle?.balance, 'currentLiabilities');
  const retainedEarnings = lineItem(bundle?.balance, 'retainedEarnings');
  const ebit = lineItem(bundle?.income, 'operatingIncome'); // operating income as the EBIT proxy
  const totalLiabilities = lineItem(bundle?.balance, 'totalLiabilities');
  const bookEquity = lineItem(bundle?.balance, 'totalEquity');
  const sales = lineItem(bundle?.income, 'totalRevenue');

  const workingCapital = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;

  const comp = (key: string, label: string, value: number | null, weight: number): ZScoreComponent => ({
    key,
    label,
    value,
    weight,
    contribution: value === null ? null : weight * value,
  });

  const components: ZScoreComponent[] = [
    comp('x1', 'Working capital / total assets', ratio(workingCapital, totalAssets), 0.717),
    comp('x2', 'Retained earnings / total assets', ratio(retainedEarnings, totalAssets), 0.847),
    comp('x3', 'EBIT / total assets', ratio(ebit, totalAssets), 3.107),
    comp('x4', 'Book equity / total liabilities', ratio(bookEquity, totalLiabilities), 0.42),
    comp('x5', 'Sales / total assets', ratio(sales, totalAssets), 0.998),
  ];

  const complete = components.every((c) => c.contribution !== null);
  const score = complete ? round2(components.reduce((s, c) => s + (c.contribution as number), 0)) : null;
  const zone = score === null ? null : score > 2.9 ? 'safe' : score >= 1.23 ? 'grey' : 'distress';
  return { score, components, zone, complete };
}

// --- Piotroski F-Score ------------------------------------------------------

export interface FScoreSignal {
  key: string;
  label: string;
  /** 1 point when true, 0 when false, null when a required input was missing. */
  pass: boolean | null;
}

export interface PiotroskiFScore {
  /** Points earned (signals that passed). */
  score: number;
  /** How many of the nine signals had all inputs present. */
  evaluable: number;
  /** Always 9. */
  total: number;
  /** True only when all nine signals were evaluable. */
  complete: boolean;
  signals: FScoreSignal[];
  /** Coarse read (only when complete): ≥7 strong · 4–6 moderate · ≤3 weak. */
  band: 'strong' | 'moderate' | 'weak' | null;
}

const F_TOTAL = 9;

const gt = (a: number | null, b: number | null): boolean | null => (a === null || b === null ? null : a > b);
const lt = (a: number | null, b: number | null): boolean | null => (a === null || b === null ? null : a < b);
const lte = (a: number | null, b: number | null): boolean | null => (a === null || b === null ? null : a <= b);
const positive = (a: number | null): boolean | null => (a === null ? null : a > 0);

/**
 * Piotroski F-Score — nine binary fundamental-strength signals across
 * profitability, leverage/liquidity, and operating efficiency, comparing the most
 * recent annual period to the prior one. Signals that need the prior year are null
 * when it is absent; the leverage signal uses total-debt/assets (the mapped balance
 * sheet exposes total, not strictly long-term, debt). `score` sums only the passing
 * signals and `evaluable`/`complete` report how much of the checklist the data
 * actually supported — never inflating a partial checklist to a full 9.
 */
export function piotroskiFScore(cur: PeriodBundle | undefined, prior: PeriodBundle | undefined): PiotroskiFScore {
  const roa = (b: PeriodBundle | undefined) => ratio(lineItem(b?.income, 'netIncome'), lineItem(b?.balance, 'totalAssets'));
  const leverage = (b: PeriodBundle | undefined) => ratio(lineItem(b?.balance, 'totalDebt'), lineItem(b?.balance, 'totalAssets'));
  const currentRatio = (b: PeriodBundle | undefined) =>
    ratio(lineItem(b?.balance, 'currentAssets'), lineItem(b?.balance, 'currentLiabilities'));
  const grossMargin = (b: PeriodBundle | undefined) => ratio(lineItem(b?.income, 'grossProfit'), lineItem(b?.income, 'totalRevenue'));
  const assetTurnover = (b: PeriodBundle | undefined) =>
    ratio(lineItem(b?.income, 'totalRevenue'), lineItem(b?.balance, 'totalAssets'));

  const niC = lineItem(cur?.income, 'netIncome');
  const cfoC = lineItem(cur?.cashFlow, 'operatingCashFlow');

  const signals: FScoreSignal[] = [
    { key: 'roaPositive', label: 'Positive return on assets', pass: positive(roa(cur)) },
    { key: 'cfoPositive', label: 'Positive operating cash flow', pass: positive(cfoC) },
    { key: 'roaRising', label: 'Return on assets improved YoY', pass: gt(roa(cur), roa(prior)) },
    { key: 'accruals', label: 'Operating cash flow exceeds net income', pass: gt(cfoC, niC) },
    { key: 'leverageFalling', label: 'Leverage (debt / assets) fell YoY', pass: lt(leverage(cur), leverage(prior)) },
    { key: 'currentRatioRising', label: 'Current ratio improved YoY', pass: gt(currentRatio(cur), currentRatio(prior)) },
    {
      key: 'noDilution',
      label: 'No new shares issued YoY',
      pass: lte(lineItem(cur?.balance, 'sharesOutstanding'), lineItem(prior?.balance, 'sharesOutstanding')),
    },
    { key: 'grossMarginRising', label: 'Gross margin improved YoY', pass: gt(grossMargin(cur), grossMargin(prior)) },
    { key: 'assetTurnoverRising', label: 'Asset turnover improved YoY', pass: gt(assetTurnover(cur), assetTurnover(prior)) },
  ];

  const score = signals.filter((s) => s.pass === true).length;
  const evaluable = signals.filter((s) => s.pass !== null).length;
  const complete = evaluable === F_TOTAL;
  const band = !complete ? null : score >= 7 ? 'strong' : score >= 4 ? 'moderate' : 'weak';
  return { score, evaluable, total: F_TOTAL, complete, signals, band };
}

// --- Combined scorecard -----------------------------------------------------

export interface FundamentalScorecard {
  symbol: string;
  /** Fiscal date of the most recent annual period scored, or null when none. */
  fiscalDate: string | null;
  /** Fiscal date of the prior annual period used for the F-Score deltas. */
  priorFiscalDate: string | null;
  altmanZ: AltmanZScore;
  piotroskiF: PiotroskiFScore;
  /** True when fewer than two annual periods were available (F-Score deltas limited). */
  insufficientHistory: boolean;
}

/**
 * Compute the Altman Z′ and Piotroski F scores from a set of financial statements.
 * Only ANNUAL periods are used (both scores are annual metrics); the two most
 * recent annual periods drive the year-over-year signals. Empty-safe. Educational
 * analytics only — not investment advice.
 */
export function fundamentalScorecard(statements: FinancialStatement[], symbol: string): FundamentalScorecard {
  const bundles = bundlePeriods(statements.filter((s) => s.period === 'annual')); // newest-first
  const cur = bundles[0];
  const prior = bundles[1];
  return {
    symbol,
    fiscalDate: cur?.fiscalDate ?? null,
    priorFiscalDate: prior?.fiscalDate ?? null,
    altmanZ: altmanZScore(cur),
    piotroskiF: piotroskiFScore(cur, prior),
    insufficientHistory: !prior,
  };
}
