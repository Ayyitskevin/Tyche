import {
  NO_CAPABILITIES,
  type DataProvenance,
  type Envelope,
  type NewsItem,
  type ProviderDescriptor,
} from '@tyche/contracts';
import { StubProvider, type NewsQuery } from './Provider';
import { MemoryCache, type CacheStore } from './cache';
import { makeProvenance, withProvenance } from './provenance';
import type { FetchLike } from './stubs/FredProvider';

const BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
const NEWS_TTL = 5 * 60 * 1000;
const MAX_RECORDS = 250;

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string; // e.g. "20250611T120000Z"
  domain?: string;
}
interface GdeltResponse {
  articles?: GdeltArticle[];
}

export interface GdeltNewsProviderOptions {
  cache?: CacheStore;
  fetchImpl?: FetchLike;
  minIntervalMs?: number;
}

/** GDELT `seendate` ("20250611T120000Z") → ISO datetime, or null when malformed. */
function parseSeenDate(s?: string): string | null {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : null;
}

/** ISO datetime → GDELT's `YYYYMMDDHHMMSS`, or null when unparseable. */
function toGdeltTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/**
 * GDELT news adapter — real, keyless news over the GDELT DOC 2.0 API. Serves the
 * `news` capability so N / TOP show live articles instead of the mock generator.
 * A symbol query searches the ticker in a finance context; a bare query returns the
 * global markets feed; `keyword` passes through verbatim. GDELT carries no ticker
 * tags, so `symbols` is echoed from the query rather than inferred, and the adapter
 * degrades a failed/blocked request to an empty envelope rather than throwing.
 * Descriptive third-party news; nothing here is investment advice.
 */
export class GdeltNewsProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'gdelt',
    mode: 'public',
    capabilities: { ...NO_CAPABILITIES, news: true },
    freshness: [{ capability: 'news', tier: 'delayed' }],
    attribution: 'News via The GDELT Project',
    attributionRequired: true,
    homepage: 'https://www.gdeltproject.org',
    description: 'Global news headlines via the keyless GDELT DOC 2.0 API (~15-minute latency).',
    requiresConfiguration: false,
  };

  private readonly cache: CacheStore;
  private readonly fetchImpl: FetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: GdeltNewsProviderOptions = {}) {
    super();
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 200;
  }

  override async getNews(query: NewsQuery = {}): Promise<Envelope<NewsItem[]>> {
    const symbols = query.symbol
      ? [query.symbol.toUpperCase()]
      : (query.symbols ?? []).map((s) => s.toUpperCase());
    const params = new URLSearchParams({
      query: this.buildQuery(query, symbols),
      mode: 'ArtList',
      format: 'json',
      maxrecords: String(Math.min(query.limit ?? 40, MAX_RECORDS)),
      sort: 'DateDesc',
    });
    const since = query.since ? toGdeltTime(query.since) : null;
    const until = query.until ? toGdeltTime(query.until) : null;
    if (since) params.set('startdatetime', since);
    if (until) params.set('enddatetime', until);
    const url = `${BASE_URL}?${params.toString()}`;

    const cacheKey = `gdelt:${url}`;
    let res = await this.cache.get<GdeltResponse>(cacheKey);
    if (res === undefined) {
      try {
        res = await this.getJson<GdeltResponse>(url);
      } catch {
        // Descriptive news is supplementary — a blocked/failed request degrades to
        // an empty feed rather than an error state.
        return withProvenance([], this.prov());
      }
      await this.cache.set(cacheKey, res, NEWS_TTL);
    }

    const items: NewsItem[] = [];
    for (const a of res.articles ?? []) {
      const publishedAt = parseSeenDate(a.seendate);
      if (!a.url || !a.title || !publishedAt) continue;
      items.push({
        id: a.url,
        headline: a.title,
        url: a.url,
        source: a.domain ?? new URL(a.url).hostname,
        publishedAt,
        symbols,
        tags: [],
      });
    }
    return withProvenance(items, this.prov());
  }

  // --- internals -----------------------------------------------------------

  private buildQuery(query: NewsQuery, symbols: string[]): string {
    const keyword = (query.keyword ?? query.query ?? '').trim();
    if (keyword) return keyword;
    if (symbols.length > 0) {
      const terms = symbols.map((s) => `"${s}"`).join(' OR ');
      return `(${terms}) (stocks OR shares OR earnings OR market)`;
    }
    return '(stock market OR financial markets OR wall street)';
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.throttle(() => this.fetchImpl(url, { headers: { Accept: 'application/json' } }));
    } catch {
      throw new Error('GDELT request failed.');
    }
    if (!res.ok) throw new Error(`GDELT responded ${res.status}.`);
    return (await res.json()) as T;
  }

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

  private prov(): DataProvenance {
    return makeProvenance({
      provider: 'gdelt',
      providerMode: 'public',
      capability: 'news',
      tier: 'delayed',
      attribution: 'News via The GDELT Project',
      sourceUrl: 'https://www.gdeltproject.org',
    });
  }
}
