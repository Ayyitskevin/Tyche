import {
  NO_CAPABILITIES,
  type DataProvenance,
  type Envelope,
  type Filing,
  type FilingDocument,
  type FilingSearchHit,
  type FilingSearchQuery,
  type FinancialStatement,
  type InsiderTransaction,
  type InstitutionalHolding,
  type InstitutionalPortfolio,
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
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text?: () => Promise<string> }>;

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

/** Subset of the EDGAR full-text search (EFTS) response we map. */
interface EftsHit {
  /** "{accession-with-dashes}:{primary-document-filename}". */
  _id?: string;
  _source?: {
    ciks?: string[];
    display_names?: string[];
    file_date?: string;
    file_type?: string;
    root_form?: string;
  };
}

interface EftsResponse {
  hits?: { hits?: EftsHit[] };
}

const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;
const SUBMISSIONS_TTL = 15 * 60 * 1000;
/** How many Form 4/5 documents to fetch+parse per insider request (politeness bound). */
const INSIDER_DOC_BUDGET = 12;

/** One parsed non-derivative transaction from a Form 3/4/5 ownership document. */
export interface ParsedForm4Transaction {
  date: string;
  code: string;
  acquiredDisposed: 'A' | 'D' | null;
  shares: number;
  pricePerShare: number | null;
  sharesOwnedFollowing: number | null;
}

export interface ParsedForm4 {
  owner: string | null;
  relationship: string | null;
  transactions: ParsedForm4Transaction[];
}

/** First `<tag>…</tag>` inner text (case-insensitive), or null. */
function firstTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1]!.trim() : null;
}

/** Section-16 scalars are wrapped in `<value>…</value>`; return the inner value. */
function tagValue(xml: string, tag: string): string | null {
  const block = firstTag(xml, tag);
  if (block === null) return null;
  const inner = firstTag(block, 'value');
  if (inner !== null) return inner.trim() || null;
  // A self-closed/absent `<value/>` is a null scalar — don't fall back to the
  // surrounding markup as if it were the value.
  if (/<value\b/i.test(block)) return null;
  return block.trim() || null;
}

function toNumber(s: string | null): number | null {
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse an SEC Form 3/4/5 ownership XML document into the reporting owner, their
 * relationship, and the non-derivative transactions. Dependency-free (no XML
 * library) and tolerant: missing fields become null and a malformed block is
 * skipped rather than throwing, so a partial document still yields what it can.
 */
export function parseForm4(xml: string): ParsedForm4 {
  const ownerBlock = firstTag(xml, 'reportingOwner') ?? xml;
  const owner = firstTag(ownerBlock, 'rptOwnerName');
  const relBlock = firstTag(ownerBlock, 'reportingOwnerRelationship') ?? '';
  let relationship = firstTag(relBlock, 'officerTitle');
  if (!relationship) {
    if (/<isDirector>\s*(1|true)\s*<\/isDirector>/i.test(relBlock)) relationship = 'Director';
    else if (/<isTenPercentOwner>\s*(1|true)\s*<\/isTenPercentOwner>/i.test(relBlock)) relationship = '10% Owner';
    else if (/<isOfficer>\s*(1|true)\s*<\/isOfficer>/i.test(relBlock)) relationship = 'Officer';
  }

  // Only the first reporting owner is attributed (a joint Form 4 with multiple
  // <reportingOwner> blocks is rare; owners #2+ aren't surfaced by this shape).
  const transactions: ParsedForm4Transaction[] = [];
  const txRe = /<nonDerivativeTransaction\b[^>]*>([\s\S]*?)<\/nonDerivativeTransaction>/gi;
  let m: RegExpExecArray | null;
  while ((m = txRe.exec(xml)) !== null) {
    const block = m[1]!;
    const date = tagValue(block, 'transactionDate');
    const shares = toNumber(tagValue(block, 'transactionShares'));
    if (!date || shares === null) continue; // can't key a transaction without these
    const code = firstTag(firstTag(block, 'transactionCoding') ?? '', 'transactionCode');
    const ad = tagValue(block, 'transactionAcquiredDisposedCode');
    transactions.push({
      date,
      code: code ?? '',
      acquiredDisposed: ad === 'A' || ad === 'D' ? ad : null,
      shares,
      pricePerShare: toNumber(tagValue(block, 'transactionPricePerShare')),
      sharesOwnedFollowing: toNumber(tagValue(block, 'sharesOwnedFollowingTransaction')),
    });
  }
  return { owner, relationship, transactions };
}

/** Namespace-tolerant first `<tag>…</tag>` inner text (13F info tables may use a prefix). */
function nsFirst(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'i'));
  return m ? m[1]! : null;
}
function nsText(xml: string, tag: string): string | null {
  const v = nsFirst(xml, tag);
  return v === null ? null : v.trim() || null;
}

/** One parsed position from a 13F-HR information table. */
export interface ParsedHolding {
  issuer: string;
  cusip: string;
  titleOfClass: string | null;
  value: number;
  shares: number;
  sharesType: 'SH' | 'PRN' | null;
  putCall: 'Put' | 'Call' | null;
}

/**
 * Parse an SEC Form 13F-HR information table (XML) into positions. Dependency-free
 * and namespace-tolerant (filers use varying prefixes); a row missing an issuer or
 * CUSIP is skipped rather than throwing, so a partial table still yields what it can.
 */
export function parseInfoTable(xml: string): ParsedHolding[] {
  const out: ParsedHolding[] = [];
  const re = /<(?:[\w.-]+:)?infoTable\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?infoTable>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]!;
    const issuer = nsText(block, 'nameOfIssuer');
    const cusip = nsText(block, 'cusip');
    if (!issuer || !cusip) continue; // can't key a position without these
    const shrsBlock = nsFirst(block, 'shrsOrPrnAmt') ?? block;
    const sType = nsText(shrsBlock, 'sshPrnamtType');
    const pc = nsText(block, 'putCall');
    out.push({
      issuer,
      cusip: cusip.toUpperCase(),
      titleOfClass: nsText(block, 'titleOfClass'),
      value: toNumber(nsText(block, 'value')) ?? 0,
      shares: toNumber(nsText(shrsBlock, 'sshPrnamt')) ?? 0,
      sharesType: sType === 'SH' || sType === 'PRN' ? sType : null,
      putCall: pc && /put/i.test(pc) ? 'Put' : pc && /call/i.test(pc) ? 'Call' : null,
    });
  }
  return out;
}

/**
 * Aggregate parsed 13F rows by CUSIP (a manager may report a name across several
 * lines/accounts), compute each position's weight as a percent of the total
 * reported value, sort by value, and cap to `limit`. Weight is convention-
 * independent, so it is correct whether `value` is the pre-2023 thousands or the
 * current whole-dollar reporting.
 */
export function buildPortfolio(
  manager: string,
  cik: string,
  rows: ParsedHolding[],
  limit: number,
  reportDate?: string,
  filedAt?: string,
  sourceUrl?: string,
): InstitutionalPortfolio {
  // Pre-2023 13F `value` is reported in THOUSANDS; from 2023 it is whole dollars. We read
  // the latest filing (usually post-switch), but scale by the filing date so the absolute
  // dollars are honest for an older latest filing. Weight is a ratio, so this never moves it.
  const scale = filedAt !== undefined && filedAt < '2023-01-01' ? 1000 : 1;
  const byPos = new Map<
    string,
    { issuer: string; cusip: string; class?: string; value: number; shares: number; sharesType?: 'SH' | 'PRN'; putCall?: 'Put' | 'Call' }
  >();
  for (const r of rows) {
    // Key on the full instrument identity, NOT the CUSIP alone: a put/call overlay carries
    // the underlying's CUSIP and must stay a distinct position — merging it into the common
    // line would inflate value/shares and mislabel the stake as an option.
    const key = `${r.cusip}|${r.putCall ?? ''}|${r.sharesType ?? ''}`;
    const value = r.value * scale;
    const existing = byPos.get(key);
    if (existing) {
      existing.value += value;
      existing.shares += r.shares;
    } else {
      byPos.set(key, {
        issuer: r.issuer,
        cusip: r.cusip,
        ...(r.titleOfClass ? { class: r.titleOfClass } : {}),
        value,
        shares: r.shares,
        ...(r.sharesType ? { sharesType: r.sharesType } : {}),
        ...(r.putCall ? { putCall: r.putCall } : {}),
      });
    }
  }
  const merged = [...byPos.values()];
  const totalValue = merged.reduce((a, h) => a + h.value, 0);
  merged.sort((a, b) => b.value - a.value);
  const holdings: InstitutionalHolding[] = merged.slice(0, limit).map((h) => ({
    ...h,
    weightPercent: totalValue > 0 ? Math.round((h.value / totalValue) * 1e4) / 100 : 0,
  }));
  return {
    manager,
    cik,
    ...(reportDate ? { reportDate } : {}),
    ...(filedAt ? { filedAt } : {}),
    totalValue,
    positionCount: merged.length,
    holdings,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

/** A filing directory listing (EDGAR serves `index.json` per accession folder). */
interface EdgarDirectory {
  directory?: { item?: { name?: string; type?: string }[] };
}

/**
 * Convenience aliases for well-known 13F filers → CIK. Purely a shortcut: the
 * displayed manager name always comes from EDGAR's authoritative submissions feed,
 * and any raw CIK works directly (`13F 1067983`), so an off alias can never
 * silently mislabel a portfolio.
 */
const MANAGER_ALIASES: Record<string, string> = {
  BERKSHIRE: '0001067983',
  'BERKSHIRE HATHAWAY': '0001067983',
  BRK: '0001067983',
  BUFFETT: '0001067983',
  SCION: '0001649339',
  BURRY: '0001649339',
  PERSHING: '0001336528',
  'PERSHING SQUARE': '0001336528',
  ACKMAN: '0001336528',
  BRIDGEWATER: '0001350694',
  GATES: '0001166559',
  ARK: '0001697748',
};

/** How many candidate XML documents to try when locating a filing's info table. */
const INFOTABLE_DOC_BUDGET = 2;
/** A filed 13F info table is immutable, so cache the parsed portfolio for hours. */
const HOLDINGS_TTL = 6 * 60 * 60 * 1000;
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
    capabilities: {
      ...NO_CAPABILITIES,
      filings: true,
      filingSearch: true,
      insiderTransactions: true,
      institutionalHoldings: true,
      fundamentals: true,
    },
    freshness: [
      { capability: 'filings', tier: 'eod' },
      { capability: 'filingSearch', tier: 'eod' },
      { capability: 'insiderTransactions', tier: 'eod' },
      { capability: 'institutionalHoldings', tier: 'eod' },
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
   * Real `filingSearch` over SEC EDGAR's keyless full-text index (EFTS). A
   * cross-issuer query — no CIK resolution — mapped to {@link FilingSearchHit}[]
   * with a direct Archives URL to each matched document. A blocked/unparseable
   * response degrades to an empty-but-valid envelope, never a 502.
   */
  override async searchFilings(query: FilingSearchQuery): Promise<Envelope<FilingSearchHit[]>> {
    const limit = query.limit ?? 20;
    const params = new URLSearchParams({ q: query.query });
    if (query.forms && query.forms.length > 0) params.set('forms', query.forms.join(','));
    if (query.dateFrom || query.dateTo) {
      params.set('dateRange', 'custom');
      if (query.dateFrom) params.set('startdt', query.dateFrom);
      if (query.dateTo) params.set('enddt', query.dateTo);
    }
    const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;

    let body: EftsResponse;
    try {
      body = await this.getJson<EftsResponse>(url);
    } catch (err) {
      if (err instanceof ProviderError) return withProvenance([], this.provenance(false, url, 'filingSearch'));
      throw err;
    }

    const hits: FilingSearchHit[] = [];
    for (const h of body.hits?.hits ?? []) {
      const src = h._source ?? {};
      const filedAt = src.file_date;
      const form = src.file_type ?? src.root_form;
      if (!filedAt || !form) continue; // skip anything we can't key
      const cik = src.ciks?.[0];
      const [accession, filename] = (h._id ?? '').split(':');
      const hit: FilingSearchHit = {
        entity: src.display_names?.[0] ?? (cik ? `CIK ${cik}` : 'Unknown filer'),
        form,
        filedAt,
        ...(cik ? { cik } : {}),
        ...(accession ? { accessionNumber: accession } : {}),
        ...(src.file_type && src.file_type !== form ? { fileType: src.file_type } : {}),
      };
      // Direct document URL: /Archives/edgar/data/<cik-no-zeros>/<accession-no-dashes>/<file>
      if (cik && accession && filename) {
        hit.url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/${filename}`;
      }
      hits.push(hit);
      if (hits.length >= limit) break;
    }
    return withProvenance(hits, this.provenance(false, url, 'filingSearch'));
  }

  /**
   * Real `insiderTransactions` over EDGAR Form 3/4/5 ownership XML. Resolves the
   * CIK, reads the (cached) submissions feed, then fetches and parses up to
   * {@link INSIDER_DOC_BUDGET} recent Form 4/5 documents into flattened
   * transactions. Any unresolved CIK / fetch failure / unparseable document
   * degrades to an empty-but-valid envelope (a bad single document is skipped).
   */
  override async getInsiderTransactions(symbol: string, limit = 30): Promise<Envelope<InsiderTransaction[]>> {
    const cik10 = await this.resolveCik(symbol).catch((err: unknown) => {
      if (err instanceof ProviderError) return null;
      throw err;
    });
    const subUrl = cik10 ? `https://data.sec.gov/submissions/CIK${cik10}.json` : undefined;
    if (!cik10) return withProvenance([], this.provenance(false, subUrl, 'insiderTransactions'));

    const cacheKey = `edgar:submissions:${cik10}`;
    let submissions = await this.cache.get<Submissions>(cacheKey);
    const cacheHit = submissions !== undefined;
    if (!submissions) {
      try {
        submissions = await this.getJson<Submissions>(subUrl!);
      } catch (err) {
        if (err instanceof ProviderError) return withProvenance([], this.provenance(false, subUrl, 'insiderTransactions'));
        throw err;
      }
      await this.cache.set(cacheKey, submissions, SUBMISSIONS_TTL);
    }

    const recent = submissions.filings?.recent ?? {};
    const cikInt = String(Number(cik10));
    const count = recent.accessionNumber?.length ?? 0;
    const out: InsiderTransaction[] = [];
    let docsFetched = 0;
    for (let i = 0; i < count && docsFetched < INSIDER_DOC_BUDGET && out.length < limit; i++) {
      const form = recent.form?.[i] ?? '';
      // Accept Form 4/5 and their amendments (4/A, 5/A) — an amendment supersedes
      // the original and carries the corrected insider activity.
      if (!/^[45](\/A)?$/.test(form)) continue;
      const accession = recent.accessionNumber?.[i];
      const primaryDoc = recent.primaryDocument?.[i];
      if (!accession || !primaryDoc) continue;
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accession.replace(/-/g, '')}/${primaryDoc}`;
      docsFetched++;
      let xml: string;
      try {
        xml = await this.getText(docUrl);
      } catch (err) {
        if (err instanceof ProviderError) continue; // skip this document, keep going
        throw err;
      }
      const parsed = parseForm4(xml);
      if (!parsed.owner || parsed.transactions.length === 0) continue;
      const filedAt = recent.filingDate?.[i] || undefined;
      for (const t of parsed.transactions) {
        out.push({
          symbol: symbol.toUpperCase(),
          owner: parsed.owner,
          ...(parsed.relationship ? { relationship: parsed.relationship } : {}),
          date: t.date,
          code: t.code,
          acquiredDisposed: t.acquiredDisposed,
          shares: t.shares,
          pricePerShare: t.pricePerShare,
          sharesOwnedFollowing: t.sharesOwnedFollowing,
          form,
          ...(filedAt ? { filedAt } : {}),
          url: docUrl,
        });
        if (out.length >= limit) break;
      }
    }
    return withProvenance(out.slice(0, limit), this.provenance(cacheHit, subUrl, 'insiderTransactions'));
  }

  /**
   * Real `institutionalHoldings` over EDGAR Form 13F-HR information tables. Resolves
   * a manager (raw CIK or a known alias), reads the (cached) submissions feed, finds
   * the latest 13F-HR, locates and parses its information-table XML, aggregates
   * positions by CUSIP, and computes portfolio weights. Any unresolved manager /
   * missing filing / unparseable table degrades to an empty-but-valid portfolio (the
   * mock philosophy), never a 502. The manager name shown is EDGAR's authoritative
   * filer name. Research-only; a 13F is a delayed, long-only quarterly snapshot.
   */
  override async getInstitutionalHoldings(
    manager: string,
    limit = 50,
  ): Promise<Envelope<InstitutionalPortfolio>> {
    const cik10 = this.resolveManager(manager);
    const empty = (name = manager.trim().toUpperCase()): Envelope<InstitutionalPortfolio> =>
      withProvenance(
        { manager: name, cik: cik10 ?? '', totalValue: 0, positionCount: 0, holdings: [] },
        this.provenance(false, undefined, 'institutionalHoldings'),
      );
    if (!cik10) return empty();

    const subUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const cacheKey = `edgar:submissions:${cik10}`;
    let submissions = await this.cache.get<Submissions>(cacheKey);
    const cacheHit = submissions !== undefined;
    if (!submissions) {
      try {
        submissions = await this.getJson<Submissions>(subUrl);
      } catch (err) {
        if (err instanceof ProviderError) return empty();
        throw err;
      }
      await this.cache.set(cacheKey, submissions, SUBMISSIONS_TTL);
    }

    const recent = submissions.filings?.recent ?? {};
    const name = submissions.name ?? manager.trim().toUpperCase();
    const cikInt = String(Number(cik10));
    const count = recent.accessionNumber?.length ?? 0;

    // Prefer the most recent FULL 13F-HR (submissions are newest-first). Fall back to an
    // amendment (/A) only when there is no full report, because a `13F-HR/A` may be a
    // partial NEWHOLDINGS amendment rather than the whole book — presenting it as the full
    // portfolio would silently understate the manager's holdings.
    const findLatest = (re: RegExp): number => {
      for (let i = 0; i < count; i++) if (re.test(recent.form?.[i] ?? '')) return i;
      return -1;
    };
    let idx = findLatest(/^13F-HR$/);
    if (idx === -1) idx = findLatest(/^13F-HR\/A$/);
    if (idx === -1) return empty(name);
    const accession = recent.accessionNumber?.[idx];
    const reportDate = recent.reportDate?.[idx] || undefined;
    const filedAt = recent.filingDate?.[idx] || undefined;
    if (!accession) return empty(name);

    const holdingsKey = `edgar:13f:${cik10}:${accession}`;
    let cached = await this.cache.get<{ holdings: ParsedHolding[]; url?: string }>(holdingsKey);
    if (cached === undefined) {
      const dir = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accession.replace(/-/g, '')}`;
      let index: EdgarDirectory;
      try {
        index = await this.getJson<EdgarDirectory>(`${dir}/index.json`);
      } catch (err) {
        if (err instanceof ProviderError) return empty(name);
        throw err;
      }
      const xmls = (index.directory?.item ?? [])
        .map((it) => it.name ?? '')
        .filter((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n) && !n.includes('/'));
      // Prefer an obviously-named info table; otherwise try the remaining XML docs.
      const ordered = [
        ...xmls.filter((n) => /info.?table|form13f|table/i.test(n)),
        ...xmls.filter((n) => !/info.?table|form13f|table/i.test(n)),
      ];
      let holdings: ParsedHolding[] = [];
      let url: string | undefined;
      let fetchFailed = false;
      for (const n of ordered.slice(0, INFOTABLE_DOC_BUDGET)) {
        let xml: string;
        try {
          xml = await this.getText(`${dir}/${n}`);
        } catch (err) {
          if (err instanceof ProviderError) { fetchFailed = true; continue; } // try the next doc
          throw err;
        }
        const parsed = parseInfoTable(xml);
        if (parsed.length > 0) {
          holdings = parsed;
          url = `${dir}/${n}`;
          break;
        }
      }
      cached = { holdings, ...(url ? { url } : {}) };
      // Don't poison the cache (6h) with an empty result that is empty ONLY because a doc
      // fetch transiently failed — let the next request retry once EDGAR recovers (mirrors
      // getFinancials, which never caches a failed fetch). A genuinely empty parse is cached.
      if (!(holdings.length === 0 && fetchFailed)) {
        await this.cache.set(holdingsKey, cached, HOLDINGS_TTL);
      }
    }

    const portfolio = buildPortfolio(name, cik10, cached.holdings, limit, reportDate, filedAt, cached.url);
    return withProvenance(
      portfolio,
      this.provenance(cacheHit, cached.url ?? subUrl, 'institutionalHoldings'),
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
    let cik10: string | null;
    try {
      cik10 = await this.resolveCik(symbol);
    } catch (err) {
      // A ticker-map fetch failure is a data gap too — degrade to empty, not a 502.
      if (err instanceof ProviderError) return withProvenance([], this.provenance(false, undefined, 'fundamentals'));
      throw err;
    }
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
    const rd = series(['ResearchAndDevelopmentExpense']);
    const sga = series([
      'SellingGeneralAndAdministrativeExpense',
      'GeneralAndAdministrativeExpense',
    ]);
    const interestExpense = series(['InterestExpense', 'InterestExpenseNonoperating']);
    const incomeTax = series(['IncomeTaxExpenseBenefit']);
    const assets = series(['Assets']);
    const currentAssets = series(['AssetsCurrent']);
    const inventory = series(['InventoryNet']);
    const liabilities = series(['Liabilities']);
    const currentLiabilities = series(['LiabilitiesCurrent']);
    const liabAndEquity = series(['LiabilitiesAndStockholdersEquity']);
    const equity = series(['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
    const cash = series(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
    const ltDebtNoncurrent = series(['LongTermDebtNoncurrent']);
    const ltDebtCurrent = series(['LongTermDebtCurrent', 'DebtCurrent']);
    const ltDebt = series(['LongTermDebt']);
    const ocf = series(['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']);
    const dna = series([
      'DepreciationDepletionAndAmortization',
      'DepreciationAmortizationAndAccretionNet',
      'DepreciationAndAmortization',
    ]);
    const sbc = series(['ShareBasedCompensation', 'ShareBasedCompensationExpense']);
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
          li('researchAndDevelopment', 'R&D expense', get(rd, k), 4),
          li('sellingGeneralAdmin', 'SG&A expense', get(sga, k), 5),
          li('operatingIncome', 'Operating income', get(operatingIncome, k), 6),
          li('interestExpense', 'Interest expense', get(interestExpense, k), 7),
          li('incomeTaxExpense', 'Income tax expense', get(incomeTax, k), 8),
          li('netIncome', 'Net income', get(netIncome, k), 9),
          { key: 'eps', label: 'Diluted EPS', value: epsVal !== null ? Math.round(epsVal * 100) / 100 : null, unit: 'USD', order: 10 },
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
          li('currentAssets', 'Current assets', get(currentAssets, k), 2),
          li('cashAndEquivalents', 'Cash & equivalents', get(cash, k), 3),
          li('inventory', 'Inventory', get(inventory, k), 4),
          li('totalLiabilities', 'Total liabilities', liab, 5),
          li('currentLiabilities', 'Current liabilities', get(currentLiabilities, k), 6),
          li('totalDebt', 'Total debt', totalDebt, 7),
          li('totalEquity', 'Total equity', eq, 8),
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
          li('depreciationAmortization', 'Depreciation & amortization', get(dna, k), 2),
          li('shareBasedCompensation', 'Share-based compensation', get(sbc, k), 3),
          li('capitalExpenditures', 'Capital expenditures', capexRaw !== null ? -capexRaw : null, 4),
          li('freeCashFlow', 'Free cash flow', flow !== null && capexRaw !== null ? flow - capexRaw : null, 5),
          li('dividendsPaid', 'Dividends paid', divRaw !== null ? -divRaw : null, 6),
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
      // Key every annual fact by the CALENDAR YEAR OF ITS PERIOD END — which is
      // the fiscal-year label for essentially all US filers (a fiscal year is
      // named by the year it ends in). This single key aligns income/cash-flow
      // durations with the balance-sheet instant AND framed with unframed facts
      // for the same period, even for an off-calendar fiscal year where SEC's CY
      // frame year differs from the fiscal year. The frame only classifies (is
      // this annual? duration vs FY-end instant), never supplies the key.
      const endYear = Number(f.end.slice(0, 4));
      if (!Number.isFinite(endYear)) return null;
      if (f.frame) {
        // CY#### (no quarter) = an annual duration. CY####Q[1-4]I = a period-end
        // balance instant, framed by the CALENDAR quarter of the fiscal year-end
        // (Q4I for Dec filers, Q3I for a Sep year-end, Q2I for Jun), so do NOT
        // require Q4I. Gate the instant on fp==='FY' to exclude an interim-quarter
        // balance that merely lands in calendar Q4 (e.g. a Sep filer's Q1 → Dec).
        if (/^CY\d{4}$/.test(f.frame) && !isInstant) return { key: String(endYear), year: endYear };
        if (/^CY\d{4}Q[1-4]I$/.test(f.frame) && isInstant && f.fp === 'FY') return { key: String(endYear), year: endYear };
        return null; // a quarterly-duration frame is not an annual data point
      }
      // Fallback for a just-filed 10-K SEC hasn't framed yet.
      const annualForms = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
      if (f.fp === 'FY' && f.form && annualForms.has(f.form) && (isInstant || (durationDays >= 335 && durationDays <= 400))) {
        return { key: String(endYear), year: endYear };
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

  /** Resolve a 13F-manager query to a zero-padded CIK: a raw CIK, or a known alias. */
  private resolveManager(query: string): string | null {
    const q = query.trim();
    if (/^\d{1,10}$/.test(q)) return q.padStart(10, '0');
    return MANAGER_ALIASES[q.toUpperCase()] ?? null;
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
    try {
      return (await res.json()) as T;
    } catch {
      // A 200 with a non-JSON body (WAF/maintenance HTML, truncated response) is
      // a data gap, not a crash — surface it as a ProviderError so callers that
      // degrade gracefully (getFinancials) return an empty envelope, not a 502.
      throw new ProviderError('secedgar', `EDGAR returned an unparseable body for ${url}`);
    }
  }

  /** Fetch a raw text/XML document (Form 4 ownership docs are XML, not JSON). */
  private async getText(url: string): Promise<string> {
    const res = await this.throttle(() =>
      this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent, Accept: 'application/xml, text/html' } }),
    );
    if (!res.ok) throw new ProviderError('secedgar', `EDGAR responded ${res.status} for ${url}`);
    if (!res.text) throw new ProviderError('secedgar', `EDGAR returned no text body for ${url}`);
    return res.text();
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
