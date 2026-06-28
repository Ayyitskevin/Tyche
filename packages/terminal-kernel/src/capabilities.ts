import type { ProviderCapabilities, ProviderCapability } from '@tyche/contracts';

/** Return the subset of `required` capabilities not present in `available`. */
export function missingCapabilities(
  required: readonly ProviderCapability[],
  available: ProviderCapabilities,
): ProviderCapability[] {
  return required.filter((cap) => !available[cap]);
}

export function hasAllCapabilities(
  required: readonly ProviderCapability[],
  available: ProviderCapabilities,
): boolean {
  return required.every((cap) => available[cap]);
}
