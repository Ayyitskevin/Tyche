import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { FilingSchema, FilingSearchHitSchema, FinancialStatementSchema, InstitutionalPortfolioSchema, InstitutionalChangesSchema, type InstitutionalHolding } from '@tyche/contracts';
import { SecEdgarProvider, parseForm4, parseInfoTable, buildPortfolio, diffPortfolios, type ParsedHolding, type FetchLike } from './stubs/SecEdgarProvider';
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
      // 10-K has no items; the 8-K is tagged with two (results + exhibits).
      items: ['', '2.02,9.01'],
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
      ResearchAndDevelopmentExpense: usd([dur(2024, 31_370, 'CY2024'), dur(2023, 29_915, 'CY2023')]),
      SellingGeneralAndAdministrativeExpense: usd([dur(2024, 26_097, 'CY2024')]),
      OperatingIncomeLoss: usd([dur(2024, 123_216, 'CY2024'), dur(2023, 114_301, 'CY2023')]),
      InterestExpense: usd([dur(2024, 3_933, 'CY2024')]),
      IncomeTaxExpenseBenefit: usd([dur(2024, 29_749, 'CY2024')]),
      NetIncomeLoss: usd([dur(2024, 93_736, 'CY2024'), dur(2023, 96_995, 'CY2023')]),
      EarningsPerShareDiluted: { units: { 'USD/shares': [dur(2024, 6.08, 'CY2024'), dur(2023, 6.13, 'CY2023')] } },
      Assets: usd([inst(2024, 364_980)]),
      AssetsCurrent: usd([inst(2024, 152_987)]),
      InventoryNet: usd([inst(2024, 7_286)]),
      Liabilities: usd([inst(2024, 308_030)]),
      LiabilitiesCurrent: usd([inst(2024, 176_392)]),
      StockholdersEquity: usd([inst(2024, 56_950)]),
      RetainedEarningsAccumulatedDeficit: usd([inst(2024, -19_154)]),
      CommonStockSharesOutstanding: { units: { shares: [inst(2024, 15_115_823)] } },
      AccountsReceivableNetCurrent: usd([inst(2024, 66_243)]),
      PropertyPlantAndEquipmentNet: usd([inst(2024, 45_680)]),
      CashAndCashEquivalentsAtCarryingValue: usd([inst(2024, 29_943)]),
      LongTermDebtNoncurrent: usd([inst(2024, 85_750)]),
      NetCashProvidedByUsedInOperatingActivities: usd([dur(2024, 118_254, 'CY2024')]),
      DepreciationDepletionAndAmortization: usd([dur(2024, 11_445, 'CY2024')]),
      ShareBasedCompensation: usd([dur(2024, 11_688, 'CY2024')]),
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
    expect(data[0]?.items).toEqual([]); // 10-K carries no 8-K items
    expect(data[1]?.form).toBe('8-K');
    expect(data[1]?.items).toEqual(['2.02', '9.01']); // "2.02,9.01" split into codes
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

const SUBMISSIONS_13F = {
  name: 'BERKSHIRE HATHAWAY INC',
  filings: {
    recent: {
      // A NEWER 13F-HR/A amendment precedes the full 13F-HR — the adapter must select the
      // FULL report (2024-03-31), not the newest amendment (which may be a partial NEWHOLDINGS).
      form: ['13F-HR/A', '13F-HR', '13F-HR'],
      filingDate: ['2024-08-14', '2024-05-15', '2024-02-14'],
      reportDate: ['2024-06-30', '2024-03-31', '2023-12-31'],
      accessionNumber: ['0000950123-24-009999', '0000950123-24-005678', '0000950123-24-000001'],
      primaryDocument: ['primary_doc.xml', 'primary_doc.xml', 'primary_doc.xml'],
      primaryDocDescription: ['13F-HR/A', '13F-HR', '13F-HR'],
    },
  },
};
const INDEX_13F = {
  directory: {
    item: [
      { name: 'primary_doc.xml', type: '13F-HR' },
      { name: '0000950123-24-005678-index.htm', type: 'index' },
      { name: 'infotable.xml', type: 'INFORMATION TABLE' },
    ],
  },
};
// Default-namespace (unprefixed elements) info table with a duplicate APPLE line
// to exercise CUSIP aggregation, plus BAC — values in whole dollars (current convention).
const INFOTABLE_XML = `<?xml version="1.0"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>135360000000</value><shrsOrPrnAmt><sshPrnamt>789368450</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>BANK OF AMERICA CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>060505104</cusip><value>39166000000</value><shrsOrPrnAmt><sshPrnamt>1032852006</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>5000000000</value><shrsOrPrnAmt><sshPrnamt>10000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
</informationTable>`;

function makeFetch13F(): FetchLike {
  const json = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
  const text = (s: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(s) });
  return (url) => {
    if (url.includes('submissions/CIK0001067983')) return json(SUBMISSIONS_13F);
    if (url.includes('submissions/CIK0000320193')) return json(SUBMISSIONS); // has no 13F-HR
    if (url.includes('index.json')) return json(INDEX_13F);
    if (/\.xml(\?|$)/i.test(url)) return text(INFOTABLE_XML);
    return json({});
  };
}

describe('parseInfoTable', () => {
  it('is namespace-tolerant and skips rows missing an issuer/CUSIP', () => {
    const xml = `<ns1:informationTable><ns1:infoTable><ns1:nameOfIssuer>FOO CORP</ns1:nameOfIssuer><ns1:cusip>123456789</ns1:cusip><ns1:value>1000</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>50</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt></ns1:infoTable><ns1:infoTable><ns1:value>9</ns1:value></ns1:infoTable></ns1:informationTable>`;
    const rows = parseInfoTable(xml);
    expect(rows).toHaveLength(1); // the issuer/CUSIP-less second row is dropped
    expect(rows[0]).toMatchObject({ issuer: 'FOO CORP', cusip: '123456789', value: 1000, shares: 50, sharesType: 'SH' });
  });

  it('reads a put/call option overlay', () => {
    const xml = `<infoTable><nameOfIssuer>SPY</nameOfIssuer><cusip>78462F103</cusip><value>500</value><shrsOrPrnAmt><sshPrnamt>100</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Put</putCall></infoTable>`;
    expect(parseInfoTable(xml)[0]?.putCall).toBe('Put');
  });
});

describe('buildPortfolio', () => {
  const row = (o: Partial<ParsedHolding> & { cusip: string; value: number }): ParsedHolding => ({
    issuer: 'X CORP',
    titleOfClass: 'COM',
    shares: 1,
    sharesType: 'SH',
    putCall: null,
    ...o,
  });

  it('keeps an option overlay separate from the common line on the same CUSIP', () => {
    const p = buildPortfolio('M', '0000000001', [
      row({ cusip: '111', value: 100, shares: 10 }), // common
      row({ cusip: '111', value: 30, shares: 3, putCall: 'Put' }), // put overlay, same CUSIP
    ], 50);
    expect(p.positionCount).toBe(2); // NOT merged into one line
    const long = p.holdings.find((h) => !h.putCall)!;
    const put = p.holdings.find((h) => h.putCall === 'Put')!;
    expect(long.value).toBe(100); // common line not inflated by the option notional
    expect(put.value).toBe(30);
    expect(put.putCall).toBe('Put'); // the tag is not lost/mislabeled
  });

  it('still aggregates genuinely identical positions (same CUSIP/type) across accounts', () => {
    const p = buildPortfolio('M', '1', [
      row({ cusip: '222', value: 40, shares: 4 }),
      row({ cusip: '222', value: 60, shares: 6 }),
    ], 50);
    expect(p.positionCount).toBe(1);
    expect(p.holdings[0]!.value).toBe(100);
    expect(p.holdings[0]!.weightPercent).toBe(100);
  });

  it('scales a pre-2023 (thousands) filing to whole dollars; weight is unchanged', () => {
    const p = buildPortfolio('M', '1', [row({ cusip: '333', value: 1000 })], 50, '2019-12-31', '2020-02-14');
    expect(p.totalValue).toBe(1_000_000); // 1000 thousands → whole dollars
    expect(p.holdings[0]!.value).toBe(1_000_000);
    expect(p.holdings[0]!.weightPercent).toBe(100); // ratio unaffected by the scale
  });

  it('leaves a post-2023 filing in whole dollars as reported', () => {
    const p = buildPortfolio('M', '1', [row({ cusip: '444', value: 5000 })], 50, '2024-03-31', '2024-05-15');
    expect(p.totalValue).toBe(5000);
  });
});

describe('SecEdgarProvider institutional holdings (13F-HR)', () => {
  const provider = () =>
    new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch13F(), cache: new MemoryCache(), minIntervalMs: 0 });

  it('parses the latest 13F-HR into an aggregated, weight-ranked portfolio', async () => {
    const { data, provenance } = await provider().getInstitutionalHoldings('BERKSHIRE');
    expect(InstitutionalPortfolioSchema.safeParse(data).success).toBe(true);
    expect(data.manager).toBe('BERKSHIRE HATHAWAY INC'); // authoritative EDGAR name, not the alias
    expect(data.cik).toBe('0001067983');
    expect(data.reportDate).toBe('2024-03-31'); // the full 13F-HR, NOT the newer 13F-HR/A amendment
    expect(data.positionCount).toBe(2); // the two APPLE rows aggregate by CUSIP
    const apple = data.holdings[0]!;
    expect(apple.issuer).toBe('APPLE INC');
    expect(apple.value).toBe(140_360_000_000); // 135.36B + 5B merged
    expect(apple.shares).toBe(799_368_450); // 789,368,450 + 10,000,000
    expect(apple.weightPercent).toBeCloseTo(78.18, 1); // 140.36B / 179.526B
    expect(data.holdings[1]!.issuer).toBe('BANK OF AMERICA CORP');
    expect(provenance.capability).toBe('institutionalHoldings');
    expect(provenance.provider).toBe('secedgar');
  });

  it('resolves a raw CIK as well as an alias', async () => {
    const { data } = await provider().getInstitutionalHoldings('1067983');
    expect(data.cik).toBe('0001067983');
    expect(data.holdings.length).toBe(2);
  });

  it('returns an empty portfolio (no throw) for an unknown manager', async () => {
    const { data } = await provider().getInstitutionalHoldings('NOT A FUND');
    expect(data.holdings).toEqual([]);
    expect(data.positionCount).toBe(0);
  });

  it('returns an empty portfolio when the filer has no 13F-HR on file', async () => {
    const { data } = await provider().getInstitutionalHoldings('320193'); // Apple: files 10-K, not 13F
    expect(data.manager).toBe('Apple Inc.');
    expect(data.holdings).toEqual([]);
  });
});

describe('diffPortfolios', () => {
  const h = (o: Partial<InstitutionalHolding> & { cusip: string; shares: number; value: number }): InstitutionalHolding => ({
    issuer: 'X', weightPercent: 0, ...o,
  });

  it('classifies new / added / trimmed / exited and drops unchanged', () => {
    const cur = [
      h({ cusip: 'A', shares: 100, value: 1000 }), // added (prior 50)
      h({ cusip: 'B', shares: 30, value: 300 }), // trimmed (prior 50)
      h({ cusip: 'C', shares: 10, value: 100 }), // new (no prior)
      h({ cusip: 'D', shares: 40, value: 400 }), // unchanged → dropped
    ];
    const pri = [
      h({ cusip: 'A', shares: 50, value: 500 }),
      h({ cusip: 'B', shares: 50, value: 500 }),
      h({ cusip: 'D', shares: 40, value: 400 }),
      h({ cusip: 'E', shares: 20, value: 200 }), // exited (not in cur)
    ];
    const d = diffPortfolios('M', '0000000001', cur, pri, 50);
    expect(InstitutionalChangesSchema.safeParse(d).success).toBe(true);
    expect(d.hasPrior).toBe(true);
    expect([d.newCount, d.addedCount, d.trimmedCount, d.exitedCount]).toEqual([1, 1, 1, 1]);
    expect(d.changes.map((c) => c.cusip)).not.toContain('D'); // unchanged omitted
    const a = d.changes.find((c) => c.cusip === 'A')!;
    expect(a.action).toBe('added');
    expect(a.deltaShares).toBe(50);
    expect(a.deltaPercent).toBe(100); // 50/50
    expect(d.changes.find((c) => c.cusip === 'C')!.action).toBe('new');
    expect(d.changes.find((c) => c.cusip === 'C')!.deltaPercent).toBeNull();
    const e = d.changes.find((c) => c.cusip === 'E')!;
    expect(e.action).toBe('exited');
    expect(e.currentShares).toBe(0);
    expect(e.priorShares).toBe(20);
  });

  it('treats every current position as new when there is no prior report', () => {
    const d = diffPortfolios('M', '1', [h({ cusip: 'A', shares: 1, value: 1 })], null, 50);
    expect(d.hasPrior).toBe(false);
    expect(d.newCount).toBe(1);
    expect(d.changes[0]!.action).toBe('new');
  });

  it('orders changes by absolute USD value moved (most material first)', () => {
    const cur = [h({ cusip: 'BIG', shares: 1, value: 1_000_000 }), h({ cusip: 'SMALL', shares: 1, value: 100 })];
    const d = diffPortfolios('M', '1', cur, null, 50);
    expect(d.changes[0]!.cusip).toBe('BIG');
  });

  it('keeps a put overlay change distinct from the common line on the same CUSIP', () => {
    const cur = [h({ cusip: 'Z', shares: 100, value: 1000 }), h({ cusip: 'Z', shares: 5, value: 50, putCall: 'Put' })];
    const pri = [h({ cusip: 'Z', shares: 100, value: 1000 })]; // common unchanged; the put is new
    const d = diffPortfolios('M', '1', cur, pri, 50);
    expect(d.newCount).toBe(1); // only the put is new
    expect(d.changes.find((c) => c.putCall === 'Put')!.action).toBe('new');
    expect(d.changes.some((c) => !c.putCall)).toBe(false); // the unchanged common is dropped
  });
});

const INFOTABLE_CUR = `<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>120000000000</value><shrsOrPrnAmt><sshPrnamt>800000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>BANK OF AMERICA CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>060505104</cusip><value>38000000000</value><shrsOrPrnAmt><sshPrnamt>1000000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>COCA COLA CO</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>191216100</cusip><value>24000000000</value><shrsOrPrnAmt><sshPrnamt>400000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
</informationTable>`;
const INFOTABLE_PRI = `<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>100000000000</value><shrsOrPrnAmt><sshPrnamt>700000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>BANK OF AMERICA CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>060505104</cusip><value>41000000000</value><shrsOrPrnAmt><sshPrnamt>1100000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>WELLS FARGO CO</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>949746101</cusip><value>10000000000</value><shrsOrPrnAmt><sshPrnamt>200000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
</informationTable>`;

function makeFetch13FChanges(): FetchLike {
  const json = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
  const text = (s: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(s) });
  return (url) => {
    if (url.includes('submissions/CIK0001067983')) return json(SUBMISSIONS_13F);
    if (url.includes('index.json')) return json(INDEX_13F);
    if (/\.xml(\?|$)/i.test(url)) {
      if (url.includes('000095012324000001')) return text(INFOTABLE_PRI); // the prior (older) filing
      return text(INFOTABLE_CUR); // the current filing
    }
    return json({});
  };
}

describe('SecEdgarProvider institutional changes (13F quarter-over-quarter)', () => {
  it('diffs the two latest full 13F-HRs into new / added / trimmed / exited', async () => {
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch13FChanges(), cache: new MemoryCache(), minIntervalMs: 0 });
    const { data, provenance } = await p.getInstitutionalChanges('BERKSHIRE');
    expect(InstitutionalChangesSchema.safeParse(data).success).toBe(true);
    expect(data.manager).toBe('BERKSHIRE HATHAWAY INC');
    expect(data.reportDate).toBe('2024-03-31'); // current = the full 13F-HR
    expect(data.priorReportDate).toBe('2023-12-31'); // prior = the next full report
    expect(data.hasPrior).toBe(true);
    const byCusip = Object.fromEntries(data.changes.map((c) => [c.cusip, c.action]));
    expect(byCusip['037833100']).toBe('added'); // APPLE 800M > 700M
    expect(byCusip['060505104']).toBe('trimmed'); // BAC 1000M < 1100M
    expect(byCusip['191216100']).toBe('new'); // COCA COLA — only in the current filing
    expect(byCusip['949746101']).toBe('exited'); // WELLS FARGO — only in the prior filing
    expect(provenance.capability).toBe('institutionalHoldings');
  });

  it('marks all positions new when the manager has a single 13F-HR (no prior)', async () => {
    const oneReport = {
      name: 'SOLO FUND',
      filings: {
        recent: {
          form: ['13F-HR'],
          filingDate: ['2024-05-15'],
          reportDate: ['2024-03-31'],
          accessionNumber: ['0000950123-24-005678'],
          primaryDocument: ['primary_doc.xml'],
          primaryDocDescription: ['13F-HR'],
        },
      },
    };
    const fetchOne: FetchLike = (url) => {
      if (url.includes('submissions/CIK0001067983')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(oneReport) });
      if (url.includes('index.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(INDEX_13F) });
      if (/\.xml(\?|$)/i.test(url)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(INFOTABLE_CUR) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: fetchOne, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data } = await p.getInstitutionalChanges('1067983');
    expect(data.hasPrior).toBe(false);
    expect(data.exitedCount).toBe(0);
    expect(data.changes.length).toBeGreaterThan(0);
    expect(data.changes.every((c) => c.action === 'new')).toBe(true);
  });

  it('uses the full original 13F-HR as the prior baseline, not a partial /A amendment in between', async () => {
    // Newest-first: current Q1 (full), then a PARTIAL Q4 amendment, then the FULL Q4 original.
    const subs = {
      name: 'BERKSHIRE HATHAWAY INC',
      filings: {
        recent: {
          form: ['13F-HR', '13F-HR/A', '13F-HR'],
          filingDate: ['2024-05-15', '2024-02-20', '2023-11-14'],
          reportDate: ['2024-03-31', '2023-12-31', '2023-12-31'],
          accessionNumber: ['0000950123-24-000010', '0000950123-24-000020', '0000950123-23-000030'],
          primaryDocument: ['primary_doc.xml', 'primary_doc.xml', 'primary_doc.xml'],
          primaryDocDescription: ['13F-HR', '13F-HR/A', '13F-HR'],
        },
      },
    };
    // The partial /A holds ONLY Coca-Cola; the full original holds Apple/BAC/Wells Fargo.
    const PARTIAL = `<informationTable><infoTable><nameOfIssuer>COCA COLA CO</nameOfIssuer><cusip>191216100</cusip><value>1000</value><shrsOrPrnAmt><sshPrnamt>1</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable></informationTable>`;
    const fetchAmend: FetchLike = (url) => {
      const json = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
      const text = (s: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(s) });
      if (url.includes('submissions/CIK0001067983')) return json(subs);
      if (url.includes('index.json')) return json(INDEX_13F);
      if (/\.xml(\?|$)/i.test(url)) {
        if (url.includes('000095012424000020')) return text(PARTIAL); // the partial /A
        if (url.includes('000095012323000030')) return text(INFOTABLE_PRI); // the full Q4 original
        return text(INFOTABLE_CUR); // current Q1
      }
      return json({});
    };
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: fetchAmend, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data } = await p.getInstitutionalChanges('BERKSHIRE');
    const byCusip = Object.fromEntries(data.changes.map((c) => [c.cusip, c.action]));
    // Wells Fargo is in the FULL Q4 original but not the current filing → exited. It is absent
    // from the partial /A, so 'exited' proves the full original was used as the baseline.
    expect(byCusip['949746101']).toBe('exited');
    expect(byCusip['037833100']).toBe('added'); // Apple 800M vs 700M in the full prior
  });

  it('degrades to no-prior when the prior filing loads but its info-table fetch fails', async () => {
    const fetchPriorFails: FetchLike = (url) => {
      const json = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
      const text = (s: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(s) });
      if (url.includes('submissions/CIK0001067983')) return json(SUBMISSIONS_13F);
      if (url.includes('index.json')) return json(INDEX_13F);
      if (/\.xml(\?|$)/i.test(url)) {
        // The prior filing's info-table document is down (503); the current one is fine.
        if (url.includes('000095012324000001')) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
        return text(INFOTABLE_CUR);
      }
      return json({});
    };
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: fetchPriorFails, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data } = await p.getInstitutionalChanges('BERKSHIRE');
    expect(data.hasPrior).toBe(false); // a failed prior is NOT reported as a real baseline
    expect(data.priorReportDate).toBeUndefined();
    expect(data.exitedCount).toBe(0);
    expect(data.changes.every((c) => c.action === 'new')).toBe(true);
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
    expect(fy24.lineItems.map((l) => l.key)).toEqual([
      'totalRevenue',
      'costOfRevenue',
      'grossProfit',
      'researchAndDevelopment',
      'sellingGeneralAdmin',
      'operatingIncome',
      'interestExpense',
      'incomeTaxExpense',
      'netIncome',
      'eps',
    ]);
    expect(val(fy24, 'totalRevenue')).toBe(391_035); // framed value wins over the unframed comparative (390000)
    expect(val(fy24, 'grossProfit')).toBe(391_035 - 210_352); // GrossProfit untagged -> computed
    expect(val(fy24, 'researchAndDevelopment')).toBe(31_370);
    expect(val(fy24, 'incomeTaxExpense')).toBe(29_749);
    expect(val(fy24, 'eps')).toBe(6.08); // per-share, not rounded to integer

    // Balance sheet is populated despite the Sep year-end instant being framed
    // Q3I (not Q4I) — the non-December fiscal-year regression.
    expect(balance).toHaveLength(1);
    const bal = balance[0]!;
    expect(bal.lineItems.map((l) => l.key)).toEqual([
      'totalAssets',
      'currentAssets',
      'cashAndEquivalents',
      'inventory',
      'totalLiabilities',
      'currentLiabilities',
      'totalDebt',
      'totalEquity',
      'retainedEarnings',
      'sharesOutstanding',
      'accountsReceivable',
      'propertyPlantEquipment',
    ]);
    expect(val(bal, 'retainedEarnings')).toBe(-19_154); // accumulated deficit passes through with sign
    expect(val(bal, 'sharesOutstanding')).toBe(15_115_823); // from the 'shares' unit
    expect(val(bal, 'accountsReceivable')).toBe(66_243);
    expect(val(bal, 'propertyPlantEquipment')).toBe(45_680);
    expect(val(bal, 'totalAssets')).toBe(364_980);
    expect(val(bal, 'currentAssets')).toBe(152_987);
    expect(val(bal, 'inventory')).toBe(7_286);
    expect(val(bal, 'totalLiabilities')).toBe(308_030);
    expect(val(bal, 'currentLiabilities')).toBe(176_392);
    expect(val(bal, 'totalDebt')).toBe(85_750); // from LongTermDebtNoncurrent
    expect(bal.fiscalQuarter).toBeUndefined(); // annual omits the quarter

    const cf = cash[0]!;
    expect(val(cf, 'depreciationAmortization')).toBe(11_445);
    expect(val(cf, 'shareBasedCompensation')).toBe(11_688);
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

describe('SecEdgarProvider filing full-text search (EFTS)', () => {
  const EFTS = {
    hits: {
      hits: [
        {
          _id: '0000320193-24-000123:aapl-20240928.htm',
          _source: {
            ciks: ['0000320193'],
            display_names: ['Apple Inc. (AAPL) (CIK 0000320193)'],
            file_date: '2024-11-01',
            file_type: '10-K',
            root_form: '10-K',
          },
        },
        {
          // Missing file_date -> skipped (can't key it).
          _id: '0000320193-24-000200:x.htm',
          _source: { ciks: ['0000320193'], display_names: ['Apple Inc.'], file_type: '8-K' },
        },
      ],
    },
  };
  const eftsFetch =
    (body: unknown): FetchLike =>
    (url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(url.includes('efts.sec.gov') ? body : {}),
      });

  it('maps EFTS hits to schema-valid FilingSearchHit[] with a direct document URL', async () => {
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: eftsFetch(EFTS), minIntervalMs: 0 });
    const { data, provenance } = await p.searchFilings({ query: 'climate risk', forms: ['10-K'] });
    expect(z.array(FilingSearchHitSchema).safeParse(data).success).toBe(true);
    expect(data).toHaveLength(1); // the date-less hit is skipped
    const hit = data[0]!;
    expect(hit.entity).toBe('Apple Inc. (AAPL) (CIK 0000320193)');
    expect(hit.form).toBe('10-K');
    expect(hit.filedAt).toBe('2024-11-01');
    expect(hit.cik).toBe('0000320193');
    expect(hit.accessionNumber).toBe('0000320193-24-000123');
    expect(hit.url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm');
    expect(provenance.capability).toBe('filingSearch');
    expect(provenance.sourceUrl).toContain('efts.sec.gov/LATEST/search-index');
  });

  it('degrades a blocked EFTS response to an empty, provenance-stamped envelope', async () => {
    const failing: FetchLike = (url) =>
      url.includes('efts.sec.gov')
        ? Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: failing, minIntervalMs: 0 });
    const { data, provenance } = await p.searchFilings({ query: 'anything' });
    expect(data).toEqual([]);
    expect(provenance.capability).toBe('filingSearch');
  });
});

const FORM4_XML = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerTradingSymbol>AAPL</issuerTradingSymbol></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerName>COOK TIMOTHY D</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>Chief Executive Officer</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2024-04-01</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>100000</value></transactionShares>
        <transactionPricePerShare><value>170.5</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>3280000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2024-03-15</value></transactionDate>
      <transactionCoding><transactionCode>A</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>50000</value></transactionShares>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

describe('parseForm4 (Section-16 ownership XML)', () => {
  it('extracts the owner, relationship and non-derivative transactions', () => {
    const parsed = parseForm4(FORM4_XML);
    expect(parsed.owner).toBe('COOK TIMOTHY D');
    expect(parsed.relationship).toBe('Chief Executive Officer');
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toEqual({
      date: '2024-04-01',
      code: 'S',
      acquiredDisposed: 'D',
      shares: 100000,
      pricePerShare: 170.5,
      sharesOwnedFollowing: 3280000,
    });
    // Second transaction is unpriced (an award) → null price, no post-amount.
    expect(parsed.transactions[1]!.pricePerShare).toBeNull();
    expect(parsed.transactions[1]!.acquiredDisposed).toBe('A');
  });

  it('falls back to a role flag when no officer title is present, and tolerates junk', () => {
    const xml = `<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId>
      <reportingOwnerRelationship><isDirector>1</isDirector></reportingOwnerRelationship></reportingOwner></ownershipDocument>`;
    const parsed = parseForm4(xml);
    expect(parsed.owner).toBe('DOE JANE');
    expect(parsed.relationship).toBe('Director');
    expect(parsed.transactions).toEqual([]);
    expect(parseForm4('not xml at all').owner).toBeNull();
  });
});

describe('SecEdgarProvider insider transactions (Form 3/4/5)', () => {
  const insiderSubmissions = {
    name: 'Apple Inc.',
    filings: {
      recent: {
        // A Form 4, its amendment (4/A), and an unrelated 10-K (must be ignored).
        form: ['4', '4/A', '10-K'],
        filingDate: ['2024-04-02', '2024-04-05', '2025-11-01'],
        reportDate: ['', '', ''],
        accessionNumber: ['0000320193-24-000010', '0000320193-24-000011', '0000320193-25-000001'],
        primaryDocument: ['form4.xml', 'form4a.xml', 'aapl.htm'],
        primaryDocDescription: ['Form 4', 'Form 4/A', 'Annual report'],
      },
    },
  };
  const insiderFetch: FetchLike = (url) => {
    const jsonRes = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    if (url.includes('company_tickers')) return jsonRes(TICKER_MAP);
    if (url.includes('submissions/CIK')) return jsonRes(insiderSubmissions);
    if (url.includes('form4.xml') || url.includes('form4a.xml')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('xml')), text: () => Promise.resolve(FORM4_XML) });
    }
    return jsonRes({});
  };

  it('maps Form 4 + amendment documents to flattened, schema-valid InsiderTransaction[]', async () => {
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: insiderFetch, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data, provenance } = await p.getInsiderTransactions('AAPL');
    // 2 transactions each from the Form 4 and its 4/A amendment; the 10-K is ignored.
    expect(data).toHaveLength(4);
    expect(data[0]!.symbol).toBe('AAPL');
    expect(data[0]!.owner).toBe('COOK TIMOTHY D');
    expect(data[0]!.relationship).toBe('Chief Executive Officer');
    expect(data[0]!.code).toBe('S');
    expect(data[0]!.acquiredDisposed).toBe('D');
    expect(data[0]!.shares).toBe(100000);
    expect(data[0]!.pricePerShare).toBe(170.5);
    expect(data[0]!.form).toBe('4');
    expect(data[0]!.filedAt).toBe('2024-04-02');
    expect(data[0]!.url).toContain('/data/320193/000032019324000010/form4.xml');
    expect(data[1]!.pricePerShare).toBeNull();
    // The amendment is harvested too (Bugbot: 4/A must not be skipped).
    expect(data.some((t) => t.form === '4/A')).toBe(true);
    expect(provenance.provider).toBe('secedgar');
    expect(provenance.capability).toBe('insiderTransactions');
  });

  it('returns empty (no throw) for an unknown ticker', async () => {
    const p = new SecEdgarProvider({ userAgent: ua, fetchImpl: insiderFetch, cache: new MemoryCache(), minIntervalMs: 0 });
    const { data } = await p.getInsiderTransactions('ZZZZ');
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
