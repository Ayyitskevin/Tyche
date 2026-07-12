import { describe, it, expect } from 'vitest';
import { NewsItemSchema } from '@tyche/contracts';
import { GdeltNewsProvider } from './GdeltNewsProvider';
import type { FetchLike } from './stubs/FredProvider';
import { checkProviderConformance } from './conformance';
import { createProviderRegistry } from './providerRegistry';

const GDELT = {
  articles: [
    { url: 'https://example.com/a', title: 'Markets rally on data', seendate: '20250611T120000Z', domain: 'example.com' },
    { url: 'https://news.test/b', title: 'Tech shares climb', seendate: '20250611T090000Z', domain: 'news.test' },
    { title: 'no url — dropped', seendate: '20250611T080000Z' },
    { url: 'https://x.test/c', title: 'bad date — dropped', seendate: 'not-a-date' },
  ],
};

function makeFetch(
  urlSink: string[] = [],
  opts: { ok?: boolean; status?: number; throwErr?: boolean } = {},
): FetchLike {
  return (url) => {
    urlSink.push(url);
    if (opts.throwErr) return Promise.reject(new Error('network down'));
    return Promise.resolve({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: () => Promise.resolve(GDELT),
    });
  };
}

describe('GdeltNewsProvider', () => {
  it('maps GDELT articles to schema-valid NewsItems, dropping malformed rows', async () => {
    const provider = new GdeltNewsProvider({ fetchImpl: makeFetch(), minIntervalMs: 0 });
    const { data, provenance } = await provider.getNews({ symbol: 'aapl', limit: 10 });
    expect(data).toHaveLength(2); // no-url and bad-date rows dropped
    expect(data[0]).toMatchObject({
      headline: 'Markets rally on data',
      url: 'https://example.com/a',
      source: 'example.com',
    });
    expect(data[0]?.publishedAt).toBe('2025-06-11T12:00:00.000Z');
    expect(data[0]?.symbols).toEqual(['AAPL']); // echoed from the query
    for (const n of data) expect(NewsItemSchema.safeParse(n).success).toBe(true);
    expect(provenance?.provider).toBe('gdelt');
    expect(provenance?.capability).toBe('news');
  });

  it('builds a finance-context symbol query, passes a keyword through, and defaults to a markets feed', async () => {
    const urls: string[] = [];
    const provider = new GdeltNewsProvider({ fetchImpl: makeFetch(urls), minIntervalMs: 0 });
    await provider.getNews({ symbol: 'AAPL' });
    await provider.getNews({ keyword: 'inflation' });
    await provider.getNews({});
    // URLSearchParams encodes spaces as '+', which decodeURIComponent leaves as '+'.
    const dec = (u: string) => decodeURIComponent(u).replace(/\+/g, ' ');
    expect(dec(urls[0]!)).toContain('"AAPL"');
    expect(dec(urls[1]!)).toContain('query=inflation');
    expect(dec(urls[2]!)).toContain('stock market');
  });

  it('degrades a failed or rate-limited request to an empty feed (not an error)', async () => {
    const failing = new GdeltNewsProvider({ fetchImpl: makeFetch([], { throwErr: true }), minIntervalMs: 0 });
    expect((await failing.getNews({ symbol: 'AAPL' })).data).toEqual([]);
    const limited = new GdeltNewsProvider({ fetchImpl: makeFetch([], { ok: false, status: 429 }), minIntervalMs: 0 });
    expect((await limited.getNews({})).data).toEqual([]);
  });

  it('passes conformance for the news capability', async () => {
    const provider = new GdeltNewsProvider({ fetchImpl: makeFetch(), minIntervalMs: 0 });
    const report = await checkProviderConformance(provider);
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });
});

describe('provider registry routing for GDELT', () => {
  it('routes news to gdelt when enabled before mock', () => {
    const registry = createProviderRegistry({ providers: ['gdelt', 'mock'] });
    expect(registry.forCapability('news')?.descriptor.name).toBe('gdelt');
    expect(registry.get('mock')).toBeDefined();
  });

  it('falls back to mock news when gdelt is not enabled', () => {
    const registry = createProviderRegistry({ providers: ['mock'] });
    expect(registry.forCapability('news')?.descriptor.name).toBe('mock');
  });
});
