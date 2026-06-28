import type { ProviderCapability } from '@tyche/contracts';

/** Thrown when a provider is asked for a capability it does not support. */
export class CapabilityError extends Error {
  readonly provider: string;
  readonly capability: ProviderCapability | string;
  constructor(provider: string, capability: ProviderCapability | string, message?: string) {
    super(message ?? `Provider "${provider}" does not support capability "${capability}".`);
    this.name = 'CapabilityError';
    this.provider = provider;
    this.capability = capability;
  }
}

/** Generic provider failure (network, parsing, unconfigured adapter, ...). */
export class ProviderError extends Error {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

export function isCapabilityError(error: unknown): error is CapabilityError {
  return error instanceof CapabilityError;
}
