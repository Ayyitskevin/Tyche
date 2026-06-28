import { useEffect, useState } from 'react';
import type { DataProvenance } from '@tyche/contracts';
import type { EnvelopeResult } from './apiClient';

export interface ApiDataState<T> {
  data: T | null;
  provenance: DataProvenance | null;
  loading: boolean;
  error: string | null;
  /** Set when the API reports a missing-capability rather than a hard error. */
  unavailable: { capability?: string; message: string } | null;
  reload: () => void;
}

/**
 * Run an API loader, tracking loading/error/provenance and distinguishing a
 * graceful "capability unavailable" response from a real error. `deps` controls
 * re-fetching; `reload()` forces it.
 */
export function useApiData<T>(loader: () => Promise<EnvelopeResult<T>>, deps: unknown[]): ApiDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [provenance, setProvenance] = useState<DataProvenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<{ capability?: string; message: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(null);
    loader()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setData(result.data);
          setProvenance(result.provenance);
        } else if (result.error.kind === 'capability_unavailable') {
          setUnavailable({ capability: result.error.capability, message: result.error.message });
        } else {
          setError(result.error.message);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, provenance, loading, error, unavailable, reload: () => setNonce((n) => n + 1) };
}
