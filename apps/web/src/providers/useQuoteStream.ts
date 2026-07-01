import { useEffect, useRef, useState } from 'react';
import type { Quote } from '@tyche/contracts';
import { API_BASE_URL } from '../constants';

/**
 * Subscribe to the SSE quote stream for a set of symbols. Returns a live map of
 * symbol → latest quote. The stream pushes only the subscribed symbols; the map
 * is updated in place so virtualized tables stay cheap.
 */
export function useQuoteStream(symbols: string[]): Record<string, Quote> {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const key = symbols.join(',');
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (key.length === 0) {
      setQuotes({});
      return;
    }
    const source = new EventSource(`${API_BASE_URL}/api/stream/quotes?symbols=${encodeURIComponent(key)}`, { withCredentials: true });
    sourceRef.current = source;
    source.addEventListener('quote', (event) => {
      try {
        const tick = JSON.parse((event as MessageEvent).data) as { quotes: Quote[] };
        setQuotes((prev) => {
          const next = { ...prev };
          for (const quote of tick.quotes) next[quote.symbol] = quote;
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    });
    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [key]);

  return quotes;
}
