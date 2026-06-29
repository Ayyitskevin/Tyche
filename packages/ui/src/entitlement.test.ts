import { describe, it, expect } from 'vitest';
import { NO_CAPABILITIES, ProviderDescriptorSchema } from '@tyche/contracts';
import { entitlementWarning } from './entitlement';

function descriptor(over: Record<string, unknown>) {
  return ProviderDescriptorSchema.parse({ name: 'x', mode: 'mock', capabilities: NO_CAPABILITIES, ...over });
}

describe('entitlementWarning', () => {
  it('returns null for a mock provider', () => {
    expect(entitlementWarning(descriptor({ name: 'mock', mode: 'mock' }))).toBeNull();
  });

  it('returns a notice for a non-mock provider', () => {
    const notice = entitlementWarning(
      descriptor({ name: 'yahoo', mode: 'public', attribution: 'Yahoo Finance', attributionRequired: true }),
    );
    expect(notice).not.toBeNull();
    expect(notice!.provider).toBe('yahoo');
    expect(notice!.mode).toBe('public');
    expect(notice!.attributionRequired).toBe(true);
    expect(notice!.attribution).toBe('Yahoo Finance');
  });

  it('flags a non-mock provider that does not require attribution', () => {
    const notice = entitlementWarning(descriptor({ name: 'fred', mode: 'public', attributionRequired: false }));
    expect(notice).not.toBeNull();
    expect(notice!.attributionRequired).toBe(false);
    expect(notice!.attribution).toBeUndefined();
  });
});
