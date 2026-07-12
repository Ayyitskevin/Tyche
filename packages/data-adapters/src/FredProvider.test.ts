import { describe, it, expect } from 'vitest';
import { EconomicSeriesSchema, EconomicReleaseSchema } from '@tyche/contracts';
import { FredProvider, type FetchLike } from './stubs/FredProvider';
import { MemoryCache } from './cache';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';

const SERIES = {
  seriess: [
    {
      id: 'GDP',
      title: 'Gross Domestic Product',
      units: 'Billions of Dollars',
      units_short: 'Bil. $',
      frequency: 'Quarterly',
      seasonal_adjustment: 'Seasonally Adjusted Annual Rate',
      observation_start: '1947-01-01',
      observation_end: '2024-07-01',
      last_updated: '2024-10-30 07:56:01-05',
    },
  ],
};
// Oldest → newest, with a gap encoded as "." (FRED's missing-value marker).
const OBS_ASC = [
  { date: '2024-01-01', value: '27000.0' },
  { date: '2024-04-01', value: '.' },
  { date: '2024-07-01', value: '27500.4' },
];

const RELEASE_DATES = {
  release_dates: [
    { release_id: 999, release_name: 'Obscure Regional Survey', date: '2025-06-05' }, // not curated → dropped
    { release_id: 50, release_name: 'Employment Situation', date: '2025-06-06' },
    { release_id: 10, release_name: 'Consumer Price Index', date: '2025-06-11' },
  ],
};

function makeFetch(urlSink: string[] = []): FetchLike {
  return (url) => {
    urlSink.push(url);
    let body: unknown = {};
    if (url.includes('/releases/dates')) {
      body = RELEASE_DATES;
    } else if (url.includes('/series/observations')) {
      const desc = url.includes('sort_order=desc');
      body = { observations: desc ? [...OBS_ASC].reverse() : OBS_ASC };
    } else if (url.includes('/series?') || url.includes('/series&')) {
      body = SERIES;
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
}

const key = 'test-fred-key-123';

describe('FredProvider', () => {
  it('refuses to construct without an API key', () => {
    expect(() => new FredProvider({ apiKey: '' })).toThrow(/API key/);
  });

  it('maps FRED series + observations to a schema-valid EconomicSeries', async () => {
    const urls: string[] = [];
    const provider = new FredProvider({ apiKey: key, fetchImpl: makeFetch(urls), cache: new MemoryCache(), minIntervalMs: 0 });
    const { data, provenance } = await provider.getEconomicSeries('gdp');

    expect(data.seriesId).toBe('GDP');
    expect(data.title).toBe('Gross Domestic Product');
    expect(data.units).toBe('Billions of Dollars');
    expect(data.observations).toHaveLength(3);
    expect(data.observations[1]?.value).toBeNull(); // "." → null
    expect(data.observations[0]?.value).toBe(27000);
    expect(EconomicSeriesSchema.safeParse(data).success).toBe(true);

    expect(provenance.provider).toBe('fred');
    expect(provenance.providerMode).toBe('public');
    expect(provenance.sourceUrl).toBe('https://fred.stlouisfed.org/series/GDP');
  });

  it('never leaks the API key in provenance, even though it is sent as a request param', async () => {
    const urls: string[] = [];
    const provider = new FredProvider({ apiKey: key, fetchImpl: makeFetch(urls), minIntervalMs: 0 });
    const { provenance } = await provider.getEconomicSeries('GDP');
    expect(urls.some((u) => u.includes(`api_key=${key}`))).toBe(true); // key IS sent to FRED
    expect(provenance.sourceUrl ?? '').not.toContain(key); // but never surfaced
    expect(JSON.stringify(provenance)).not.toContain(key);
  });

  it('never leaks the key when the transport rejects (e.g. the URL in err.cause)', async () => {
    const rejecting: FetchLike = () => Promise.reject(new Error(`getaddrinfo ENOTFOUND ...api_key=${key}`));
    const provider = new FredProvider({ apiKey: key, fetchImpl: rejecting, minIntervalMs: 0 });
    await expect(provider.getEconomicSeries('GDP')).rejects.toThrow(/FRED request failed/);
    await expect(provider.getEconomicSeries('GDP')).rejects.not.toThrow(new RegExp(key));
  });

  it('returns the newest N oldest→newest when a limit is set', async () => {
    const urls: string[] = [];
    const provider = new FredProvider({ apiKey: key, fetchImpl: makeFetch(urls), minIntervalMs: 0 });
    const { data } = await provider.getEconomicSeries('GDP', { limit: 3 });
    expect(urls.some((u) => u.includes('sort_order=desc'))).toBe(true);
    // Re-sorted ascending: first observation is the oldest date.
    expect(data.observations[0]?.date).toBe('2024-01-01');
    expect(data.observations[data.observations.length - 1]?.date).toBe('2024-07-01');
  });

  it('maps FRED release dates to a curated, schema-valid calendar', async () => {
    const provider = new FredProvider({ apiKey: key, fetchImpl: makeFetch(), cache: new MemoryCache(), minIntervalMs: 0 });
    const { data, provenance } = await provider.getEconomicReleases({});
    const names = data.map((r) => r.name);
    expect(names).toContain('Consumer Price Index');
    expect(names).toContain('Employment Situation');
    expect(names).not.toContain('Obscure Regional Survey'); // not in the curated set
    expect(data.find((r) => r.name === 'Consumer Price Index')?.importance).toBe('high');
    for (const r of data) expect(EconomicReleaseSchema.safeParse(r).success).toBe(true);
    expect(provenance?.capability).toBe('economicReleases');
    expect(provenance?.attribution).toMatch(/FRED/);
  });

  it('passes conformance for the economicSeries capability', async () => {
    const provider = new FredProvider({ apiKey: key, fetchImpl: makeFetch(), minIntervalMs: 0 });
    const report = await checkProviderConformance(provider);
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });
});

describe('provider registry routing for FRED', () => {
  it('routes economicSeries to fred when enabled with an API key', () => {
    const registry = createProviderRegistry({ providers: ['fred'], fredApiKey: key });
    expect(registry.forCapability('economicSeries')?.descriptor.name).toBe('fred');
    expect(registry.get('mock')).toBeDefined();
  });

  it('falls back to mock economics when no API key is configured', () => {
    const registry = createProviderRegistry({ providers: ['fred'] });
    expect(registry.forCapability('economicSeries')?.descriptor.name).toBe('mock');
  });
});
