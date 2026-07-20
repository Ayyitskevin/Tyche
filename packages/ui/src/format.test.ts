import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatPercent, formatSigned } from './format';

/**
 * Display contract for unavailable analytics: null / NaN / Infinity render as
 * "—", never as "0" or "NaN". Portfolio risk tiles, performance Sharpe, DEX
 * nullables, and trade-flow VWAP all depend on this.
 */
describe('formatNumber / formatPercent unavailable display', () => {
  it('renders null, undefined, NaN, and Infinity as em dash', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatNumber(v as number | null | undefined)).toBe('—');
      expect(formatPercent(v as number | null | undefined)).toBe('—');
      expect(formatSigned(v as number | null | undefined)).toBe('—');
      expect(formatCurrency(v as number | null | undefined)).toBe('—');
    }
  });

  it('never paints a zero for a missing ratio (0 is only for a real zero)', () => {
    expect(formatNumber(null)).not.toBe('0');
    expect(formatNumber(null)).not.toBe('0.00');
    expect(formatPercent(null)).not.toBe('0.00%');
    // A true zero remains a zero (defined empty aggregate), not an em dash.
    expect(formatNumber(0)).toMatch(/^0/);
  });

  it('formats finite skill ratios for display tiles', () => {
    expect(formatNumber(1.234, { decimals: 2 })).toBe('1.23');
    expect(formatPercent(12.5, 1)).toBe('12.5%');
  });
});
