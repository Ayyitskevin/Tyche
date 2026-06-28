import { PROVIDER_CAPABILITY_KEYS } from '@tyche/contracts';
import type { ProviderCapabilities, ProviderCapability } from '@tyche/contracts';

export function moduleMissingCapabilities(
  required: readonly ProviderCapability[],
  available: ProviderCapabilities,
): ProviderCapability[] {
  return required.filter((cap) => !available[cap]);
}

export function moduleIsAvailable(
  required: readonly ProviderCapability[],
  available: ProviderCapabilities,
): boolean {
  return required.every((cap) => available[cap]);
}

/** Human-readable message for a capability gap, for empty/error states. */
export function describeCapabilityGap(missing: readonly ProviderCapability[]): string {
  if (missing.length === 0) return '';
  const list = missing.join(', ');
  return `This module needs the following provider capability${missing.length > 1 ? 'ies' : 'y'}: ${list}. Enable a provider that supplies ${missing.length > 1 ? 'them' : 'it'}.`;
}

export function isProviderCapability(value: string): value is ProviderCapability {
  return (PROVIDER_CAPABILITY_KEYS as readonly string[]).includes(value);
}
