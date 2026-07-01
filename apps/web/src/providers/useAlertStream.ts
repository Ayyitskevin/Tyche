import { useEffect, useRef } from 'react';
import type { AlertRule, Quote } from '@tyche/contracts';
import { API_BASE_URL } from '../constants';

export interface AlertEvent {
  rule: AlertRule;
  quote: Quote;
  firedAt: string;
}

/**
 * Subscribe to the dedicated alert SSE stream for a set of symbols. The server
 * evaluates the user's active rules against the live quote ticks and pushes an
 * `alert` frame on each fire. `onFire` is held in a ref so the subscription is
 * not torn down when the callback identity changes.
 */
export function useAlertStream(symbols: string[], onFire: (event: AlertEvent) => void): void {
  const callbackRef = useRef(onFire);
  callbackRef.current = onFire;
  const key = symbols.join(',');

  useEffect(() => {
    if (key.length === 0) return;
    const source = new EventSource(`${API_BASE_URL}/api/stream/alerts?symbols=${encodeURIComponent(key)}`, { withCredentials: true });
    source.addEventListener('alert', (event) => {
      try {
        callbackRef.current(JSON.parse((event as MessageEvent).data) as AlertEvent);
      } catch {
        // ignore malformed frames
      }
    });
    return () => source.close();
  }, [key]);
}
