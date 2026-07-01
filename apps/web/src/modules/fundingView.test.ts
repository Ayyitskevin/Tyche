import { describe, it, expect } from 'vitest';
import { formatRatePct, fundingCountdown } from './fundingView';

describe('funding view helpers', () => {
  it('formats signed rate percentages', () => {
    expect(formatRatePct(0.0001)).toBe('+0.0100%');
    expect(formatRatePct(-0.00025)).toBe('-0.0250%');
    expect(formatRatePct(0)).toBe('0.0000%');
  });

  it('renders a countdown to the next funding', () => {
    const now = Date.parse('2026-07-01T10:00:00Z');
    expect(fundingCountdown('2026-07-01T12:14:30Z', now)).toBe('2h 14m');
    expect(fundingCountdown('2026-07-01T10:05:00Z', now)).toBe('5m');
    expect(fundingCountdown('2026-07-01T09:00:00Z', now)).toBe('now');
    expect(fundingCountdown(undefined, now)).toBe('—');
  });
});
