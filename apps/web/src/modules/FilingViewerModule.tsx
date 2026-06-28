import { useState } from 'react';
import type { DataProvenance } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { describeCapabilityGap } from '@tyche/module-sdk';
import { EmptyState, ErrorState } from '@tyche/ui';
import { useReportProvenance } from './common';

/**
 * Renders a filing's EDGAR document inside the workspace via a sandboxed iframe.
 * The filing url/metadata/provenance are passed through panel `state` by the
 * FilingsModule row click. In mock mode (no document url) it shows a clear
 * EmptyState; it never trusts the embed (sandboxed, no-referrer) and always
 * offers an external "Open on SEC.gov" link.
 */
export function FilingViewerModule({ state, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const url = typeof state.filingUrl === 'string' ? state.filingUrl : null;
  const form = typeof state.filingForm === 'string' ? state.filingForm : 'Filing';
  const title = typeof state.filingTitle === 'string' ? state.filingTitle : '';
  const accession = typeof state.accessionNumber === 'string' ? state.accessionNumber : '';
  const provenance = (state.provenance as DataProvenance | null) ?? null;
  const [failed, setFailed] = useState(false);

  useReportProvenance(reportProvenance, provenance);

  if (missingCapabilities.length > 0) {
    return (
      <EmptyState
        title="Capability unavailable"
        message={describeCapabilityGap(missingCapabilities)}
        capabilities={missingCapabilities}
      />
    );
  }

  if (!url) {
    return (
      <EmptyState
        title={`${form}${accession ? ` · ${accession}` : ''}`}
        message="No document URL is available for this filing. The mock provider supplies filing metadata only — enable the SEC EDGAR provider (SEC_EDGAR_USER_AGENT) to view the real document."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1 text-[11px]">
        <span className="truncate text-zinc-300">
          {form}
          {accession && <span className="text-zinc-500"> · {accession}</span>}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800"
        >
          Open on SEC.gov ↗
        </a>
      </div>
      <div className="min-h-0 flex-1">
        {failed ? (
          <ErrorState message="The document could not be embedded here. Use “Open on SEC.gov”." />
        ) : (
          <iframe
            title={title || `${form} ${accession}`}
            src={url}
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-full w-full bg-white"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
