import {
  NO_CAPABILITIES,
  type DataProvenance,
  type EconomicObservation,
  type EconomicSeries,
  type EconomicSeriesQuery,
  type EconomicRelease,
  type EconomicReleaseQuery,
  type ReleaseImportance,
  type Envelope,
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

export interface FredProviderOptions {
  /** Free FRED API key (FRED_API_KEY). Required — the provider refuses without it. */
  apiKey: string;
  cache?: CacheStore;
  fetchImpl?: FetchLike;
  /** Minimum spacing between FRED requests (politeness throttle). */
  minIntervalMs?: number;
}

interface FredSeriesMeta {
  id?: string;
  title?: string;
  units?: string;
  units_short?: string;
  frequency?: string;
  seasonal_adjustment?: string;
  notes?: string;
  observation_start?: string;
  observation_end?: string;
  last_updated?: string;
}
interface FredSeriesResponse {
  seriess?: FredSeriesMeta[];
}
interface FredObservation {
  date?: string;
  value?: string;
}
interface FredObservationsResponse {
  observations?: FredObservation[];
}
interface FredReleaseDate {
  release_id?: number;
  release_name?: string;
  date?: string;
}
interface FredReleaseDatesResponse {
  release_dates?: FredReleaseDate[];
}

const BASE = 'https://api.stlouisfed.org/fred';
const META_TTL = 6 * 60 * 60 * 1000;
const OBS_TTL = 30 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * Curated high-signal FRED releases (matched by name substring) with an assigned
 * importance. FRED publishes hundreds of releases; this keeps the calendar to the
 * macro prints a research desk actually watches.
 */
const RELEASE_IMPORTANCE: { match: string; importance: ReleaseImportance }[] = [
  { match: 'consumer price index', importance: 'high' },
  { match: 'employment situation', importance: 'high' },
  { match: 'gross domestic product', importance: 'high' },
  { match: 'personal income and outlays', importance: 'high' },
  { match: 'advance monthly sales for retail', importance: 'high' },
  { match: 'fomc', importance: 'high' },
  { match: 'producer price index', importance: 'medium' },
  { match: 'unemployment insurance weekly claims', importance: 'medium' },
  { match: 'consumer sentiment', importance: 'medium' },
  { match: 'industrial production', importance: 'low' },
  { match: 'new residential construction', importance: 'low' },
];

function importanceFor(name: string): ReleaseImportance | null {
  const n = name.toLowerCase();
  for (const { match, importance } of RELEASE_IMPORTANCE) if (n.includes(match)) return importance;
  return null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * FRED provider — real `economicSeries` capability over the public FRED HTTP API
 * (Federal Reserve Bank of St. Louis). Requires a free API key, so the provider
 * refuses to construct without one. All other capabilities inherit the throwing
 * {@link StubProvider} defaults, so the registry routes them elsewhere (e.g. mock).
 *
 * The API key is sent only as a request parameter; it is never written into
 * provenance — `sourceUrl` points at the public, key-free series page.
 */
export class FredProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'fred',
    mode: 'public',
    capabilities: { ...NO_CAPABILITIES, economicSeries: true, economicReleases: true },
    freshness: [
      { capability: 'economicSeries', tier: 'eod' },
      { capability: 'economicReleases', tier: 'eod' },
    ],
    attribution: 'FRED — Federal Reserve Bank of St. Louis',
    attributionRequired: true,
    homepage: 'https://fred.stlouisfed.org',
    description: 'FRED economic time series (public). Requires a free API key.',
    requiresConfiguration: true,
  };

  private readonly apiKey: string;
  private readonly cache: CacheStore;
  private readonly fetchImpl: FetchLike;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();
  private lastCallAt = 0;

  constructor(options: FredProviderOptions) {
    super();
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new ProviderError('fred', 'FRED requires a free API key (FRED_API_KEY).');
    }
    this.apiKey = options.apiKey.trim();
    this.cache = options.cache ?? new MemoryCache();
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.minIntervalMs = options.minIntervalMs ?? 120;
  }

  override async getEconomicSeries(
    seriesId: string,
    query: EconomicSeriesQuery = {},
  ): Promise<Envelope<EconomicSeries>> {
    const id = seriesId.trim().toUpperCase();

    const metaKey = `fred:series:${id}`;
    let meta = await this.cache.get<FredSeriesMeta>(metaKey);
    let cacheHit = meta !== undefined;
    if (!meta) {
      const res = await this.getJson<FredSeriesResponse>(
        this.url('/series', { series_id: id }),
      );
      meta = res.seriess?.[0] ?? { id };
      await this.cache.set(metaKey, meta, META_TTL);
    }

    const obsParams: Record<string, string> = { series_id: id };
    if (query.start) obsParams.observation_start = query.start;
    if (query.end) obsParams.observation_end = query.end;
    // For a row cap, ask FRED for the newest N (desc) and re-sort ascending.
    if (query.limit) {
      obsParams.limit = String(query.limit);
      obsParams.sort_order = 'desc';
    } else {
      obsParams.sort_order = 'asc';
    }

    const obsKey = `fred:obs:${id}:${JSON.stringify(obsParams)}`;
    let obsRes = await this.cache.get<FredObservationsResponse>(obsKey);
    if (obsRes === undefined) {
      cacheHit = false;
      obsRes = await this.getJson<FredObservationsResponse>(this.url('/series/observations', obsParams));
      await this.cache.set(obsKey, obsRes, OBS_TTL);
    }

    const raw = obsRes.observations ?? [];
    const observations: EconomicObservation[] = [];
    for (const o of raw) {
      if (!o.date) continue;
      const n = o.value === undefined || o.value === '' || o.value === '.' ? null : Number(o.value);
      observations.push({ date: o.date, value: n !== null && Number.isFinite(n) ? n : null });
    }
    if (query.limit) observations.reverse(); // desc → ascending oldest→newest

    const data: EconomicSeries = {
      seriesId: id,
      title: meta.title ?? id,
      ...(meta.units ? { units: meta.units } : {}),
      ...(meta.units_short ? { unitsShort: meta.units_short } : {}),
      ...(meta.frequency ? { frequency: meta.frequency } : {}),
      ...(meta.seasonal_adjustment ? { seasonalAdjustment: meta.seasonal_adjustment } : {}),
      ...(meta.notes ? { notes: meta.notes } : {}),
      ...(meta.observation_start ? { observationStart: meta.observation_start } : {}),
      ...(meta.observation_end ? { observationEnd: meta.observation_end } : {}),
      ...(meta.last_updated ? { lastUpdated: meta.last_updated } : {}),
      observations,
    };
    return withProvenance(data, this.provenance(cacheHit, `https://fred.stlouisfed.org/series/${id}`));
  }

  override async getEconomicReleases(
    query: EconomicReleaseQuery = {},
  ): Promise<Envelope<EconomicRelease[]>> {
    const now = Date.now();
    const params: Record<string, string> = {
      realtime_start: query.from ?? isoDate(new Date(now - 30 * DAY_MS)),
      realtime_end: query.to ?? isoDate(new Date(now + 45 * DAY_MS)),
      include_release_dates_with_no_data: 'true',
      sort_order: 'asc',
    };
    if (query.limit) params.limit = String(Math.min(query.limit, 1000));

    const res = await this.getJson<FredReleaseDatesResponse>(this.url('/releases/dates', params));
    const rows: EconomicRelease[] = [];
    for (const rd of res.release_dates ?? []) {
      if (!rd.date || !rd.release_name) continue;
      const importance = importanceFor(rd.release_name); // curated high-signal set only
      if (!importance) continue;
      if (query.importance && importance !== query.importance) continue;
      rows.push({
        name: rd.release_name,
        date: rd.date,
        ...(rd.release_id !== undefined ? { releaseId: String(rd.release_id) } : {}),
        importance,
      });
    }
    const capped = query.limit ? rows.slice(0, query.limit) : rows;
    return withProvenance(
      capped,
      this.provenance(false, 'https://fred.stlouisfed.org/releases', 'economicReleases'),
    );
  }

  // --- internals -----------------------------------------------------------

  /** Build a FRED API URL. The api_key is added here and never surfaced in provenance. */
  private url(path: string, params: Record<string, string>): string {
    const search = new URLSearchParams({ ...params, api_key: this.apiKey, file_type: 'json' });
    return `${BASE}${path}?${search.toString()}`;
  }

  private async getJson<T>(url: string): Promise<T> {
    // Never let the key-bearing URL escape in an error message. A non-ok response
    // gets a status-only error; a transport rejection (whose `.cause` may carry
    // the URL) is replaced with a generic ProviderError.
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.throttle(() => this.fetchImpl(url, { headers: { Accept: 'application/json' } }));
    } catch {
      throw new ProviderError('fred', 'FRED request failed.');
    }
    if (!res.ok) throw new ProviderError('fred', `FRED responded ${res.status}.`);
    return (await res.json()) as T;
  }

  /** Serialize FRED calls and enforce a minimum spacing between them. */
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

  private provenance(cacheHit: boolean, sourceUrl: string, capability = 'economicSeries'): DataProvenance {
    return makeProvenance({
      provider: 'fred',
      providerMode: 'public',
      capability,
      tier: 'eod',
      attribution: 'FRED — Federal Reserve Bank of St. Louis',
      cacheHit,
      sourceUrl,
    });
  }
}
