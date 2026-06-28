# TKT-026 — Provider capability dashboard

**Priority:** P2  ·  **Milestone:** M11  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/solo-operator-strategy.md` — "**Provider capability dashboard** → shows exactly what each configured adapter can/can't do." (the feature this ticket implements, listed under local-first tooling).
- `docs/research/godel/solo-operator-strategy.md` — "Inspectability — every panel shows where its data came from and how fresh it is." and the differentiation axis "Data: bundled licensed feeds → provider-agnostic, BYO, transparent" — the dashboard makes BYO/mock entitlement state legible.
- `docs/research/godel/solo-operator-strategy.md` — "Bring-your-own-data" + "Honest gaps — when a capability/provider is missing, say so clearly" — motivates surfacing `requiresConfiguration` and per-capability coverage.
- Sources index: `docs/research/godel/sources.md` / `sources.csv` (category-benchmark only; T1/T2 observation; no Gödel UI/copy reproduced).

## Problem
Tyche's whole wedge is provider transparency, but a solo operator has no in-app surface that answers "which providers are enabled, what can each one actually do, are they mock or live, what freshness do they promise, and which need configuration?" The data already exists end-to-end — `GET /api/providers` returns `ProviderDescriptor[]` (`apps/api/src/routes/health.ts`), `ProviderRegistry.aggregateCapabilities()` computes union coverage, and `api.getProviders()` is wired in `apps/web/src/providers/apiClient.ts` — but nothing renders it as a readable dashboard. `SettingsModule.tsx` only shows raw provider names from `terminalStore`. The user cannot see capability gaps (why `OMON`/`TAS` are empty), nor that the mock provider is the fallback, nor which BYO adapter to configure.

## User story
As a solo operator, I want a settings panel listing every enabled provider with its capabilities, mode, freshness guarantees, and whether it still needs configuration, so that I understand exactly what my terminal can do today and which adapter to plug my keys into.

## Technical design
Contracts-first; capability model preserved; reuses the existing `/api/providers` envelope (no new route, no new contract).
1. **API (already present, verify).** `GET /api/providers` in `apps/api/src/routes/health.ts` returns `{ data: ProviderDescriptor[], provenance: null }`. Extend it to also expose the aggregate so the client need not recompute: add an `aggregate` field via the registry, e.g. return `{ data: descriptors, aggregate: ctx.registry.aggregateCapabilities(), provenance: null }`. Keep `data` shape unchanged (additive).
2. **Client.** `api.getProviders()` (`apps/web/src/providers/apiClient.ts`) already fetches `ProviderDescriptor[]`; widen its response type to include the optional `aggregate: ProviderCapabilities`. Add a thin `useApiData(() => api.getProviders())` call inside the dashboard (no new hook).
3. **Dashboard UI.** Build the dashboard inside `apps/web/src/modules/SettingsModule.tsx` as a new "Providers" section component (`ProviderCapabilityPanel`), reachable via the existing `SETTINGS` command (`packages/terminal-kernel/src/commands.ts`, id `SETTINGS`, `moduleId: 'settings'`) — no new command, no registry change. For each `ProviderDescriptor`: show `name`, a mode badge (`mode`: mock/live/delayed via `ProviderModeSchema`), `requiresConfiguration` flag, `attribution`/`homepage`, `rateLimit` notes, and a capability grid over `PROVIDER_CAPABILITY_KEYS` (✓/—). Render `freshness` (`FreshnessGuarantee[]`) per capability where declared (tier + `delaySeconds`).
4. **Aggregate row.** Render one "All providers (union)" summary derived from the `aggregate` field (fallback: OR the descriptors client-side) so the user sees total terminal coverage — the same union `missingCapabilities()` uses to decide empty states.
5. **Provenance honesty.** The descriptor list is local metadata, not market data; report it with `localProvenance('providers')`-style framing (the route returns `provenance: null`), and never imply a "live" data tier from the dashboard itself.

## Affected packages / apps
- `apps/api` — `routes/health.ts`: add `aggregate` to the `/api/providers` response (additive).
- `apps/web` — `modules/SettingsModule.tsx`: new `ProviderCapabilityPanel` section; `providers/apiClient.ts`: widen `getProviders` response type. Reuses `providers/useApiData.ts`, `@tyche/ui` states (`LoadingState`/`EmptyState`/`ErrorState`), `ProvenanceBadge`/`FreshnessBadge`, `format.ts`.
- `packages/contracts` — read-only consumer of `ProviderDescriptor`, `ProviderCapabilities`, `PROVIDER_CAPABILITY_KEYS`, `ProviderModeSchema`, `FreshnessTierSchema` (`provider.ts`, `provenance.ts`). No change required unless a response wrapper type is formalized (see Data contracts).
- No change to `packages/terminal-kernel` (the `SETTINGS` command already targets `moduleId: 'settings'`).

## Data contracts
No new market types. Optionally formalize the `/api/providers` envelope with a `ProvidersResponseSchema = z.object({ data: z.array(ProviderDescriptorSchema), aggregate: ProviderCapabilitiesSchema.optional(), provenance: z.null() })` in `packages/contracts` (or `schemas.ts` registry) so client and server share one shape; the `aggregate` field is additive and optional, keeping existing `getProviders` consumers valid. All capability/freshness/mode types already exist in `provider.ts` / `provenance.ts`.

## Provider capabilities
Required: **none** (the dashboard reads provider metadata, not capability data). It works in pure mock mode with zero keys — the always-registered `MockProvider` produces a fully populated descriptor (capabilities, `mode: 'mock'`, `requiresConfiguration: false`). BYO providers (`yahoo`/`sec`/`fred`/`ccxt` stubs) appear with `requiresConfiguration: true` and their declared capability matrix once enabled, so the dashboard is the canonical surface for "what does configuring this adapter unlock."

## UI / module behavior
- Panel lists each enabled provider as a card/row: name, mode badge, `requiresConfiguration` pill, attribution/homepage link, optional rate-limit note, and a capability grid (✓ supported / — not) across all 18 keys, with declared freshness tier/delay shown per capability.
- A union summary row shows total terminal coverage; capabilities absent from every provider are flagged so the user can connect a gap to the empty modules (e.g. `OMON`, `TAS`).
- States via the shared ladder: fetch in flight → `LoadingState`; request error → `ErrorState` with retry; zero providers (cannot occur in practice since mock is always registered, but handled) → `EmptyState`. Never crashes.
- Provenance: the dashboard surfaces provider metadata, not market data; no false "live" badge — `FreshnessBadge` is used only to render each provider's *declared* freshness guarantees, clearly labeled as guarantees, not live readings.

## Testing plan
- API (`apps/api/src/routes/health.test.ts`): `GET /api/providers` returns `data: ProviderDescriptor[]` plus the new optional `aggregate`; in mock mode `aggregate` matches `registry.aggregateCapabilities()`; existing `data` assertions still pass.
- Contract (`packages/contracts/src/provider.test.ts` and/or `schemas.test.ts`): the (optional) `ProvidersResponseSchema` round-trips a descriptor list with and without `aggregate`.
- Client (`apps/web/src/providers/apiClient.test.ts` if present): `getProviders` parses the widened response.
- Component (`apps/web/src/modules/SettingsModule.test.tsx`, RTL): renders one row per provider with mode badge, `requiresConfiguration`, capability ✓/— grid, and union summary; loading/error states render via the shared states.
- e2e (`apps/web` Playwright): typing `SETTINGS` opens the panel against mock and shows the `mock` provider with its capability grid and a union summary.

## Acceptance criteria
- [ ] `SETTINGS` opens a panel that lists every enabled provider with name, mode, `requiresConfiguration`, and a per-capability ✓/— grid over all 18 `PROVIDER_CAPABILITY_KEYS`.
- [ ] Declared `freshness` guarantees (tier + optional `delaySeconds`) render per capability where present, labeled as guarantees (no false "live").
- [ ] A union/aggregate summary shows total terminal coverage, sourced from `aggregateCapabilities()` (server `aggregate` field, with a client-side OR fallback).
- [ ] `GET /api/providers` adds `aggregate` additively; existing `data` contract and consumers are unchanged.
- [ ] Works in pure mock mode with no keys; BYO stubs appear with `requiresConfiguration: true` and their capability matrix when enabled.
- [ ] Loading/error/empty states render via shared `@tyche/ui` states; the panel never crashes.
- [ ] No new command, no order/brokerage/advice surface introduced.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`provider.ts`, `provenance.ts`), the existing `/api/providers` route, `ProviderRegistry.aggregateCapabilities()`, `api.getProviders`, the `SETTINGS` command, and shared `@tyche/ui` components. A "what can each connected data source do" view is a generic provider-management category feature; it is benchmarked at the category level only. No Gödel Terminal UI, copy, code, layout, color scheme, or documentation is reproduced — the provider/capability model and its presentation are Tyche-original.

## Non-goals
- Editing provider configuration or entering API keys from the panel (read-only dashboard; key management is a separate concern, kept out of the browser by the local-first design).
- Enabling/disabling or reordering providers at runtime (registry is built from config; see provider-config tickets).
- Live health checks, latency probes, or rate-limit consumption metering (declared metadata only).
- Implementing the BYO stub adapters themselves (`yahoo`/`sec`/`fred`/`ccxt`) — this ticket only displays whatever descriptors the registry reports.
- Any order placement, brokerage, or personalized advice — out of scope by foundation constraint.
