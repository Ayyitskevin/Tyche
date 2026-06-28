# TKT-027 — Data entitlement / licensing warnings

**Priority:** P1  ·  **Milestone:** M11  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/solo-operator-strategy.md` — "Bring-your-own-data … plug in *their own* entitlements … **Tyche never resells data.**" and the compliance axis "per-seat, FINRA surcharge → **no advice, no orders, entitlement-honest**". This ticket makes "entitlement-honest" a visible UI behavior.
- `docs/research/godel/solo-operator-strategy.md` — "**No reselling licensed data** or scraping behind logins / paywalls" and "Real-time Level-2 / consolidated quotes … licensed; expose as a **user-supplied capability, never bundled**." Live/BYO providers must carry a licensing-responsibility warning.
- `SECURITY.md` — "## Data licensing & entitlements": "**Enabling a real provider is your responsibility.** Confirm you hold the appropriate market-data licenses/entitlements and comply with each source's terms of use, rate limits, and attribution requirements." and "Each descriptor records its attribution and whether attribution is required." This ticket surfaces that text in-app.
- Sources index: `docs/research/godel/sources.md` / `sources.csv` (category-benchmark only; T1/T2 observation; no Gödel UI/copy reproduced).

## Problem
`ProviderDescriptor.attributionRequired` (`packages/contracts/src/provider.ts`, default `false`; set `true` in `stubs/YahooProvider.ts` and `stubs/CcxtProvider.ts`) and `DataProvenance.attribution`/`license` (`packages/contracts/src/provenance.ts`) already exist, but nothing renders an entitlement or attribution warning when a non-mock provider is active. `ProvenanceBadge.tsx` only tucks `attribution`/`license` into a hover `title`; a solo operator running a BYO/live adapter sees no surface telling them Tyche does not license the data and that honoring the source's terms/attribution is their responsibility. SECURITY.md states this policy but it lives only in docs. The risk is implying Tyche licenses or resells data — the exact thing the strategy says to avoid.

## User story
As a solo operator who has plugged in my own market-data keys, I want a clear, persistent entitlement/attribution warning whenever a live or user-supplied provider is active, so that I understand Tyche does not license the data and that complying with each source's terms and attribution is my responsibility.

## Technical design
Contracts-first; capability model preserved; reuses existing descriptor/provenance fields (no new market data, no new route required).
1. **Helper (pure, contracts only).** Add `entitlementWarning(descriptor: ProviderDescriptor): EntitlementNotice | null` to `@tyche/ui` `format.ts` (or a small `entitlement.ts`): returns a notice for any descriptor whose `mode !== 'mock'` (i.e. `public`/`paid`/`enterprise`/`user_supplied` per `ProviderModeSchema`), flagging `attributionRequired` and surfacing `attribution`/`homepage`. Mock descriptors return `null` (no warning — synthetic data needs none).
2. **Per-response attribution.** Ensure live adapters stamp `DataProvenance.attribution`/`license` from their descriptor (the mapping the existing `ProvenanceBadge` already reads); the mock path leaves them unset. No schema change — both fields are already optional in `provenance.ts`.
3. **Panel-level badge.** Extend `ProvenanceBadge.tsx` so that when `providence.providerMode !== 'mock'` and `attribution`/`license` is present, it renders a small visible "attribution: <source>" chip (not just a tooltip), keeping the existing freshness chip.
4. **Global banner.** In `apps/web`, add an `EntitlementBanner` (e.g. under `app/StatusBar.tsx` / `app/Header.tsx`) driven by `terminalStore` (`providers: ProviderDescriptor[]`, `mode: string`). When any non-mock provider is present, show a dismissible-per-session banner: "Tyche does not license this data. You are responsible for your market-data entitlements and each source's terms (see SECURITY.md)." Mock-only sessions show nothing.
5. **No false licensing.** Never display a "licensed by Tyche" affordance; the banner copy and `localProvenance`/`serveCapability` paths (`apps/api/src/routes/helpers.ts`) keep mock/local data marked as such.

## Affected packages / apps
- `packages/ui` — `format.ts` (or new `entitlement.ts`): `entitlementWarning` helper; `ProvenanceBadge.tsx`: visible attribution chip for non-mock provenance.
- `apps/web` — `app/Header.tsx`/`app/StatusBar.tsx`: new `EntitlementBanner`; reads `state/terminalStore.ts` (`providers`, `mode`). No new command/module.
- `packages/contracts` — read-only consumer of `ProviderDescriptor`, `DataProvenance`, `ProviderModeSchema` (`provider.ts`, `provenance.ts`). No change required.
- `SECURITY.md` — no change (cited in-app as the canonical policy text).

## Data contracts
No new market types and no schema changes. `attributionRequired` (`ProviderDescriptorSchema`) and `attribution`/`license` (`DataProvenanceSchema`) already exist. Optionally export a tiny UI-local `EntitlementNotice` type (`{ provider; mode; attributionRequired; attribution?; homepage? }`) from `@tyche/ui` — a presentation shape, not a contracts/Zod addition.

## Provider capabilities
Required: **none** (the warning reads provider metadata/mode, not capability data). Mock mode shows no warning — the always-registered `MockProvider` is `mode: 'mock'` with synthetic data. Warnings appear only once a BYO/live adapter (`yahoo`/`ccxt`/`fred`/`sec` or any user-supplied provider) is enabled; `attributionRequired: true` descriptors get the stronger "attribution required" treatment.

## UI / module behavior
- Global banner: visible whenever ≥1 non-mock provider is active; concise entitlement-responsibility copy that links to SECURITY.md; dismissible per session; absent in mock-only mode.
- Panel provenance: `ProvenanceBadge` renders a visible attribution chip (source name) for non-mock provenance carrying `attribution`/`license`, alongside the existing mode + freshness chips; mock provenance is unchanged.
- Capability-gap/empty/error states are untouched — the warning is additive chrome and never replaces `LoadingState`/`EmptyState`/`ErrorState`, and never crashes when `attribution`/`license` are absent.
- No "live" tier is implied where data is mock/local; mock stays labeled `mode: 'mock'`.

## Testing plan
- Unit (`packages/ui/src/format.test.ts` or `entitlement.test.ts`): `entitlementWarning` returns `null` for `mode: 'mock'`, a notice for each non-mock mode, and flags `attributionRequired` correctly.
- Component (`packages/ui/src/ProvenanceBadge.test.tsx`): non-mock provenance with `attribution` renders a visible chip; mock provenance renders no warning chip.
- Component (`apps/web` RTL, e.g. `app/Header.test.tsx`): banner renders when `terminalStore.providers` contains a non-mock descriptor; hidden for mock-only; dismiss hides it for the session.
- e2e (`apps/web` Playwright): mock-default session shows no entitlement banner; a session seeded with a non-mock provider shows the banner and the SECURITY.md link.
- Keep `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` green.

## Acceptance criteria
- [ ] When any provider with `mode !== 'mock'` is active, a clear entitlement/licensing-responsibility banner is shown, linking to SECURITY.md.
- [ ] In mock-only mode (default, no keys) no entitlement banner appears.
- [ ] Providers with `attributionRequired: true` (e.g. Yahoo/CCXT stubs) surface a visible attribution and an "attribution required" indication.
- [ ] `ProvenanceBadge` renders a visible attribution chip for non-mock provenance that carries `attribution`/`license`, and is unchanged for mock provenance.
- [ ] No UI ever states or implies Tyche licenses or resells the data; mock/local data stays marked as such.
- [ ] No new contracts/Zod schema, no new command/route; behavior is additive chrome that never crashes when attribution fields are absent.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built from Tyche's own `ProviderDescriptor.attributionRequired` / `DataProvenance.attribution`/`license` fields, `terminalStore`, the existing `ProvenanceBadge`, and SECURITY.md's policy text. Entitlement/attribution disclosure is a generic data-licensing-compliance category concern, benchmarked at the category level only. No Gödel Terminal UI, copy, layout, color scheme, or documentation is reproduced; the warning's wording and presentation are Tyche-original.

## Non-goals
- Verifying or enforcing the user's actual entitlements (cannot be checked client-side; this is disclosure, not gating).
- Entering or managing API keys / provider configuration in the browser (kept out by local-first design; see provider-config tickets).
- Implementing the BYO stub adapters themselves (`yahoo`/`ccxt`/`fred`/`sec`) — this ticket only surfaces warnings for whatever non-mock descriptors the registry reports.
- Per-jurisdiction legal/license text or a licensing marketplace — out of scope.
- Any order placement, brokerage, or personalized advice — out of scope by foundation constraint.
