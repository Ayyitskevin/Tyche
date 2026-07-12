import { describe, it, expect } from 'vitest';
import type { EconomicObservation } from '@tyche/contracts';
import {
  asOfYield,
  asOfTargetMs,
  buildCurve,
  curveSpread,
  TREASURY_TENORS,
} from './yieldCurve';

const ms = (d: string) => Date.parse(`${d}T00:00:00.000Z`);

const series: EconomicObservation[] = [
  { date: '2025-01-01', value: 4.0 },
  { date: '2025-02-01', value: null }, // gap
  { date: '2025-03-01', value: 4.2 },
  { date: '2025-04-01', value: 4.5 },
];

describe('asOfYield', () => {
  it('takes the latest valued point on or before the target', () => {
    expect(asOfYield(series, ms('2025-04-15'))).toBe(4.5);
    expect(asOfYield(series, ms('2025-03-10'))).toBe(4.2);
  });
  it('skips null observations when choosing', () => {
    expect(asOfYield(series, ms('2025-02-15'))).toBe(4.0); // Feb is null → falls back to Jan
  });
  it('falls back to the earliest valued point when the target precedes the series', () => {
    expect(asOfYield(series, ms('2024-06-01'))).toBe(4.0);
  });
  it('returns null when there is no valued observation', () => {
    expect(asOfYield([{ date: '2025-01-01', value: null }], ms('2025-06-01'))).toBeNull();
  });
});

describe('buildCurve', () => {
  it('reads each tenor as of the target, leaving absent series null', () => {
    const map = new Map<string, EconomicObservation[]>([
      ['DGS2', [{ date: '2025-01-01', value: 3.9 }]],
      ['DGS10', [{ date: '2025-01-01', value: 4.1 }]],
    ]);
    const curve = buildCurve(map, ms('2025-06-01'));
    expect(curve).toHaveLength(TREASURY_TENORS.length);
    expect(curve.find((p) => p.id === 'DGS2')?.yield).toBe(3.9);
    expect(curve.find((p) => p.id === 'DGS10')?.yield).toBe(4.1);
    expect(curve.find((p) => p.id === 'DGS30')?.yield).toBeNull(); // not supplied
  });
});

describe('curveSpread', () => {
  const curve = buildCurve(
    new Map<string, EconomicObservation[]>([
      ['DGS2', [{ date: '2025-01-01', value: 3.95 }]],
      ['DGS3MO', [{ date: '2025-01-01', value: 4.3 }]],
      ['DGS10', [{ date: '2025-01-01', value: 4.1 }]],
    ]),
    ms('2025-06-01'),
  );
  it('is long − short, so an upward curve is positive and inversion is negative', () => {
    expect(curveSpread(curve, 'DGS2', 'DGS10')).toBeCloseTo(0.15, 6); // 4.1 − 3.95
    expect(curveSpread(curve, 'DGS3MO', 'DGS10')).toBeCloseTo(-0.2, 6); // 4.1 − 4.3 (inverted)
  });
  it('is null when either leg is missing', () => {
    expect(curveSpread(curve, 'DGS5', 'DGS10')).toBeNull();
  });
});

describe('asOfTargetMs', () => {
  it('subtracts whole days from now', () => {
    const now = ms('2025-06-30');
    expect(asOfTargetMs(now, 0)).toBe(now);
    expect(asOfTargetMs(now, 30)).toBe(now - 30 * 86_400_000);
  });
});
