# Plugins (provider SDK)

Tyche is provider-agnostic: you can add a data source by shipping a **provider plugin**. This page is
the quickstart for the provider plugin SDK introduced in M12.

## Trust model

A plugin is a **local module you deliberately install** — the same trust level as adding a dependency.
**Tyche never downloads or executes remote code.** You point Tyche at modules you have vetted, via
`TYCHE_PLUGINS` (comma-separated module specifiers) or by injecting them when embedding `buildApp`.

Before a plugin's adapter is allowed to serve any data, it must pass a **conformance gate**: its
manifest is validated and the adapter is run through `checkProviderConformance`, which calls each
capability the manifest declares and validates the returned envelope (`data` + `provenance`) against
the contract schema. Anything that fails is **quarantined** — recorded with a reason and never
registered — so a broken or misbehaving adapter cannot reach the UI. Statuses are visible at
`GET /api/plugins`.

## Shape of a provider plugin

A provider plugin default-exports (or exports `plugin`) an object with a manifest and a factory:

```ts
import type { ProviderPlugin } from '@tyche/api/plugins'; // shape reference
// Your adapter implements the `DataProvider` interface from @tyche/data-adapters.

const plugin: ProviderPlugin = {
  manifest: {
    id: 'acme-quotes',          // lowercase slug, unique
    name: 'Acme Quotes',
    version: '1.0.0',
    kind: 'provider',
    apiVersion: 1,              // must match the host's plugin API version
    capabilities: ['quotes'],  // every one must be backed + pass conformance
  },
  createProvider: () => new AcmeQuotesProvider(),
};
export default plugin;
```

Requirements the gate enforces:

- `apiVersion` matches the host (`PLUGIN_API_VERSION`).
- `kind` is `provider`.
- The adapter's `descriptor.name` does not collide with an existing provider.
- The `descriptor.capabilities` actually back every capability the manifest declares.
- Each declared capability returns a contract-valid envelope (provenance included).

## Enabling a plugin

```bash
# Comma-separated module specifiers your deployment can import.
TYCHE_PLUGINS=@acme/tyche-quotes,./local-plugins/my-adapter
```

An activated plugin's provider becomes first-class: it appears in `/api/providers` and the `SETTINGS`
provider capability dashboard, and its capabilities count toward total terminal coverage — exactly
like a built-in adapter.

## Managing plugins (SETTINGS)

The `SETTINGS` panel has a **Plugins** section listing every installed plugin with its kind, version,
status (`active` / `quarantined` / `disabled`), the reason when quarantined, and a per-capability
conformance result (✓ passed / ✗ failed). Each plugin has an **Enable / Disable** toggle: disabling
records the plugin id in your preferences (`disabledPlugins`) so it is loaded as `disabled` and never
instantiated on the **next API restart** (it is not hot-unloaded from a running process). Re-enabling
removes it from the set, so it loads and is conformance-gated again on the next boot.

Statuses come from `GET /api/plugins`. The conformance gate runs at boot; the panel reflects the last
boot's result.

## Non-goals

- No remote plugin marketplace / auto-download — install is the operator's deliberate, local action.
- No bundled licensed data — a plugin brings the operator's own entitlements (see `SECURITY.md`).
- Plugins never gain an order-placement or advice surface; Tyche places no orders.
