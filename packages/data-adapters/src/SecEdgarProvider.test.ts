import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { FilingSchema, FinancialStatementSchema } from '@tyche/contracts';
import { SecEdgarProvider, type FetchLike } from './stubs/SecEdgarProvider';
import { MemoryCache } from './cache';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';

const TICKER_MAP = { '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } };
const SUBMISSIONS = {
  name: 'Apple Inc.',
  filings: {
    recent: {
      form: ['10-K', '8-K'],
      filingDate: ['2025-11-01', '2025-10-15'],
      reportDate: ['2025-09-27', ''],
      accessionNumber: ['0000320193-25-000001', '0000320193-25-000002'],
      primaryDocument: ['aapl-20250927.htm', 'ex99.htm'],
      primaryDocDescription: ['Annual report', 'Current report'],
    },
  },
};

// Minimal AAPL us-gaap company-facts tree. Annual durations carry CY frames;
// AAPL's ~Sep-28 fiscal year-end means SEC frames its balance-sheet instants
// CYyyyyQ3I (calendar Q3), NOT Q4I — regression guard for the non-December
// fiscal-year balance-sheet bug. Revenue 2024 has a second, unframed
// comparative (later filed, different value) to exercise frame dedupe;
// GrossProfit is intentionally absent to exercise the computed fallback.
const dur = (year: number, val: number, frame?: string, over: Record<string, unknown> = {}) => ({
  start: `${year - 1}-10-01`,
  end: `${year}-09-28`,
  val,
  form: '10-K',
  fp: 'FY',
  fy: year,
  filed: `${year}-11-01`,
  accn: `acc-${year}`,
  ...(frame ? { frame } : {}),
  ...over,
});
const inst = (year: number, val: number) => ({
  end: `${year}-09-28`,
  val,
  form: '10-K',
  fp: 'FY',
  fy: year,
  filed: `${year}-11-01`,
  accn: `acc-${year}`,
  frame: `CY${year}Q3I`, // Sep year-end → calendar Q3, not Q4
});
const usd = (facts: unknown[]) => ({ units: { USD: facts } });

const COMPANYFACTS = {
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: usd([
        dur(2024, 391_035, 'CY2024'),
        // Unframed later-filed comparative for 2024 — the framed value must win.
        dur(2024, 390_000, undefined, { filed: '2025-11-01', accn: 'acc-2025c' }),
        dur(2023, 383_285, 'CY2023'),
      ]),
      CostOfRevenue: usd([dur(2024, 210_352, 'CY2024'), dur(2023, 214_137, 'CY2023')]),
      OperatingIncomeLoss: usd([dur(2024, 123_216, 'CY2024'), dur(2023, 114_301, 'CY2023')]),
      NetIncomeLoss: usd([dur(2024, 93_736, 'CY2024'), dur(2023, 96_995, 'CY2023')]),
      EarningsPerShareDiluted: { units: { 'USD/shares': [dur(2024, 6.08, 'CY2024'), dur(2023, 6.13, 'CY2023')] } },
      Assets: usd([inst(2024, 364_980)]),
      Liabilities: usd([inst(2024, 308_030)]),
      StockholdersEquity: usd([inst(2024, 56_950)]),
      CashAndCashEquivalentsAtCarryingValue: usd([inst(2024, 29_943)]),
      LongTermDebtNoncurrent: usd([inst(2024, 85_750)]),
      NetCashProvidedByUsedInOperatingActivities: usd([dur(2024, 118_254, 'CY2024')]),
      PaymentsToAcquirePropertyPlantAndEquipment: usd([dur(2024, 9_447, 'CY2024')]),
      PaymentsOfDividendsCommonStock: usd([dur(2024, 15_234, 'CY2024')]),
    },
  },
};

function makeFetch(headerSink: Array<Record<string, string>> = []): FetchLike {
  return (url, init) => {
    if (init?.headers) headerSink.push(init.headers);
    const body = url.includes('company_tickers')
      ? TICKER_MAP
      : url.includes('companyfacts')
        ? COMPANYFACTS
        : url.includes('submissions/CIK')
          ? SUBMISSIONS
          : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
}

const ua = 'Tyche Test test@example.com';

describe('SecEdgarProvider', () => {
  it('refuses to construct without a User-Agent', () => {
    expect(() => new SecEdgarProvider({ userAgent: '' })).toThrow(/User-Agent/);
  });

  it('maps EDGAR submissions to schema-valid Filing[] with provenance', async () => {
    const headers: Array<Record<string, string>> = [];
    const provider = new SecEdgarProvider({
      userAgent: ua,
      fetchImpl: makeFetch(headers),
      cache: new MemoryCache(),
      minIntervalMs: 0,
    });
    const { data, provenance } = await provider.getFilings('aapl');
    expect(data).toHaveLength(2);
    expect(data[0]?.form).toBe('10-K'); // newest first
    expect(data[0]?.url).toContain(
      'Archives/edgar/data/320193/000032019325000001/aapl-20250927.htm',
    );
    expect(z.array(FilingSchema).safeParse(data).success).toBe(true);
    expect(provenance.provider).toBe('secedgar');
    expect(provenance.providerMode).toBe('public');
    expect(provenance.sourceUrl).toContain('data.sec.gov');
    expect(headers.every((h) => h['User-Agent']?.includes('test@example.com'))).toBe(true);
  });

  it('returns empty (no throw) for an unknown ticker', async () => {
    const provider = new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch(), minIntervalMs: 0 });
    const { data } = await provider.getFilings('ZZZZ');
    expect(data).toEqual([]);
  });

  it('respects the limit', async () => {
    const provider = new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch(), minIntervalMs: 0 });
    const { data } = await provider.getFilings('AAPL', 1);
    expect(data).toHaveLength(1);
  });

  it('passes conformance for filings + fundamentals capabilities', async () => {
    const provider = new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch(), minIntervalMs: 0 });
    const report = await checkProviderConformance(provider, { equitySymbol: 'AAPL', cryptoSymbol: 'AAPL' });
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });
});

describe('SecEdgarProvider fundamentals (company-facts)', () => {
  const provider = () =>
    new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch(), cache: new MemoryCache(), minIntervalMs: 0 });

  it('maps company-facts to schema-valid FinancialStatement[] with provenance', async () => {
    const headers: Array<Record<string, string>> = [];
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch(headers), cache: new MemoryCache(), minIntervalMs: 0 });
    const { data, provenance } = await p.getFinancials('aapl');
    expect(z.array(FinancialStatementSchema).safeParse(data).success).toBe(true);
    expect(provenance.provider).toBe('secedgar');
    expect(provenance.providerMode).toBe('public');
    expect(provenance.capability).toBe('fundamentals');
    expect(provenance.freshness.tier).toBe('eod');
    expect(provenance.sourceUrl).toContain('data.sec.gov/api/xbrl/companyfacts');
    expect(headers.every((h) => h['User-Agent']?.includes('test@example.com'))).toBe(true);
  });

  it('builds income/balance/cash-flow with the expected keys, computed rows, and SEC sign conventions', async () => {
    const { data } = await provider().getFinancials('AAPL');
    const income = data.filter((s) => s.type === 'income');
    const balance = data.filter((s) => s.type === 'balance');
    const cash = data.filter((s) => s.type === 'cash_flow');
    expect(income).toHaveLength(2); // FY2024, FY2023
    expect(balance).toHaveLength(1);
    expect(cash).toHaveLength(1);

    const fy24 = income.find((s) => s.fiscalYear === 2024)!;
    const val = (s: (typeof data)[number], key: string) => s.lineItems.find((l) => l.key === key)?.value;
    expect(fy24.lineItems.map((l) => l.key)).toEqual(['totalRevenue', 'costOfRevenue', 'grossProfit', 'operatingIncome', 'netIncome', 'eps']);
    expect(val(fy24, 'totalRevenue')).toBe(391_035); // framed value wins over the unframed comparative (390000)
    expect(val(fy24, 'grossProfit')).toBe(391_035 - 210_352); // GrossProfit untagged -> computed
    expect(val(fy24, 'eps')).toBe(6.08); // per-share, not rounded to integer

    // Balance sheet is populated despite the Sep year-end instant being framed
    // Q3I (not Q4I) — the non-December fiscal-year regression.
    expect(balance).toHaveLength(1);
    const bal = balance[0]!;
    expect(bal.lineItems.map((l) => l.key)).toEqual(['totalAssets', 'totalLiabilities', 'totalEquity', 'cashAndEquivalents', 'totalDebt']);
    expect(val(bal, 'totalAssets')).toBe(364_980);
    expect(val(bal, 'totalLiabilities')).toBe(308_030);
    expect(val(bal, 'totalDebt')).toBe(85_750); // from LongTermDebtNoncurrent
    expect(bal.fiscalQuarter).toBeUndefined(); // annual omits the quarter

    const cf = cash[0]!;
    expect(val(cf, 'capitalExpenditures')).toBe(-9_447); // SEC positive outflow -> negated
    expect(val(cf, 'freeCashFlow')).toBe(118_254 - 9_447);
    expect(val(cf, 'dividendsPaid')).toBe(-15_234);
  });

  it('filters by statement type', async () => {
    const { data } = await provider().getFinancials('AAPL', { type: 'income' });
    expect(data.every((s) => s.type === 'income')).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('returns empty (no throw) for an unknown ticker', async () => {
    const { data } = await provider().getFinancials('ZZZZ');
    expect(data).toEqual([]);
  });

  it('aligns an off-calendar (June) fiscal year by period-end year, without duplicate columns', async () => {
    // FY2024 ends 2024-06-30; SEC frames the annual duration CY2023 (calendar
    // best-fit) while unframed facts carry fy=2024, and the balance instant is
    // framed CY2024Q2I. All must collapse to ONE 2024 column.
    const offCal = {
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [{ start: '2023-07-01', end: '2024-06-30', val: 245_000, form: '10-K', fp: 'FY', fy: 2024, frame: 'CY2023', filed: '2024-07-30', accn: 'm1' }],
            },
          },
          NetIncomeLoss: {
            units: {
              USD: [{ start: '2023-07-01', end: '2024-06-30', val: 88_000, form: '10-K', fp: 'FY', fy: 2024, filed: '2024-07-30', accn: 'm1' }],
            },
          },
          Assets: {
            units: { USD: [{ end: '2024-06-30', val: 500_000, form: '10-K', fp: 'FY', fy: 2024, frame: 'CY2024Q2I', filed: '2024-07-30', accn: 'm1' }] },
          },
        },
      },
    };
    const fetchImpl: FetchLike = (url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(url.includes('company_tickers') ? TICKER_MAP : url.includes('companyfacts') ? offCal : {}),
      });
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data } = await p.getFinancials('AAPL');
    const income = data.filter((s) => s.type === 'income');
    expect(income).toHaveLength(1); // ONE period, not two (frame-year 2023 vs fy 2024)
    expect(income[0]!.fiscalYear).toBe(2024);
    expect(income[0]!.lineItems.find((l) => l.key === 'totalRevenue')?.value).toBe(245_000);
    expect(income[0]!.lineItems.find((l) => l.key === 'netIncome')?.value).toBe(88_000);
    const balance = data.filter((s) => s.type === 'balance');
    expect(balance).toHaveLength(1); // Q2I instant recognized (not just Q4I)
    expect(balance[0]!.fiscalYear).toBe(2024);
  });

  it('degrades an unparseable (non-JSON) company-facts body to empty', async () => {
    const badBody: FetchLike = (url) =>
      url.includes('companyfacts')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.includes('company_tickers') ? TICKER_MAP : {}) });
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: badBody, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data } = await p.getFinancials('AAPL');
    expect(data).toEqual([]);
  });

  it('returns empty when the company has no us-gaap facts', async () => {
    const emptyFacts: FetchLike = (url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(url.includes('company_tickers') ? TICKER_MAP : url.includes('companyfacts') ? { facts: {} } : {}),
      });
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: emptyFacts, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data, provenance } = await p.getFinancials('AAPL');
    expect(data).toEqual([]);
    expect(provenance.capability).toBe('fundamentals');
  });

  it('degrades a company-facts fetch failure to empty, not a throw', async () => {
    const failing: FetchLike = (url) =>
      url.includes('companyfacts')
        ? Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.includes('company_tickers') ? TICKER_MAP : {}) });
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: failing, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data } = await p.getFinancials('AAPL');
    expect(data).toEqual([]);
  });
});

describe('provider registry routing for EDGAR', () => {
  it('routes filings + fundamentals to secedgar when enabled with a User-Agent', () => {
    const registry = createProviderRegistry({ providers: ['secedgar'], secEdgarUserAgent: ua });
    expect(registry.forCapability('filings')?.descriptor.name).toBe('secedgar');
    expect(registry.forCapability('fundamentals')?.descriptor.name).toBe('secedgar');
    expect(registry.get('mock')).toBeDefined();
  });

  it('falls back to mock filings + fundamentals when no User-Agent is configured', () => {
    const registry = createProviderRegistry({ providers: ['secedgar'] });
    expect(registry.forCapability('filings')?.descriptor.name).toBe('mock');
    expect(registry.forCapability('fundamentals')?.descriptor.name).toBe('mock');
  });
});
