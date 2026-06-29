import type { DataProvenance } from '@tyche/contracts';
import { FreshnessBadge } from './FreshnessBadge';

export interface ProvenanceBadgeProps {
  provenance: DataProvenance | null;
  className?: string;
}

/**
 * Renders the data provenance line every panel carries: which provider, in what
 * mode, plus a freshness chip. Hover shows attribution/license.
 */
export function ProvenanceBadge({ provenance, className = '' }: ProvenanceBadgeProps) {
  if (!provenance) {
    return (
      <span className={`text-[10px] text-zinc-500 ${className}`}>no provenance available</span>
    );
  }
  const tooltip = [
    provenance.attribution,
    provenance.license ? `License: ${provenance.license}` : null,
    provenance.cacheHit ? 'served from cache' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Surface attribution as a visible chip (not just a tooltip) for non-mock
  // sources, so a BYO/live feed's required credit is never hidden.
  const attributionLabel =
    provenance.providerMode !== 'mock' ? provenance.attribution ?? provenance.license : undefined;
  return (
    <span className={`flex items-center gap-1.5 text-[10px] text-zinc-500 ${className}`} title={tooltip}>
      <span className="font-medium text-zinc-400">{provenance.provider}</span>
      <span className="rounded bg-zinc-800 px-1 py-0.5 uppercase tracking-wide text-zinc-400">
        {provenance.providerMode}
      </span>
      <FreshnessBadge freshness={provenance.freshness} />
      {attributionLabel && (
        <span className="rounded bg-amber-500/15 px-1 py-0.5 text-amber-300/90" title="attribution">
          {attributionLabel}
        </span>
      )}
    </span>
  );
}
