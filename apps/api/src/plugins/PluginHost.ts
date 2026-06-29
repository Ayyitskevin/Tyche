import {
  PLUGIN_API_VERSION,
  PluginManifestSchema,
  type PluginConformanceCheck,
  type PluginInfo,
  type PluginManifest,
} from '@tyche/contracts';
import { checkProviderConformance, type DataProvider, type ProviderRegistry } from '@tyche/data-adapters';

/**
 * A provider plugin: a manifest plus a factory that builds the adapter. The
 * factory is only invoked by the host, which gates activation on conformance.
 */
export interface ProviderPlugin {
  manifest: PluginManifest;
  createProvider: () => DataProvider;
}

export interface RegisterOptions {
  /** When false, the plugin is recorded as `disabled` and never instantiated. */
  enabled?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Loads operator-installed plugins and decides whether each may serve data. A
 * provider plugin is activated (registered into the {@link ProviderRegistry})
 * only after it (1) has a valid manifest targeting the current API version,
 * (2) builds without throwing, (3) does not collide with an existing provider,
 * (4) actually supports every capability its manifest declares, and (5) passes
 * the full provider conformance suite. Any failure quarantines the plugin with a
 * reason — it is never registered, so a broken/hostile adapter can't serve data.
 */
export class PluginHost {
  private readonly plugins: PluginInfo[] = [];

  constructor(private readonly registry: ProviderRegistry) {}

  private record(info: PluginInfo): PluginInfo {
    this.plugins.push(info);
    return info;
  }

  async registerProvider(plugin: ProviderPlugin, options: RegisterOptions = {}): Promise<PluginInfo> {
    const enabled = options.enabled ?? true;

    const parsed = PluginManifestSchema.safeParse(plugin.manifest);
    if (!parsed.success) {
      const reason = `invalid manifest: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
      return this.record({ manifest: plugin.manifest, status: 'quarantined', reason, conformance: [] });
    }
    const manifest = parsed.data;

    if (manifest.apiVersion !== PLUGIN_API_VERSION) {
      return this.record({
        manifest,
        status: 'quarantined',
        reason: `plugin targets API v${manifest.apiVersion}; host is v${PLUGIN_API_VERSION}`,
        conformance: [],
      });
    }
    if (manifest.kind !== 'provider') {
      return this.record({
        manifest,
        status: 'quarantined',
        reason: `expected a provider plugin, got kind="${manifest.kind}"`,
        conformance: [],
      });
    }
    if (!enabled) {
      return this.record({ manifest, status: 'disabled', conformance: [] });
    }
    // A provider plugin must declare at least one capability — otherwise conformance
    // is a no-op (zero checks pass trivially) and the adapter would activate while
    // serving nothing and squatting a provider name.
    if (manifest.capabilities.length === 0) {
      return this.record({
        manifest,
        status: 'quarantined',
        reason: 'a provider plugin must declare at least one capability',
        conformance: [],
      });
    }

    let provider: DataProvider;
    try {
      provider = plugin.createProvider();
    } catch (err) {
      return this.record({ manifest, status: 'quarantined', reason: `provider construction failed: ${errorMessage(err)}`, conformance: [] });
    }

    if (this.registry.get(provider.descriptor.name)) {
      return this.record({
        manifest,
        status: 'quarantined',
        reason: `a provider named "${provider.descriptor.name}" is already registered`,
        conformance: [],
      });
    }

    // The manifest must not claim capabilities the descriptor doesn't back.
    const undeclared = manifest.capabilities.filter((c) => !provider.descriptor.capabilities[c]);
    if (undeclared.length > 0) {
      return this.record({
        manifest,
        status: 'quarantined',
        reason: `descriptor does not support declared capabilities: ${undeclared.join(', ')}`,
        conformance: [],
      });
    }

    const report = await checkProviderConformance(provider);
    const conformance: PluginConformanceCheck[] = report.checks.map((c) => ({
      capability: String(c.capability),
      passed: c.passed,
      ...(c.error ? { error: c.error } : {}),
    }));
    if (!report.ok) {
      return this.record({ manifest, status: 'quarantined', reason: 'failed provider conformance', conformance });
    }

    this.registry.register(provider);
    return this.record({ manifest, status: 'active', conformance });
  }

  /** Every plugin the host has seen, in registration order. */
  list(): PluginInfo[] {
    return [...this.plugins];
  }
}
