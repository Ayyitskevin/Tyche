import type { ProviderPlugin } from './PluginHost';

/**
 * Resolve operator-configured provider plugins from a list of module specifiers
 * (TYCHE_PLUGINS). Each specifier is a local/installed module the operator chose
 * to add — Tyche does not fetch anything. A module must default-export (or export
 * `plugin`) a {@link ProviderPlugin}; anything that fails to import or doesn't
 * match the shape is skipped with a warning rather than crashing the boot.
 */
export async function loadConfiguredPlugins(specifiers: string[]): Promise<ProviderPlugin[]> {
  const plugins: ProviderPlugin[] = [];
  for (const spec of specifiers) {
    try {
      const mod = (await import(spec)) as { default?: unknown; plugin?: unknown };
      const candidate = (mod.plugin ?? mod.default) as ProviderPlugin | undefined;
      if (candidate && candidate.manifest && typeof candidate.createProvider === 'function') {
        plugins.push(candidate);
      } else {
        console.warn(`[plugins] "${spec}" did not export a provider plugin (default/plugin export).`);
      }
    } catch (err) {
      console.warn(`[plugins] failed to load "${spec}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return plugins;
}
