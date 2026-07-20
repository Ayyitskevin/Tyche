import { describe, it, expect } from 'vitest';
import {
  analyticalMeta,
  annotate,
  formatAnalyticalCitation,
  isUnavailableValue,
  statusFromProvider,
  unavailable,
} from './analyticalMeta';

describe('analyticalMeta', () => {
  it('defaults model outputs to estimated and missing values to unavailable', () => {
    expect(analyticalMeta({ formulaId: 'capm.wacc.v1', value: 0.09 }).status).toBe('estimated');
    expect(analyticalMeta({ formulaId: 'capm.wacc.v1', value: null }).status).toBe('unavailable');
    expect(analyticalMeta({ formulaId: 'capm.wacc.v1', value: Number.NaN }).status).toBe('unavailable');
  });

  it('never lets a live/estimated status ride on a null value', () => {
    const meta = analyticalMeta({ formulaId: 'dcf.gordon-growth.v1', status: 'live', value: null });
    expect(meta.status).toBe('unavailable');
  });

  it('preserves partial status even when score is null (incomplete composite)', () => {
    const meta = analyticalMeta({
      formulaId: 'scoring.altman-z-prime.v1',
      status: 'partial',
      value: null,
      units: 'score',
    });
    expect(meta.status).toBe('partial');
    expect(meta.units).toBe('score');
  });

  it('annotate / unavailable attach provenance to values', () => {
    const ok = annotate(0.0879, { formulaId: 'capm.wacc.v1', units: 'ratio', source: 'user inputs' });
    expect(ok.value).toBeCloseTo(0.0879, 6);
    expect(ok.meta.formulaId).toBe('capm.wacc.v1');
    expect(ok.meta.status).toBe('estimated');

    const miss = unavailable('risk.beta.v1', { notes: 'flat benchmark' });
    expect(miss.value).toBeNull();
    expect(miss.meta.status).toBe('unavailable');
    expect(miss.meta.notes).toMatch(/flat/);
  });
});

describe('statusFromProvider', () => {
  it('maps mock / cache / delay / live tiers truthfully', () => {
    expect(statusFromProvider({ providerMode: 'mock' })).toBe('synthetic');
    expect(statusFromProvider({ freshnessTier: 'mock' })).toBe('synthetic');
    expect(statusFromProvider({ cacheHit: true })).toBe('cached');
    expect(statusFromProvider({ freshnessTier: 'delayed' })).toBe('delayed');
    expect(statusFromProvider({ stale: true })).toBe('delayed');
    expect(statusFromProvider({ freshnessTier: 'live' })).toBe('live');
    expect(statusFromProvider({ freshnessTier: 'eod' })).toBe('delayed');
    expect(statusFromProvider({})).toBe('estimated');
  });
});

describe('formatAnalyticalCitation / isUnavailableValue', () => {
  it('formats a stable citation string', () => {
    const s = formatAnalyticalCitation(
      analyticalMeta({
        formulaId: 'dcf.gordon-growth.v1',
        status: 'estimated',
        units: 'currency',
        currency: 'USD',
        asOf: '2026-07-19T00:00:00.000Z',
        provider: 'user',
      }),
    );
    expect(s).toContain('dcf.gordon-growth.v1');
    expect(s).toContain('estimated');
    expect(s).toContain('USD');
    expect(s).toContain('2026-07-19');
  });

  it('detects unavailable scalars', () => {
    expect(isUnavailableValue(null)).toBe(true);
    expect(isUnavailableValue(undefined)).toBe(true);
    expect(isUnavailableValue(Number.NaN)).toBe(true);
    expect(isUnavailableValue(0)).toBe(false);
    expect(isUnavailableValue({ score: null })).toBe(false);
  });
});
