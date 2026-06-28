import type { Quote } from '@tyche/contracts';
import { gaussian, round, seededRng, type ProviderRegistry } from '@tyche/data-adapters';

export interface QuoteTick {
  quotes: Quote[];
}

/**
 * Streaming hub for quote updates. Each subscription polls the quote-capable
 * provider for a baseline, then applies a small seeded random walk per tick so
 * the demo "moves" without diverging far from the deterministic baseline. The
 * client receives only the subscribed symbols and updates its store by symbol.
 */
export class QuoteStreamHub {
  private subscriptionSeq = 0;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly intervalMs = 1500,
  ) {}

  subscribe(symbols: string[], onTick: (tick: QuoteTick) => void): () => void {
    const id = ++this.subscriptionSeq;
    const provider = this.registry.forCapability('quotes');
    const walk = new Map<string, number>();
    let stopped = false;

    const emit = async () => {
      if (stopped || !provider) return;
      try {
        const { data } = await provider.getQuotes(symbols);
        const rng = seededRng('stream', id, Math.floor(Date.now() / this.intervalMs));
        const jittered = data.map((q): Quote => {
          const prevDrift = walk.get(q.symbol) ?? 0;
          const drift = prevDrift + gaussian(rng) * q.price * 0.0006;
          walk.set(q.symbol, drift);
          const price = round(q.price + drift, 2);
          const change = round(price - (q.prevClose ?? q.price), 2);
          const changePercent = q.prevClose ? round((change / q.prevClose) * 100, 2) : (q.changePercent ?? 0);
          return { ...q, price, change, changePercent, timestamp: new Date().toISOString() };
        });
        onTick({ quotes: jittered });
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
