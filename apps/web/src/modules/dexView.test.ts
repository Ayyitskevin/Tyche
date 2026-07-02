import { describe, it, expect } from 'vitest';
import { defaultDexQuery, formatPoolPrice, formatUsdCompact } from './dexView';

describe('formatPoolPrice', () => {
  it('uses 2dp at or above $1 and grouping above $1k', () => {
    expect(formatPoolPrice(3412.554)).toBe('3,412.55');
    expect(formatPoolPrice(42.1)).toBe('42.10');
    expect(formatPoolPrice(1)).toBe('1.00');
  });

  it('keeps significant digits for micro prices without scientific notation', () => {
    expect(formatPoolPrice(0.5)).toBe('0.500');
    expect(formatPoolPrice(0.00001234)).toBe('0.0000123');
    expect(formatPoolPrice(0.000000012)).toBe('0.0000000120');
    expect(formatPoolPrice(0.000000012)).not.toContain('e');
  });

  it('handles null, zero, and non-finite input', () => {
    expect(formatPoolPrice(null)).toBe('—');
    expect(formatPoolPrice(0)).toBe('0.00');
    expect(formatPoolPrice(Number.NaN)).toBe('—');
  });
});

describe('formatUsdCompact', () => {
  it('scales through K/M/B', () => {
    expect(formatUsdCompact(950)).toBe('$950');
    expect(formatUsdCompact(12_400)).toBe('$12.4K');
    expect(formatUsdCompact(3_500_000)).toBe('$3.5M');
    expect(formatUsdCompact(1_200_000_000)).toBe('$1.2B');
    expect(formatUsdCompact(null)).toBe('—');
  });
});

describe('defaultDexQuery', () => {
  it('takes the base token of the active symbol and falls back to ETH', () => {
    expect(defaultDexQuery('ETH-USD')).toBe('ETH');
    expect(defaultDexQuery('btc/usdt')).toBe('BTC');
    expect(defaultDexQuery('SOL')).toBe('SOL');
    expect(defaultDexQuery(null)).toBe('ETH');
    expect(defaultDexQuery('  ')).toBe('ETH');
  });
});
