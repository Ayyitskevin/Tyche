import {
  NO_CAPABILITIES,
  type DataProvenance,
  type Envelope,
  type Filing,
  type FilingDocument,
  type ProviderDescriptor,
} from '@tyche/contracts';
import { StubProvider } from '../Provider';
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

const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;
const SUBMISSIONS_TTL = 15 * 60 * 1000;

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
    capabilities: { ...NO_CAPABILITIES, filings: true },
    freshness: [{ capability: 'filings', tier: 'eod' }],
    attribution: 'U.S. Securities and Exchange Commission — EDGAR',
    attributionRequired: false,
    homepage: 'https://www.sec.gov/edgar',
    description: 'SEC EDGAR filings index (public). Requires a descriptive User-Agent.',
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

  // --- internals -----------------------------------------------------------

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

  private provenance(cacheHit: boolean, sourceUrl?: string): DataProvenance {
    return makeProvenance({
      provider: 'secedgar',
      providerMode: 'public',
      capability: 'filings',
      tier: 'eod',
      attribution: 'U.S. Securities and Exchange Commission — EDGAR',
      cacheHit,
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }
}
