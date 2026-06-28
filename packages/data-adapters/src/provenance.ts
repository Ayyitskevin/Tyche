import type { DataProvenance, Envelope, FreshnessTier, ProviderMode } from '@tyche/contracts';

export interface ProvenanceInit {
  provider: string;
  providerMode: ProviderMode;
  capability: string;
  tier: FreshnessTier;
  /** Timestamp the data represents; defaults to now. */
  asOf?: string;
  delaySeconds?: number;
  attribution?: string;
  license?: string;
  sourceUrl?: string;
  notes?: string;
  cacheHit?: boolean;
}

export function makeProvenance(init: ProvenanceInit): DataProvenance {
  const now = new Date().toISOString();
  const asOf = init.asOf ?? now;
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(asOf));
  return {
    provider: init.provider,
    providerMode: init.providerMode,
    capability: init.capability,
    retrievedAt: now,
    freshness: {
      asOf,
      tier: init.tier,
      ageMs,
      ...(init.delaySeconds !== undefined ? { delaySeconds: init.delaySeconds } : {}),
    },
    ...(init.attribution ? { attribution: init.attribution } : {}),
    ...(init.license ? { license: init.license } : {}),
    ...(init.sourceUrl ? { sourceUrl: init.sourceUrl } : {}),
    ...(init.notes ? { notes: init.notes } : {}),
    ...(init.cacheHit !== undefined ? { cacheHit: init.cacheHit } : {}),
  };
}

export function withProvenance<T>(data: T, provenance: DataProvenance): Envelope<T> {
  return { data, provenance };
}
