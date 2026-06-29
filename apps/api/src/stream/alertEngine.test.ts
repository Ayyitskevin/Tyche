import { describe, it, expect } from 'vitest';
import type { AlertRule, Quote } from '@tyche/contracts';
import { AlertEvaluator, evaluateRule, fieldValue } from './alertEngine';

function rule(over: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'a1',
    symbol: 'AAPL',
    field: 'price',
    operator: 'gt',
    threshold: 100,
    active: true,
    oneShot: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastTriggeredAt: null,
    ...over,
  };
}

function quote(over: Partial<Quote> = {}): Quote {
  return {
    symbol: 'AAPL',
    price: 100,
    change: 0,
    changePercent: 0,
    volume: 1000,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('fieldValue', () => {
  it('reads price, changePercent, and volume', () => {
    expect(fieldValue(rule({ field: 'price' }), quote({ price: 42 }))).toBe(42);
    expect(fieldValue(rule({ field: 'changePercent' }), quote({ changePercent: -1.5 }))).toBe(-1.5);
    expect(fieldValue(rule({ field: 'volume' }), quote({ volume: 5000 }))).toBe(5000);
  });

  it('returns null for an absent field', () => {
    expect(fieldValue(rule({ field: 'volume' }), quote({ volume: undefined }))).toBeNull();
  });
});

describe('evaluateRule (instantaneous predicate)', () => {
  it('handles threshold operators', () => {
    expect(evaluateRule(rule({ operator: 'gt', threshold: 100 }), quote({ price: 101 }))).toBe(true);
    expect(evaluateRule(rule({ operator: 'gt', threshold: 100 }), quote({ price: 100 }))).toBe(false);
    expect(evaluateRule(rule({ operator: 'gte', threshold: 100 }), quote({ price: 100 }))).toBe(true);
    expect(evaluateRule(rule({ operator: 'lt', threshold: 100 }), quote({ price: 99 }))).toBe(true);
    expect(evaluateRule(rule({ operator: 'lte', threshold: 100 }), quote({ price: 100 }))).toBe(true);
    expect(evaluateRule(rule({ operator: 'lt', threshold: 100 }), quote({ price: 100 }))).toBe(false);
  });

  it('requires the previous value for crosses_above / crosses_below', () => {
    const up = rule({ operator: 'crosses_above', threshold: 200 });
    expect(evaluateRule(up, quote({ price: 205 }), 195)).toBe(true);
    expect(evaluateRule(up, quote({ price: 205 }), 201)).toBe(false); // already above
    expect(evaluateRule(up, quote({ price: 205 }))).toBe(false); // no prev → can't cross
    const down = rule({ operator: 'crosses_below', threshold: 200 });
    expect(evaluateRule(down, quote({ price: 195 }), 205)).toBe(true);
    expect(evaluateRule(down, quote({ price: 195 }), 199)).toBe(false);
  });

  it('is false when the field is absent', () => {
    expect(evaluateRule(rule({ field: 'volume', operator: 'gt', threshold: 1 }), quote({ volume: undefined }))).toBe(false);
  });
});

describe('AlertEvaluator (rising-edge, fire-once)', () => {
  it('fires once when a threshold is first crossed, not on every tick above', () => {
    const ev = new AlertEvaluator();
    const r = rule({ operator: 'gt', threshold: 100 });
    expect(ev.evaluate([r], quote({ price: 99 }))).toEqual([]); // below
    expect(ev.evaluate([r], quote({ price: 101 }))).toHaveLength(1); // rising edge → fire
    expect(ev.evaluate([r], quote({ price: 102 }))).toEqual([]); // still above → no re-fire
    expect(ev.evaluate([r], quote({ price: 98 }))).toEqual([]); // drops below → no fire
    expect(ev.evaluate([r], quote({ price: 103 }))).toHaveLength(1); // re-crosses up → fire again
  });

  it('fires crosses_above exactly once on the crossing tick', () => {
    const ev = new AlertEvaluator();
    const r = rule({ operator: 'crosses_above', threshold: 200 });
    expect(ev.evaluate([r], quote({ price: 190 }))).toEqual([]); // seed prev
    expect(ev.evaluate([r], quote({ price: 205 }))).toHaveLength(1); // crossed
    expect(ev.evaluate([r], quote({ price: 210 }))).toEqual([]); // stays above
  });

  it('skips inactive rules and other symbols', () => {
    const ev = new AlertEvaluator();
    const inactive = rule({ id: 'x', active: false, operator: 'gt', threshold: 1 });
    const otherSymbol = rule({ id: 'y', symbol: 'MSFT', operator: 'gt', threshold: 1 });
    expect(ev.evaluate([inactive, otherSymbol], quote({ price: 999 }))).toEqual([]);
  });
});
