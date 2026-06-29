import type { Quote, TradePrint } from '@tyche/contracts';
import { gaussian, intInRange, pick, round, seededRng, type ProviderRegistry } from '@tyche/data-adapters';

export interface QuoteTick {
  quotes: Quote[];
}

export interface TradeTick {
  prints: TradePrint[];
}

const TRADE_VENUES = ['XNAS', 'ARCX', 'BATS', 'EDGX'] as const;

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

  /**
   * Stream synthetic time-&-sales prints for one symbol. Seeds a price baseline
   * from `getTrades`, then emits 1–4 fresh prints per tick along a seeded random
   * walk so the demo tape "moves" deterministically. Best-effort, like quotes.
   */
  subscribeTrades(symbol: string, onTick: (tick: TradeTick) => void): () => void {
    const id = ++this.subscriptionSeq;
    const provider = this.registry.forCapability('trades');
    let stopped = false;
    let lastPrice = 0;

    const emit = async () => {
      if (stopped || !provider) return;
      try {
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
