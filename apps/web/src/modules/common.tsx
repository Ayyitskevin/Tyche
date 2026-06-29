import { useEffect, type ReactNode } from 'react';
import type { DataProvenance, ProviderCapability } from '@tyche/contracts';
import { describeCapabilityGap } from '@tyche/module-sdk';
import { EmptyState, ErrorState, LoadingState } from '@tyche/ui';
import type { ApiDataState } from '../providers/useApiData';

export interface ModuleBodyProps<T> {
  state: ApiDataState<T>;
  missingCapabilities: ProviderCapability[];
  emptyMessage?: string;
  children: (data: T) => ReactNode;
}

/** Standard render ladder: capability gap → loading → error → empty → content. */
export function ModuleBody<T>({
  state,
  missingCapabilities,
  emptyMessage = 'No data available.',
  children,
}: ModuleBodyProps<T>) {
  if (missingCapabilities.length > 0) {
    return (
      <EmptyState
        title="Capability unavailable"
        message={describeCapabilityGap(missingCapabilities)}
        capabilities={missingCapabilities}
      />
    );
  }
  if (state.unavailable) {
    return (
      <EmptyState
        title="Capability unavailable"
        message={state.unavailable.message}
        capabilities={state.unavailable.capability ? [state.unavailable.capability] : undefined}
      />
    );
  }
  if (state.loading && state.data === null) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data === null) return <EmptyState message={emptyMessage} />;
  return <>{children(state.data)}</>;
}

/** Lift provenance to the panel frame whenever it changes. */
export function useReportProvenance(
  report: ((provenance: DataProvenance | null) => void) | undefined,
  provenance: DataProvenance | null,
): void {
  useEffect(() => {
    report?.(provenance);
  }, [report, provenance]);
}

/** Lift a short data digest to the host (for the AI copilot's context packet). */
export function useReportSummary(
  report: ((summary: string | null) => void) | undefined,
  summary: string | null,
): void {
  useEffect(() => {
    report?.(summary);
  }, [report, summary]);
}

export function SymbolRequired() {
  return (
    <EmptyState
      title="No instrument"
      message="This panel needs a symbol. Type one in the command bar, e.g. AAPL DES."
    />
  );
}
