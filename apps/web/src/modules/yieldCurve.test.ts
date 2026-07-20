/**
 * Golden + null-safety tests for Treasury yield-curve helpers.
 * Formula id: yield.curve-spread.v1 (see @tyche/analytics formulas registry).
 */
import { describe, it, expect } from 'vitest';
import type { EconomicObservation } from '@tyche/contracts';
import {
  asOfYield,
  buildCurve,
  curveSpread,
  KEY_SPREADS,
  TREASURY_TENORS,
} from './yieldCurve';

function obs(date: string, value: number | null): EconomicObservation {
  return { date, value };
}

describe('asOfYield', () => {
  const series = [
    obs('2024-01-01', 4.1),
    obs('2024-02-01', null), // missing — skipped
    obs('2024-03-01', 4.3),
    obs('2024-04-01', 4.5),
  ];

  it('picks the latest valued observation on or before the target', () => {
    expect(asOfYield(series, Date.parse('2024-03-15T00:00:00.000Z'))).toBeCloseTo(4.3, 6);
    expect(asOfYield(series, Date.parse('2024-04-01T00:00:00.000Z'))).toBeCloseTo(4.5, 6);
  });

  it('skips null observations rather than treating them as zero', () => {
    expect(asOfYield(series, Date.parse('2024-02-15T00:00:00.000Z'))).toBeCloseTo(4.1, 6);
  });

  it('returns null on an empty or all-null series (unavailable ≠ 0)', () => {
    expect(asOfYield([], Date.now())).toBeNull();
    expect(asOfYield([obs('2024-01-01', null)], Date.now())).toBeNull();
  });
});

describe('curveSpread / buildCurve', () => {
  it('computes long − short in percentage points; negative = inverted', () => {
    const curve = TREASURY_TENORS.map((t) => ({
      ...t,
      yield: t.id === 'DGS2' ? 4.5 : t.id === 'DGS10' ? 4.0 : t.id === 'DGS5' ? 4.2 : t.id === 'DGS30' ? 4.3 : 3.5,
    }));
    expect(curveSpread(curve, 'DGS2', 'DGS10')).toBeCloseTo(-0.5, 6); // inverted 2s10s
    expect(curveSpread(curve, 'DGS5', 'DGS30')).toBeCloseTo(0.1, 6);
  });

  it('nulls spreads when either tenor is missing', () => {
    const curve = TREASURY_TENORS.map((t) => ({
      ...t,
      yield: t.id === 'DGS10' ? 4.0 : null,
    }));
    expect(curveSpread(curve, 'DGS2', 'DGS10')).toBeNull();
  });

  it('buildCurve reads each tenor as-of without inventing missing series', () => {
    const map = new Map<string, EconomicObservation[]>();
    map.set('DGS10', [obs('2024-06-01', 4.25)]);
    const curve = buildCurve(map, Date.parse('2024-06-15T00:00:00.000Z'));
    const dgs10 = curve.find((p) => p.id === 'DGS10');
    const dgs2 = curve.find((p) => p.id === 'DGS2');
    expect(dgs10?.yield).toBeCloseTo(4.25, 6);
    expect(dgs2?.yield).toBeNull(); // no series → null, not 0
  });

  it('KEY_SPREADS cover the standard inversion monitors', () => {
    expect(KEY_SPREADS.map((s) => s.key).sort()).toEqual(['2s10s', '3m10y', '5s30s'].sort());
  });
});
