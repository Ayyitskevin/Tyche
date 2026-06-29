import type { ProviderDescriptor } from '@tyche/contracts';

/**
 * A presentation-only entitlement notice. Tyche bundles no licensed data, so a
 * non-mock (bring-your-own / live) provider carries a reminder that honoring the
 * source's terms and attribution is the operator's responsibility. This is a UI
 * shape, not a contract — no Zod, no gating; it is disclosure, not enforcement.
 */
export interface EntitlementNotice {
  provider: string;
  mode: string;
  attributionRequired: boolean;
  attribution?: string;
  homepage?: string;
}

/**
 * Returns an entitlement notice for any non-mock provider, or `null` for mock
 * (synthetic data needs no entitlement). Used to drive the global banner and to
 * decide whether a provenance badge should surface attribution.
 */
export function entitlementWarning(descriptor: ProviderDescriptor): EntitlementNotice | null {
  if (descriptor.mode === 'mock') return null;
  return {
    provider: descriptor.name,
    mode: descriptor.mode,
    attributionRequired: descriptor.attributionRequired,
    ...(descriptor.attribution ? { attribution: descriptor.attribution } : {}),
    ...(descriptor.homepage ? { homepage: descriptor.homepage } : {}),
  };
}
