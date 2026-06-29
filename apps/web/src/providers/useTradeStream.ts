import { useEffect, useState } from 'react';
import type { TradePrint } from '@tyche/contracts';
import { API_BASE_URL } from '../constants';

/**
 * Prepend a tick's prints (newest first) onto the existing buffer and cap the
 * total length. Pure + exported so the ring-buffer behavior is unit-testable.
 */
export function mergeTradePrints(prev: TradePrint[], incoming: TradePrint[], cap: number): TradePrint[] {
  // Within a tick the last print is the newest; reverse so newest lands on top.
  return [...[...incoming].reverse(), ...prev].slice(0, cap);
}

/**
 * Subscribe to the SSE trade stream for one symbol. Returns a bounded ring buffer
 * of prints, newest first, so the tape never grows unbounded.
 */
export function useTradeStream(symbol: string | null, cap = 500): TradePrint[] {
  const [prints, setPrints] = useState<TradePrint[]>([]);

  useEffect(() => {
    if (!symbol) {
      setPrints([]);
      return;
    }
    const source = new EventSource(`${API_BASE_URL}/api/stream/trades?symbol=${encodeURIComponent(symbol)}`);
    source.addEventListener('trade', (event) => {
      try {
        const tick = JSON.parse((event as MessageEvent).data) as { prints: TradePrint[] };
        setPrints((prev) => mergeTradePrints(prev, tick.prints, cap));
      } catch {
        // ignore malformed frames
      }
    });
    return () => source.close();
  }, [symbol, cap]);

  return prints;
}
