import type { AlertRule, Quote } from '@tyche/contracts';

/** The numeric value of the rule's field on a quote, or null when absent. */
export function fieldValue(rule: AlertRule, quote: Quote): number | null {
  const v =
    rule.field === 'price' ? quote.price : rule.field === 'changePercent' ? quote.changePercent : quote.volume;
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
}

/**
 * Pure, instantaneous predicate for a rule against a quote. `crosses_*` need the
 * previous field value (the tick before) to detect a transition; the threshold
 * operators are stateless comparisons. Returns false when the field is absent.
 */
export function evaluateRule(rule: AlertRule, quote: Quote, prev?: number): boolean {
  const v = fieldValue(rule, quote);
  if (v === null) return false;
  switch (rule.operator) {
    case 'gt':
      return v > rule.threshold;
    case 'gte':
      return v >= rule.threshold;
    case 'lt':
      return v < rule.threshold;
    case 'lte':
      return v <= rule.threshold;
    case 'crosses_above':
      return prev !== undefined && prev < rule.threshold && v >= rule.threshold;
    case 'crosses_below':
      return prev !== undefined && prev > rule.threshold && v <= rule.threshold;
    default:
      return false;
  }
}

/**
 * Stateful evaluator for one stream connection. Tracks the previous field value
 * (for `crosses_*`) and the previous predicate result per rule so a rule fires
 * exactly once on the rising edge — a `price > 200` rule fires when it first goes
 * above, not on every tick while above. Inactive rules are skipped. `oneShot`
 * deactivation is the caller's concern (it persists the rule).
 */
export class AlertEvaluator {
  private readonly prevValue = new Map<string, number>();
  private readonly lastResult = new Map<string, boolean>();

  /** Rules (for this quote's symbol) that fired on the rising edge of their predicate. */
  evaluate(rules: AlertRule[], quote: Quote): AlertRule[] {
    const fired: AlertRule[] = [];
    for (const rule of rules) {
      if (!rule.active || rule.symbol !== quote.symbol) continue;
      const v = fieldValue(rule, quote);
      if (v === null) continue;
      const prev = this.prevValue.get(rule.id);
      const now = evaluateRule(rule, quote, prev);
      const before = this.lastResult.get(rule.id) ?? false;
      this.prevValue.set(rule.id, v);
      this.lastResult.set(rule.id, now);
      if (now && !before) fired.push(rule);
    }
    return fired;
  }
}
