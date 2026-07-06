import {
  NO_CAPABILITIES,
  type DataProvenance,
  type Envelope,
  type Filing,
  type FilingDocument,
  type FinancialStatement,
  type ProviderDescriptor,
  type StatementLineItem,
  type StatementType,
} from '@tyche/contracts';
import { StubProvider, type FinancialsQuery } from '../Provider';
import { ProviderError } from '../errors';
import { MemoryCache, type CacheStore } from '../cache';
import { makeProvenance, withProvenance } from '../provenance';

/** Minimal fetch surface so the provider is testable with an injected stub. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface SecEdgarProviderOptions {
  /** Descriptive User-Agent, required by the SEC fair-access policy. */
  userAgent: string;
  cache?: CacheStore;
  fetchImpl?: FetchLike;
  /** Minimum spacing between EDGAR requests (politeness throttle). */
  minIntervalMs?: number;
}

interface TickerMapEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SubmissionsRecent {
  form?: string[];
  filingDate?: string[];
  reportDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}

interface Submissions {
  name?: string;
  filings?: { recent?: SubmissionsRecent };
}

/** One XBRL data point in a company-facts concept (data.sec.gov/api/xbrl/companyfacts). */
interface XbrlFact {
  /** Present for duration facts (income/cash-flow); absent for instants (balance sheet). */
  start?: string;
  end: string;
  val: number;
  accn?: string;
  /** Fiscal year / period as filed. */
  fy?: number;
  fp?: string;
  form?: string;
  /** SEC-assigned calendar frame, e.g. CY2024 / CY2024Q3 / CY2024Q4I. */
  frame?: string;
  filed?: string;
}

type UsGaap = Record<string, { units?: Record<string, XbrlFact[]> }>;

interface CompanyFacts {
  facts?: { 'us-gaap'?: UsGaap };
}

const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;
const SUBMISSIONS_TTL = 15 * 60 * 1000;
/** Fundamentals change only on filings, so a company-facts document caches for hours. */
const COMPANYFACTS_TTL = 6 * 60 * 60 * 1000;

/**
 * SEC EDGAR provider — real `filings` capability over the public EDGAR HTTP API.
 * Public + key-free, but the SEC fair-access policy requires a descriptive
 * User-Agent, so the provider refuses to construct without one. All other
 * capabilities inherit the throwing {@link StubProvider} defaults, so the
 * provider registry routes them to another provider (e.g. mock).
 */
export class SecEdgarProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'secedgar',
    mode: 'public',
    capabilities: { ...NO_CAPABILITIES, filings: true, fundamentals: true },
    freshness: [
      { capability: 'filings', tier: 'eod' },
      { capability: 'fundamentals', tier: 'eod' },
    ],
    attribution: 'U.S. Securities and Exchange Commission — EDGAR',
    attributionRequired: false,
    homepage: 'https://www.sec.gov/edgar',
    description:
      'SEC EDGAR filings index + XBRL company-facts fundamentals (public, US issuers). Requires a descriptive User-Agent.',
    requiresConfiguration: true,
  };

  private readonly userAgent: string;
  private readonly cache: CacheStore;
  private readonly fetchImpl: FetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: SecEdgarProviderOptions) {
    super();
    if (!options.userAgent || options.userAgent.trim().length === 0) {
      throw new ProviderError(
        'secedgar',
        'SEC EDGAR requires a descriptive User-Agent (SEC_EDGAR_USER_AGENT).',
      );
    }
    this.userAgent = options.userAgent;
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 120;
  }

  override async getFilings(symbol: string, limit = 20): Promise<Envelope<Filing[]>> {
    const cik10 = await this.resolveCik(symbol);
    if (!cik10) return withProvenance([], this.provenance(false));

    const cacheKey = `edgar:submissions:${cik10}`;
    let submissions = await this.cache.get<Submissions>(cacheKey);
    const cacheHit = submissions !== undefined;
    if (!submissions) {
      submissions = await this.getJson<Submissions>(
        `https://data.sec.gov/submissions/CIK${cik10}.json`,
      );
      await this.cache.set(cacheKey, submissions, SUBMISSIONS_TTL);
    }

    const recent = submissions.filings?.recent ?? {};
    const issuer = submissions.name ?? symbol.toUpperCase();
    const cikInt = String(Number(cik10));
    const count = recent.accessionNumber?.length ?? 0;
    const filings: Filing[] = [];

    for (let i = 0; i < count; i++) {
      const accession = recent.accessionNumber?.[i];
      if (!accession) continue;
      const form = recent.form?.[i] ?? '';
      const filingDate = recent.filingDate?.[i] ?? '';
      const reportDate = recent.reportDate?.[i] ?? '';
      const primaryDoc = recent.primaryDocument?.[i] ?? '';
      const url = primaryDoc
        ? `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accession.replace(/-/g, '')}/${primaryDoc}`
        : undefined;
      const documents: FilingDocument[] = primaryDoc
        ? [
            {
              type: 'primary',
              description: recent.primaryDocDescription?.[i] || form,
              ...(url ? { url } : {}),
            },
          ]
        : [];

      filings.push({
        id: `${cik10}-${accession}`,
        symbol: symbol.toUpperCase(),
        form,
        title: `${issuer} — ${form}`,
        filedAt: filingDate ? `${filingDate}T00:00:00.000Z` : new Date().toISOString(),
        ...(reportDate ? { periodOfReport: reportDate } : {}),
        accessionNumber: accession,
        ...(url ? { url } : {}),
        documents,
      });
    }

    filings.sort((a, b) => Date.parse(b.filedAt) - Date.parse(a.filedAt));
    return withProvenance(
      filings.slice(0, limit),
      this.provenance(cacheHit, `https://data.sec.gov/submissions/CIK${cik10}.json`),
    );
  }

  /**
   * Real `fundamentals` over SEC XBRL company-facts. Resolves the ticker to a
   * CIK, fetches the company-facts document once (cached), and maps a fixed set
   * of us-gaap concepts onto the SAME lineItem keys/labels/order the mock emits,
   * so the FA matrix renders identically. Missing values stay `null` (never
   * fabricated); a data gap (unknown ticker, no us-gaap taxonomy, or a company-
   * facts fetch failure) returns an empty-but-valid envelope rather than an error.
   * US issuers only (foreign IFRS filers have no us-gaap facts).
   */
  override async getFinancials(
    symbol: string,
    query: FinancialsQuery = {},
  ): Promise<Envelope<FinancialStatement[]>> {
    const period: 'annual' | 'quarterly' = query.period === 'quarterly' ? 'quarterly' : 'annual';
    const cik10 = await this.resolveCik(symbol);
    if (!cik10) return withProvenance([], this.provenance(false, undefined, 'fundamentals'));

    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
    const cacheKey = `edgar:companyfacts:${cik10}`;
    let facts = await this.cache.get<CompanyFacts>(cacheKey);
    const cacheHit = facts !== undefined;
    if (!facts) {
      try {
        facts = await this.getJson<CompanyFacts>(url);
      } catch (err) {
        // A missing/blocked company-facts document is a data gap, not a server
        // fault — surface an empty statement set (mock philosophy), not a 502.
        if (err instanceof ProviderError) {
          return withProvenance([], this.provenance(false, url, 'fundamentals'));
        }
        throw err;
      }
      await this.cache.set(cacheKey, facts, COMPANYFACTS_TTL);
    }

    const gaap = facts.facts?.['us-gaap'];
    if (!gaap || Object.keys(gaap).length === 0) {
      return withProvenance([], this.provenance(cacheHit, url, 'fundamentals'));
    }

    const statements = this.buildFinancialStatements(gaap, symbol.toUpperCase(), period);
    const filtered = query.type ? statements.filter((s) => s.type === query.type) : statements;
    return withProvenance(filtered, this.provenance(cacheHit, url, 'fundamentals'));
  }

  // --- internals -----------------------------------------------------------

  /**
   * Map us-gaap concepts onto FinancialStatement[] (income/balance/cash_flow),
   * mirroring the mock's lineItem key set/order so the FA matrix stays aligned.
   * Concepts resolve with priority fallbacks; a handful of standard lines are
   * computed (gross profit, total liabilities, total debt, free cash flow), and
   * SEC's positive-outflow conventions are negated to match the mock's signs.
   */
  private buildFinancialStatements(
    gaap: UsGaap,
    symbol: string,
    period: 'annual' | 'quarterly',
  ): FinancialStatement[] {
    const meta = new Map<string, { end: string; year: number; quarter?: number }>();
    const series = (concepts: string[], unit = 'USD'): Map<string, number> => {
      for (const concept of concepts) {
        const raw = gaap[concept]?.units?.[unit];
        if (!Array.isArray(raw) || raw.length === 0) continue;
        const picked = this.selectFacts(raw, period);
        if (picked.size === 0) continue;
        const values = new Map<string, number>();
        for (const [key, p] of picked) {
          values.set(key, p.value);
          if (!meta.has(key)) meta.set(key, { end: p.end, year: p.year, ...(p.quarter ? { quarter: p.quarter } : {}) });
        }
        return values;
      }
      return new Map();
    };

    const revenue = series(['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet']);
    const cost = series(['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold']);
    const grossProfit = series(['GrossProfit']);
    const operatingIncome = series(['OperatingIncomeLoss']);
    const netIncome = series(['NetIncomeLoss', 'ProfitLoss']);
    const eps = series(['EarningsPerShareDiluted', 'EarningsPerShareBasic'], 'USD/shares');
    const assets = series(['Assets']);
    const liabilities = series(['Liabilities']);
    const liabAndEquity = series(['LiabilitiesAndStockholdersEquity']);
    const equity = series(['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
    const cash = series(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
    const ltDebtNoncurrent = series(['LongTermDebtNoncurrent']);
    const ltDebtCurrent = series(['LongTermDebtCurrent', 'DebtCurrent']);
    const ltDebt = series(['LongTermDebt']);
    const ocf = series(['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']);
    const capex = series(['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
    const dividends = series(['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends']);

    const cap = period === 'annual' ? 3 : 4;
    const periodsOf = (...anchors: Map<string, number>[]): string[] => {
      const keys = new Set<string>();
      for (const s of anchors) for (const k of s.keys()) keys.add(k);
      return [...keys]
        .sort((a, b) => {
          const ma = meta.get(a)!;
          const mb = meta.get(b)!;
          return mb.year - ma.year || (mb.quarter ?? 0) - (ma.quarter ?? 0);
        })
        .slice(0, cap);
    };

    const get = (s: Map<string, number>, k: string): number | null => {
      const v = s.get(k);
      return v !== undefined && Number.isFinite(v) ? v : null;
    };
    const li = (key: string, label: string, value: number | null, order: number): StatementLineItem => ({
      key,
      label,
      value: value !== null && Number.isFinite(value) ? Math.round(value) : null,
      unit: 'USD',
      order,
    });
    const stmt = (type: StatementType, key: string, lineItems: StatementLineItem[]): FinancialStatement => {
      const m = meta.get(key)!;
      return {
        symbol,
        type,
        period,
        fiscalDate: m.end,
        fiscalYear: m.year,
        ...(period === 'quarterly' && m.quarter ? { fiscalQuarter: m.quarter } : {}),
        currency: 'USD',
        lineItems,
      };
    };

    const out: FinancialStatement[] = [];

    for (const k of periodsOf(revenue, netIncome)) {
      const rev = get(revenue, k);
      const cst = get(cost, k);
      const gp = get(grossProfit, k) ?? (rev !== null && cst !== null ? rev - cst : null);
      const epsVal = get(eps, k);
      out.push(
        stmt('income', k, [
          li('totalRevenue', 'Total revenue', rev, 1),
          li('costOfRevenue', 'Cost of revenue', cst, 2),
          li('grossProfit', 'Gross profit', gp, 3),
          li('operatingIncome', 'Operating income', get(operatingIncome, k), 4),
          li('netIncome', 'Net income', get(netIncome, k), 5),
          { key: 'eps', label: 'Diluted EPS', value: epsVal !== null ? Math.round(epsVal * 100) / 100 : null, unit: 'USD', order: 6 },
        ]),
      );
    }

    for (const k of periodsOf(assets, equity)) {
      const lae = get(liabAndEquity, k);
      const eq = get(equity, k);
      const liab = get(liabilities, k) ?? (lae !== null && eq !== null ? lae - eq : null);
      const debtParts = [get(ltDebtNoncurrent, k), get(ltDebtCurrent, k)].filter((v): v is number => v !== null);
      const totalDebt = debtParts.length > 0 ? debtParts.reduce((a, b) => a + b, 0) : get(ltDebt, k);
      out.push(
        stmt('balance', k, [
          li('totalAssets', 'Total assets', get(assets, k), 1),
          li('totalLiabilities', 'Total liabilities', liab, 2),
          li('totalEquity', 'Total equity', eq, 3),
          li('cashAndEquivalents', 'Cash & equivalents', get(cash, k), 4),
          li('totalDebt', 'Total debt', totalDebt, 5),
        ]),
      );
    }

    for (const k of periodsOf(ocf)) {
      const flow = get(ocf, k);
      const capexRaw = get(capex, k); // SEC reports capital outflows as positive
      const divRaw = get(dividends, k);
      out.push(
        stmt('cash_flow', k, [
          li('operatingCashFlow', 'Operating cash flow', flow, 1),
          li('capitalExpenditures', 'Capital expenditures', capexRaw !== null ? -capexRaw : null, 2),
          li('freeCashFlow', 'Free cash flow', flow !== null && capexRaw !== null ? flow - capexRaw : null, 3),
          li('dividendsPaid', 'Dividends paid', divRaw !== null ? -divRaw : null, 4),
        ]),
      );
    }

    return out;
  }

  /**
   * Select one concept's facts for the requested period type and dedupe
   * restatements. Frame-first — SEC's canonical calendar frames (CY2024,
   * CY2024Q3, CY2024Q4I) — with a form + FY fallback for annual facts SEC hasn't
   * framed yet. Quarterly relies on frames only: for off-calendar fiscal years
   * SEC frames are CALENDAR quarters while `fp` is FISCAL, so an `fp` fallback
   * would key the same period twice. Within a period the framed / latest-filed
   * value wins (the most recently restated figure).
   */
  private selectFacts(
    facts: XbrlFact[],
    period: 'annual' | 'quarterly',
  ): Map<string, { value: number; end: string; year: number; quarter?: number }> {
    const groups = new Map<string, { facts: XbrlFact[]; year: number; quarter?: number }>();
    for (const f of facts) {
      const cls = this.classifyFact(f, period);
      if (!cls) continue;
      let g = groups.get(cls.key);
      if (!g) {
        g = { facts: [], year: cls.year, ...(cls.quarter ? { quarter: cls.quarter } : {}) };
        groups.set(cls.key, g);
      }
      g.facts.push(f);
    }
    const out = new Map<string, { value: number; end: string; year: number; quarter?: number }>();
    for (const [key, g] of groups) {
      g.facts.sort((a, b) => {
        const framed = (a.frame ? 1 : 0) - (b.frame ? 1 : 0);
        if (framed !== 0) return -framed; // framed first
        const filed = (b.filed ?? '').localeCompare(a.filed ?? ''); // latest filed first
        if (filed !== 0) return filed;
        return (b.accn ?? '').localeCompare(a.accn ?? '');
      });
      const best = g.facts[0]!;
      out.set(key, { value: best.val, end: best.end, year: g.year, ...(g.quarter ? { quarter: g.quarter } : {}) });
    }
    return out;
  }

  /** Classify an XBRL fact into a period bucket, or null if it doesn't belong. */
  private classifyFact(
    f: XbrlFact,
    period: 'annual' | 'quarterly',
  ): { key: string; year: number; quarter?: number } | null {
    const isInstant = f.start === undefined || f.start === null;
    const durationDays = f.start ? (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000 : 0;

    if (period === 'annual') {
      if (f.frame) {
        const dur = /^CY(\d{4})$/.exec(f.frame);
        if (dur && !isInstant) return { key: dur[1]!, year: Number(dur[1]) };
        const inst = /^CY(\d{4})Q4I$/.exec(f.frame);
        if (inst && isInstant) return { key: inst[1]!, year: Number(inst[1]) };
        return null; // a non-annual frame (quarterly) is not an annual data point
      }
      // Fallback for a just-filed 10-K SEC hasn't framed yet.
      const annualForms = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
      if (f.fp === 'FY' && f.form && annualForms.has(f.form) && (isInstant || (durationDays >= 335 && durationDays <= 400))) {
        const year = f.fy ?? Number(f.end.slice(0, 4));
        return { key: String(year), year };
      }
      return null;
    }

    // Quarterly — frames only (see selectFacts note on fiscal-vs-calendar).
    if (f.frame) {
      const dur = /^CY(\d{4})Q([1-3])$/.exec(f.frame);
      if (dur && !isInstant) return { key: `${dur[1]}Q${dur[2]}`, year: Number(dur[1]), quarter: Number(dur[2]) };
      const inst = /^CY(\d{4})Q([1-4])I$/.exec(f.frame);
      if (inst && isInstant) return { key: `${inst[1]}Q${inst[2]}`, year: Number(inst[1]), quarter: Number(inst[2]) };
    }
    return null;
  }

  private async resolveCik(symbol: string): Promise<string | null> {
    const key = 'edgar:tickermap';
    let map = await this.cache.get<Record<string, string>>(key);
    if (!map) {
      const raw = await this.getJson<Record<string, TickerMapEntry>>(TICKER_MAP_URL);
      map = {};
      for (const entry of Object.values(raw)) {
        if (entry && typeof entry.ticker === 'string') {
          map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, '0');
        }
      }
      await this.cache.set(key, map, TICKER_MAP_TTL);
    }
    return map[symbol.toUpperCase()] ?? null;
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.throttle(() =>
      this.fetchImpl(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
      }),
    );
    if (!res.ok) throw new ProviderError('secedgar', `EDGAR responded ${res.status} for ${url}`);
    return (await res.json()) as T;
  }

  /** Serialize EDGAR calls and enforce a minimum spacing between them. */
  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastCallAt = Date.now();
      return fn();
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private provenance(cacheHit: boolean, sourceUrl?: string, capability = 'filings'): DataProvenance {
    return makeProvenance({
      provider: 'secedgar',
      providerMode: 'public',
      capability,
      tier: 'eod',
      attribution: 'U.S. Securities and Exchange Commission — EDGAR',
      cacheHit,
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }
}
