import type { FinancialStatement } from '@tyche/contracts';
import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';
import { bundlePeriods, lineItem, ratio, type PeriodBundle } from './fundamentals';

/**
 * Fundamental scoring: the Altman Z′-Score (financial-distress composite), the
 * Piotroski F-Score (9-point fundamental-strength checklist), and the Beneish
 * M-Score (1999 eight-variable earnings-manipulation screen), computed over the
 * normalized financial statements the terminal already fetches. Pure and
 * dependency-free; every input is read null-safely, and a score is reported as
 * incomplete (never fabricated) whenever a required line item is missing.
 * Educational analytics only — a descriptive read of reported filings, not a
 * signal, rating, or investment advice.
 *
 * Formula ids: scoring.altman-z-prime.v1, scoring.piotroski-f.v1, scoring.beneish-m.v1.
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
  meta: AnalyticalMeta;
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
  return {
    score,
    components,
    zone,
    complete,
    meta: analyticalMeta({
      formulaId: 'scoring.altman-z-prime.v1',
      status: complete ? 'estimated' : score === null && components.some((c) => c.value !== null) ? 'partial' : 'unavailable',
      units: 'score',
      source: 'financial statements',
      notes: complete
        ? 'Private-firm Z′; descriptive screen only'
        : 'Incomplete inputs — all-or-null composite withheld',
      value: score,
    }),
  };
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
  meta: AnalyticalMeta;
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
  return {
    score,
    evaluable,
    total: F_TOTAL,
    complete,
    signals,
    band,
    meta: analyticalMeta({
      formulaId: 'scoring.piotroski-f.v1',
      status: complete ? 'estimated' : evaluable === 0 ? 'unavailable' : 'partial',
      units: 'score',
      source: 'financial statements',
      notes: complete
        ? 'Nine-signal checklist; descriptive only'
        : `${evaluable}/${F_TOTAL} signals evaluable — band withheld until complete`,
    }),
  };
}

// --- Beneish M-Score --------------------------------------------------------

export interface MScoreComponent {
  key: string;
  label: string;
  /** The index value (a ratio of year-over-year ratios); null when an input is missing. */
  value: number | null;
  weight: number;
  /** weight × value; null when value is null. */
  contribution: number | null;
}

export interface BeneishMScore {
  /** Total M-Score, or null when any of the eight components could not be computed. */
  score: number | null;
  components: MScoreComponent[];
  /**
   * Relative to the −1.78 threshold: 'elevated' warrants closer scrutiny of earnings
   * quality, 'low' does not. This is a STATISTICAL screen with a high false-positive
   * rate — never an accusation of fraud. Null when score is null.
   */
  flag: 'elevated' | 'low' | null;
  complete: boolean;
  meta: AnalyticalMeta;
}

const M_CONSTANT = -4.84;

/**
 * Beneish M-Score (1999 eight-variable model) — a statistical earnings-manipulation
 * screen comparing the two most recent annual periods. Each index is a ratio of
 * year-over-year ratios; the score is null unless all eight are computable (a partial
 * weighted probit is meaningless). A score above −1.78 flags elevated manipulation
 * risk — a prompt to scrutinize, NOT a conclusion of fraud. Two disclosed simplifications
 * from the published model, both driven by the mapped line items available: AQI uses current
 * assets + net PP&E (omitting long-term securities), and LVGI uses total liabilities ÷ total
 * assets (a double-count-free proxy for the current-liabilities-plus-long-term-debt ratio).
 * Educational analytics only; not investment advice.
 */
export function beneishMScore(cur: PeriodBundle | undefined, prior: PeriodBundle | undefined): BeneishMScore {
  const salesT = lineItem(cur?.income, 'totalRevenue');
  const salesP = lineItem(prior?.income, 'totalRevenue');
  const arT = lineItem(cur?.balance, 'accountsReceivable');
  const arP = lineItem(prior?.balance, 'accountsReceivable');
  const gpT = lineItem(cur?.income, 'grossProfit');
  const gpP = lineItem(prior?.income, 'grossProfit');
  const caT = lineItem(cur?.balance, 'currentAssets');
  const caP = lineItem(prior?.balance, 'currentAssets');
  const ppeT = lineItem(cur?.balance, 'propertyPlantEquipment');
  const ppeP = lineItem(prior?.balance, 'propertyPlantEquipment');
  const taT = lineItem(cur?.balance, 'totalAssets');
  const taP = lineItem(prior?.balance, 'totalAssets');
  const depT = lineItem(cur?.cashFlow, 'depreciationAmortization');
  const depP = lineItem(prior?.cashFlow, 'depreciationAmortization');
  const sgaT = lineItem(cur?.income, 'sellingGeneralAdmin');
  const sgaP = lineItem(prior?.income, 'sellingGeneralAdmin');
  const tlT = lineItem(cur?.balance, 'totalLiabilities');
  const tlP = lineItem(prior?.balance, 'totalLiabilities');
  const niT = lineItem(cur?.income, 'netIncome');
  const cfoT = lineItem(cur?.cashFlow, 'operatingCashFlow');

  const assetQuality = (ca: number | null, ppe: number | null, ta: number | null): number | null =>
    ca === null || ppe === null || ta === null || ta === 0 ? null : 1 - (ca + ppe) / ta;
  const depRate = (dep: number | null, ppe: number | null): number | null =>
    dep === null || ppe === null || dep + ppe === 0 ? null : dep / (dep + ppe);

  const dsri = ratio(ratio(arT, salesT), ratio(arP, salesP));
  const gmi = ratio(ratio(gpP, salesP), ratio(gpT, salesT)); // prior gross margin ÷ current
  const aqi = ratio(assetQuality(caT, ppeT, taT), assetQuality(caP, ppeP, taP));
  const sgi = ratio(salesT, salesP);
  const depi = ratio(depRate(depP, ppeP), depRate(depT, ppeT)); // prior dep-rate ÷ current
  const sgai = ratio(ratio(sgaT, salesT), ratio(sgaP, salesP));
  // LVGI: total liabilities ÷ total assets — a clean, double-count-free proxy for Beneish's
  // (current liabilities + long-term debt) numerator (the mapped totalDebt already includes the
  // current portion that currentLiabilities also carries, so adding them would double-count it).
  const lvgi = ratio(ratio(tlT, taT), ratio(tlP, taP));
  const tata = niT === null || cfoT === null || taT === null || taT === 0 ? null : (niT - cfoT) / taT;

  const comp = (key: string, label: string, value: number | null, weight: number): MScoreComponent => ({
    key,
    label,
    value,
    weight,
    contribution: value === null ? null : weight * value,
  });

  const components: MScoreComponent[] = [
    comp('dsri', 'Days sales in receivables index (DSRI)', dsri, 0.92),
    comp('gmi', 'Gross margin index (GMI)', gmi, 0.528),
    comp('aqi', 'Asset quality index (AQI)', aqi, 0.404),
    comp('sgi', 'Sales growth index (SGI)', sgi, 0.892),
    comp('depi', 'Depreciation index (DEPI)', depi, 0.115),
    comp('sgai', 'SG&A index (SGAI)', sgai, -0.172),
    comp('tata', 'Total accruals to total assets (TATA)', tata, 4.679),
    comp('lvgi', 'Leverage index (LVGI)', lvgi, -0.327),
  ];

  const complete = components.every((c) => c.contribution !== null);
  const score = complete ? round2(M_CONSTANT + components.reduce((s, c) => s + (c.contribution as number), 0)) : null;
  const flag = score === null ? null : score > -1.78 ? 'elevated' : 'low';
  return {
    score,
    components,
    flag,
    complete,
    meta: analyticalMeta({
      formulaId: 'scoring.beneish-m.v1',
      status: complete ? 'estimated' : score === null && components.some((c) => c.value !== null) ? 'partial' : 'unavailable',
      units: 'score',
      source: 'financial statements',
      notes: complete
        ? 'Beneish M; statistical screen only — never an accusation of fraud'
        : 'Incomplete indices — all-or-null composite withheld',
      value: score,
    }),
  };
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
  beneishM: BeneishMScore;
  /** True when fewer than two annual periods were available (F-Score deltas limited). */
  insufficientHistory: boolean;
}

/**
 * Compute the Altman Z′, Piotroski F, and Beneish M scores from a set of financial
 * statements. Only ANNUAL periods are used (all three are annual metrics); the two most
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
    beneishM: beneishMScore(cur, prior),
    insufficientHistory: !prior,
  };
}
