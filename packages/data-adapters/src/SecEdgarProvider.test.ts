import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { FilingSchema } from '@tyche/contracts';
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

function makeFetch(headerSink: Array<Record<string, string>> = []): FetchLike {
  return (url, init) => {
    if (init?.headers) headerSink.push(init.headers);
    const body = url.includes('company_tickers')
      ? TICKER_MAP
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

  it('passes conformance for the filings capability', async () => {
    const provider = new SecEdgarProvider({ userAgent: ua, fetchImpl: makeFetch(), minIntervalMs: 0 });
    const report = await checkProviderConformance(provider, { equitySymbol: 'AAPL', cryptoSymbol: 'AAPL' });
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });
});

describe('provider registry routing for EDGAR', () => {
  it('routes filings to secedgar when enabled with a User-Agent', () => {
    const registry = createProviderRegistry({ providers: ['secedgar'], secEdgarUserAgent: ua });
    expect(registry.forCapability('filings')?.descriptor.name).toBe('secedgar');
    expect(registry.get('mock')).toBeDefined();
  });

  it('falls back to mock filings when no User-Agent is configured', () => {
    const registry = createProviderRegistry({ providers: ['secedgar'] });
    expect(registry.forCapability('filings')?.descriptor.name).toBe('mock');
  });
});
