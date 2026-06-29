import { describe, it, expect, beforeEach } from 'vitest';
import {
  NO_CAPABILITIES,
  ProviderDescriptorSchema,
  QuoteSchema,
  type DataProvenance,
  type ProviderCapabilities,
  type ProviderDescriptor,
} from '@tyche/contracts';
import { StubProvider, createProviderRegistry, type DataProvider, type ProviderRegistry } from '@tyche/data-adapters';
import { PluginHost, type ProviderPlugin } from './PluginHost';

const iso = '2026-06-29T00:00:00.000Z';

function descriptor(name: string, caps: Partial<ProviderCapabilities>): ProviderDescriptor {
  return ProviderDescriptorSchema.parse({
    name,
    mode: 'user_supplied',
    capabilities: { ...NO_CAPABILITIES, ...caps },
  });
}

function prov(name: string): DataProvenance {
  return {
    provider: name,
    providerMode: 'user_supplied',
    capability: 'quotes',
    retrievedAt: iso,
    freshness: { asOf: iso, tier: 'live' },
  };
}

/** A well-behaved quotes adapter that passes conformance. */
class GoodProvider extends StubProvider {
  readonly descriptor = descriptor('acme-quotes', { quotes: true });
  override getQuote(symbol?: string) {
    return Promise.resolve({
      data: QuoteSchema.parse({ symbol: symbol ?? 'TEST', price: 123.45, timestamp: iso }),
      provenance: prov('acme-quotes'),
    });
  }
}

/** Declares quotes but returns a malformed payload — must fail conformance. */
class BrokenProvider extends StubProvider {
  readonly descriptor = descriptor('bad-quotes', { quotes: true });
  override getQuote() {
    return Promise.resolve({ data: { not: 'a quote' }, provenance: null } as never);
  }
}

function manifest(over: Record<string, unknown> = {}) {
  return { id: 'acme', name: 'Acme Quotes', version: '1.0.0', kind: 'provider', apiVersion: 1, capabilities: ['quotes'], ...over };
}

function plugin(p: DataProvider, over: Record<string, unknown> = {}): ProviderPlugin {
  return { manifest: manifest(over) as ProviderPlugin['manifest'], createProvider: () => p };
}

describe('PluginHost.registerProvider', () => {
  let registry: ProviderRegistry;
  let host: PluginHost;
  beforeEach(() => {
    registry = createProviderRegistry(); // mock-only
    host = new PluginHost(registry);
  });

  it('activates a conformant provider and registers it', async () => {
    const info = await host.registerProvider(plugin(new GoodProvider()));
    expect(info.status).toBe('active');
    expect(info.conformance.find((c) => c.capability === 'quotes')?.passed).toBe(true);
    // It is now a real provider visible to the registry / capability dashboard.
    expect(registry.get('acme-quotes')).toBeDefined();
    expect(registry.aggregateCapabilities().quotes).toBe(true);
  });

  it('quarantines a provider that fails conformance (never registers it)', async () => {
    const info = await host.registerProvider(plugin(new BrokenProvider(), { id: 'bad' }));
    expect(info.status).toBe('quarantined');
    expect(info.reason).toMatch(/conformance/i);
    expect(info.conformance.find((c) => c.capability === 'quotes')?.passed).toBe(false);
    expect(registry.get('bad-quotes')).toBeUndefined();
  });

  it('quarantines when the manifest claims a capability the descriptor does not back', async () => {
    const p = new (class extends StubProvider {
      readonly descriptor = descriptor('thin', {}); // no capabilities
    })();
    const info = await host.registerProvider(plugin(p, { id: 'thin', capabilities: ['quotes'] }));
    expect(info.status).toBe('quarantined');
    expect(info.reason).toMatch(/does not support declared capabilities/i);
    expect(registry.get('thin')).toBeUndefined();
  });

  it('quarantines a provider whose name collides with an existing one', async () => {
    const p = new (class extends StubProvider {
      readonly descriptor = descriptor('mock', { quotes: true }); // 'mock' already registered
    })();
    const info = await host.registerProvider(plugin(p, { id: 'dup', capabilities: ['quotes'] }));
    expect(info.status).toBe('quarantined');
    expect(info.reason).toMatch(/already registered/i);
  });

  it('quarantines an invalid manifest and an API-version mismatch', async () => {
    const bad = await host.registerProvider(plugin(new GoodProvider(), { id: 'BAD UPPER!' }));
    expect(bad.status).toBe('quarantined');
    expect(bad.reason).toMatch(/invalid manifest/i);

    const stale = await host.registerProvider(plugin(new GoodProvider(), { id: 'stale', apiVersion: 99 }));
    expect(stale.status).toBe('quarantined');
    expect(stale.reason).toMatch(/API v99/);
  });

  it('quarantines a provider plugin that declares no capabilities', async () => {
    const info = await host.registerProvider(plugin(new GoodProvider(), { id: 'empty', capabilities: [] }));
    expect(info.status).toBe('quarantined');
    expect(info.reason).toMatch(/at least one capability/i);
    expect(registry.get('acme-quotes')).toBeUndefined();
  });

  it('quarantines (without crashing) when createProvider throws', async () => {
    const info = await host.registerProvider({
      manifest: manifest({ id: 'throws' }) as ProviderPlugin['manifest'],
      createProvider: () => {
        throw new Error('boom');
      },
    });
    expect(info.status).toBe('quarantined');
    expect(info.reason).toMatch(/construction failed.*boom/i);
  });

  it('records a disabled plugin without instantiating it', async () => {
    let built = false;
    const info = await host.registerProvider(
      { manifest: manifest({ id: 'off' }) as ProviderPlugin['manifest'], createProvider: () => { built = true; return new GoodProvider(); } },
      { enabled: false },
    );
    expect(info.status).toBe('disabled');
    expect(built).toBe(false);
    expect(host.list().map((p) => p.manifest.id)).toContain('off');
  });
});
