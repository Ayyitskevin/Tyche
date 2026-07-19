import { describe, it, expect } from 'vitest';
import type { Candle } from '@tyche/contracts';
import { seasonality } from './seasonality';

const c = (t: string, close: number): Candle => ({ t: `${t}T00:00:00.000Z`, o: close, h: close, l: close, c: close });

describe('seasonality', () => {
  it('is empty-safe with twelve null months', () => {
    const s = seasonality([], 'AAPL');
    expect(s.observations).toBe(0);
    expect(s.firstDate).toBeNull();
    expect(s.months).toHaveLength(12);
    expect(s.months.every((m) => m.count === 0 && m.avgReturn === null)).toBe(true);
  });

  it('aggregates month-end returns by calendar month, using the last close within each month', () => {
    const s = seasonality(
      [
        c('2021-12-31', 100),
        c('2022-01-15', 105), // mid-month — must be superseded by the month-end close
        c('2022-01-31', 110), // Jan 2022 close → Jan return 110/100 − 1 = +0.10
        c('2022-12-31', 100),
        c('2023-01-31', 120), // Jan 2023 close → Jan return 120/100 − 1 = +0.20
      ],
      'AAPL',
    );
    const jan = s.months[0]!;
    expect(jan.label).toBe('Jan');
    expect(jan.count).toBe(2);
    expect(jan.avgReturn).toBeCloseTo(0.15, 6); // (0.10 + 0.20) / 2
    expect(jan.medianReturn).toBeCloseTo(0.15, 6);
    expect(jan.positiveRate).toBeCloseTo(1, 6);
    expect(jan.best).toBeCloseTo(0.2, 6);
    expect(jan.worst).toBeCloseTo(0.1, 6);

    const feb = s.months[1]!;
    expect(feb.count).toBe(0); // never observed
    expect(feb.avgReturn).toBeNull();

    expect(s.observations).toBe(3); // 4 distinct month-ends → 3 monthly returns
    expect(s.firstDate).toBe('2021-12-31');
    expect(s.lastDate).toBe('2023-01-31');
  });
});
