import type { Quote, TradePrint } from '@tyche/contracts';
import {
  gaussian,
  intInRange,
  pick,
  round,
  seededRng,
  type DataProvider,
  type ProviderRegistry,
} from '@tyche/data-adapters';

export interface QuoteTick {
  quotes: Quote[];
}

export interface TradeTick {
  prints: TradePrint[];
}

const TRADE_VENUES = ['XNAS', 'ARCX', 'BATS', 'EDGX'] as const;

/**
 * Streaming hub for quote updates. Symbols are grouped per provider through
 * symbol-aware capability resolution, so a mixed watchlist streams equities
 * from one provider and crypto pairs from another in the same subscription.
 * Mock-mode providers get a small seeded random walk per tick so the demo
 * "moves"; real providers are passed through untouched — live data is never
 * jittered.
 */
export class QuoteStreamHub {
  private subscriptionSeq = 0;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly intervalMs = 1500,
  ) {}

  subscribe(symbols: string[], onTick: (tick: QuoteTick) => void): () => void {
    const id = ++this.subscriptionSeq;
    const groups = new Map<DataProvider, string[]>();
    for (const symbol of symbols) {
      const provider = this.registry.forCapability('quotes', symbol);
      if (!provider) continue;
      const group = groups.get(provider) ?? [];
      group.push(symbol);
      groups.set(provider, group);
    }
    const walk = new Map<string, number>();
    let stopped = false;

    const emit = async () => {
      if (stopped || groups.size === 0) return;
      const collected: Quote[] = [];
      await Promise.all(
        [...groups.entries()].map(async ([provider, group]) => {
          try {
            const { data } = await provider.getQuotes(group);
            if (provider.descriptor.mode !== 'mock') {
              collected.push(...data);
              return;
            }
            const rng = seededRng('stream', id, Math.floor(Date.now() / this.intervalMs));
            for (const q of data) {
              const prevDrift = walk.get(q.symbol) ?? 0;
              const drift = prevDrift + gaussian(rng) * q.price * 0.0006;
              walk.set(q.symbol, drift);
              const price = round(q.price + drift, 2);
              const change = round(price - (q.prevClose ?? q.price), 2);
              const changePercent = q.prevClose ? round((change / q.prevClose) * 100, 2) : (q.changePercent ?? 0);
              collected.push({ ...q, price, change, changePercent, timestamp: new Date().toISOString() });
            }
          } catch {
            // Streaming is best-effort; ignore transient provider errors.
          }
        }),
      );
      if (!stopped && collected.length > 0) onTick({ quotes: collected });
    };

    void emit();
    const timer = setInterval(() => void emit(), this.intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  /**
   * Stream time-&-sales prints for one symbol. Mock-mode providers get a
   * synthetic seeded walk (the demo tape). Real providers are polled for their
   * actual recent prints, de-duplicated by timestamp watermark.
   */
  subscribeTrades(symbol: string, onTick: (tick: TradeTick) => void): () => void {
    const id = ++this.subscriptionSeq;
    const provider = this.registry.forCapability('trades', symbol);
    const synthetic = provider?.descriptor.mode === 'mock';
    let stopped = false;
    let lastPrice = 0;
    let watermark = '';

    const emit = async () => {
      if (stopped || !provider) return;
      try {
        if (!synthetic) {
          const { data } = await provider.getTrades(symbol, 12);
          const fresh = data.filter((t) => t.timestamp > watermark);
          if (fresh.length > 0) {
            watermark = fresh.reduce((max, t) => (t.timestamp > max ? t.timestamp : max), watermark);
            // getTrades returns newest-first; the tape prepends, so keep that order.
            if (!stopped) onTick({ prints: fresh });
          }
          return;
        }
        if (lastPrice === 0) {
          const { data } = await provider.getTrades(symbol, 1);
          lastPrice = data[0]?.price ?? 100;
        }
        const rng = seededRng('trades', id, Math.floor(Date.now() / this.intervalMs));
        const count = intInRange(rng, 1, 4);
        const prints: TradePrint[] = [];
        for (let i = 0; i < count; i++) {
          lastPrice = Math.max(0.01, round(lastPrice + gaussian(rng) * lastPrice * 0.0006, 2));
          prints.push({
            symbol,
            timestamp: new Date().toISOString(),
            price: lastPrice,
            size: intInRange(rng, 1, 1000),
            side: rng() > 0.5 ? 'buy' : 'sell',
            venue: pick(rng, TRADE_VENUES),
          });
        }
        if (!stopped) onTick({ prints });
      } catch {
        // Streaming is best-effort; ignore transient provider errors.
      }
    };

    void emit();
    const timer = setInterval(() => void emit(), this.intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
}
