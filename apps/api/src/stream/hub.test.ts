import { describe, it, expect } from 'vitest';
import { createProviderRegistry } from '@tyche/data-adapters';
import { QuoteStreamHub } from './hub';

describe('QuoteStreamHub.subscribeTrades', () => {
  it('emits trade prints and stops cleanly on unsubscribe', async () => {
    const registry = createProviderRegistry({ providers: [] });
    const hub = new QuoteStreamHub(registry, 40);
    const ticks: Array<{ prints: Array<{ symbol: string; price: number; size: number }> }> = [];
    const unsubscribe = hub.subscribeTrades('AAPL', (t) => ticks.push(t));

    await new Promise((r) => setTimeout(r, 150));
    unsubscribe();

    expect(ticks.length).toBeGreaterThan(0);
    const print = ticks[0]!.prints[0]!;
    expect(print.symbol).toBe('AAPL');
    expect(typeof print.price).toBe('number');
    expect(print.price).toBeGreaterThan(0);
    expect(typeof print.size).toBe('number');

    const afterStop = ticks.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(ticks.length).toBe(afterStop); // no ticks after unsubscribe
  });
});
