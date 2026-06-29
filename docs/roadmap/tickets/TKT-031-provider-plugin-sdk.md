# TKT-031 — Provider plugin SDK + conformance gate

**Priority:** P2  ·  **Milestone:** M12  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-competitive-roadmap.md` — Milestone 12 ("Provider marketplace / plugin SDK"): "third-party adapters via the existing `DataProvider` interface"; tests "plugin manifest validation; … conformance gate for community providers"; DoD "a community provider/module can be registered via manifest, passes conformance, and appears in the capability dashboard"; Risk "security of third-party code — sandbox + conformance + capability gating."

## Trust model (decision)
**Local install + conformance gate.** A plugin is a local module the operator deliberately installs
(named in `TYCHE_PLUGINS` or injected when embedding) — the same trust level as adding a dependency.
Tyche **never downloads or executes remote code**, consistent with the foundation's no-supply-chain-
compromise stance. A provider plugin only *activates* after passing the existing provider conformance
suite; anything that fails any gate is **quarantined** (recorded, never registered), so a broken or
hostile adapter cannot serve data. (A remote marketplace with sandboxed download/execute was
explicitly rejected on security grounds; a declarative-only model was considered too limiting.)

## Problem
The `DataProvider` interface, `ProviderRegistry`, and `checkProviderConformance` already exist, but
there is no way for a third party to ship an adapter: no plugin manifest, no registration path that
gates activation on conformance, and nothing surfacing installed plugins.

## Technical design (this ticket — PR A)
1. **Contract** — `PluginManifest` (`id`, `name`, `version`, `kind: 'provider'|'module'`, `apiVersion`,
   `capabilities`, `commandIds`) + `PluginInfo` (`manifest`, `status: active|quarantined|disabled`,
   `reason?`, `conformance[]`) in `packages/contracts/src/plugin.ts`; registered in the schema registry.
2. **PluginHost** (`apps/api/src/plugins/PluginHost.ts`) — `registerProvider(plugin)` validates the
   manifest, checks API version, kind, provider-name collision, and that the descriptor backs every
   declared capability, then runs `checkProviderConformance`. Only a full pass registers the provider
   into the `ProviderRegistry`; every failure quarantines with a reason + the conformance report.
3. **Loader** (`plugins/loader.ts`) — resolves `TYCHE_PLUGINS` module specifiers (operator-installed);
   a failed import is skipped with a warning, never fatal.
4. **Wiring** — `buildApp` builds a `PluginHost`, registers injected (`options.plugins`) + configured
   plugins before serving, so an activated plugin's provider flows into `/api/providers` and the
   capability dashboard automatically. New `GET /api/plugins` exposes `PluginInfo[]` (local provenance).
5. **Env** — `TYCHE_PLUGINS` (comma-separated specifiers).

## Out of scope (follow-up — PR B, TKT-032)
- `SETTINGS` plugin-manager UI (list installed plugins, status, capabilities, enable/disable).
- Module (UI) plugins beyond the manifest kind (web-side module loading).
- `MODULE_SDK.md` full guide (this ticket ships a provider-plugin quickstart in `docs/PLUGINS.md`).

## Acceptance criteria
- [x] `PluginManifest`/`PluginInfo` contracts + schema registry entries.
- [x] A conformant provider plugin activates and joins the registry / `/api/providers`; a broken one is
  quarantined and never registers (covered by unit + app tests).
- [x] Manifest validation, API-version, kind, name-collision, and capability-mismatch gates.
- [x] `GET /api/plugins` returns statuses with local provenance; `TYCHE_PLUGINS` loads local modules.
- [x] No remote download/execute; no order/advice surface. `pnpm typecheck/test/build/test:e2e` green.

## Clean-room notes
Built entirely on Tyche's own `DataProvider`/`ProviderRegistry`/`checkProviderConformance` and contract
schemas. A plugin SDK + conformance gate is a generic extensibility-platform category feature,
benchmarked at the category level only; no Gödel artifact is reproduced.
