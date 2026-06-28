# TKT-028 — Surface provenance/source on every panel + export

**Priority:** P2  ·  **Milestone:** M5  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/competitive-feature-matrix.md` — row **"Source provenance" → "(not emphasized)" / Tyche status "✅ (Tyche-ahead)"**, gap "keep extending", recommended style "provenance on every panel". This ticket closes the remaining coverage gaps so the claim holds literally everywhere.
- `docs/research/godel/competitive-feature-matrix.md` — row **"Excel/CSV/JSON export" → "FA/table exports + provenance"**, recommended style "export util w/ provenance header" — motivates the export header.
- `docs/research/godel/competitive-feature-matrix.md` — row **"AI copilot" → grounded, no-advice, cited** — motivates the canonical AI citation format.
- `docs/research/godel/solo-operator-strategy.md` — "Inspectability — every panel shows where its data came from and how fresh it is" and "Honest gaps — when a capability/provider is missing, say so clearly" — motivates provenance on error/empty payloads.
- Sources index: `docs/research/godel/sources.md` / `sources.csv` (category-benchmark only; no Gödel UI/copy reproduced).

## Problem
Provenance is Tyche's wedge, and `ProvenanceBadge`/`FreshnessBadge` (`packages/ui`) already render it in the `PanelFrame` footer for successful loads. But coverage has three holes: (1) **error/capability-gap payloads drop provenance** — `serveCapability` (`apps/api/src/routes/helpers.ts`) returns `provenance: null` on `capability_unavailable`/`provider_error`, so an empty/errored panel shows "no provenance available" and the user cannot tell *which provider* failed or *why* the gap exists; (2) **exports have no provenance** — `HistoryTableModule.toCsv` (`apps/web/src/modules/HistoryTableModule.tsx`) and the planned FA/table exports emit a bare CSV with no source/freshness header, so a saved file is unattributed; (3) **the AI copilot cites ad-hoc** — `copilot.ts` builds `AICitation[]` but there is no canonical, reusable string rendering of a citation, so panel/export/AI surfaces format sources three different ways.

## User story
As a solo operator, I want every panel, error state, exported file, and AI answer to clearly show where the data came from and how fresh it is, so that I can trust, audit, and attribute anything Tyche puts on my screen or into a file.

## Technical design
Contracts-first; capability model preserved; reuse existing `DataProvenance`/`AICitation` types and `ProvenanceBadge`.
1. **Error payloads carry provenance context (API).** In `apps/api/src/routes/helpers.ts`, change the `capability_unavailable` and `provider_error` branches of `serveCapability` to attach a light provenance-shaped descriptor instead of `provenance: null`: a new helper `gapProvenance(registry, capability)` returns a `DataProvenance` with `provider: <resolved-or-'none'>`, `providerMode`, `capability`, and `freshness.tier: 'unknown'`, so the client can still render "which provider, what capability" alongside the error. Keep HTTP codes (200 for gap, 502 for provider error) and the `error` object unchanged (additive `provenance`).
2. **Shared citation formatter (contracts).** Add a pure helper `formatCitation(p: DataProvenance | AICitation): string` (e.g. `mock · quotes · live · as of 2026-06-28` with optional `sourceUrl`) in `packages/contracts` alongside `provenance.ts`/`ai.ts`, plus `provenanceToCitation(p: DataProvenance): AICitation`. No schema change — both types exist.
3. **Export provenance header (web/ui).** Add an export utility `toCsvWithProvenance(rows, columns, provenance)` (and a `provenanceHeaderLines(p)` returning `# source: …`, `# as of: …`, `# license: …`, `# retrieved: …` comment lines) in `packages/ui` (`format.ts` neighbor, exported from `index.ts`). Refactor `HistoryTableModule.download` and the FA/table export (TKT-011) to prepend these lines; the JSON export embeds the `envelope` `{ data, provenance }` verbatim.
4. **Error state shows provenance (web).** In `apps/web/src/modules/common.tsx`, thread the gap `provenance` from `EnvelopeResult` into `ModuleBody`'s `EmptyState`/`ErrorState` branches so the panel footer (`PanelFrame`) still receives provenance via `useReportProvenance` even when the body is an error — the footer never reads "no provenance available" once a request has resolved with a known provider/capability.
5. **AI citations use the shared format.** Update `apps/api/src/ai/copilot.ts` to build `AICitation.label` via `formatCitation`, and have the web AI panel (`apps/web/src/modules/AiModule.tsx`) render each citation with the same string + optional `sourceUrl` link. No behavior/no-advice change.

## Affected packages / apps
- `packages/contracts` — `formatCitation`, `provenanceToCitation` helpers (no schema change).
- `packages/ui` — `toCsvWithProvenance`/`provenanceHeaderLines` export util; `index.ts` export. `ProvenanceBadge` unchanged.
- `apps/api` — `routes/helpers.ts` (`gapProvenance`, wire into `serveCapability`); `ai/copilot.ts` (use `formatCitation`).
- `apps/web` — `modules/common.tsx` (provenance on error/empty), `modules/HistoryTableModule.tsx` + FA/table export (provenance header), `modules/AiModule.tsx` (citation rendering).

## Data contracts
No new Zod types. `DataProvenance` (`provenance.ts`) and `AICitation` (`ai.ts`) already cover the shape. The added `formatCitation`/`provenanceToCitation` are pure functions over existing types. The `serveCapability` error branch becomes `{ error, provenance: DataProvenance }` (was `provenance: null`) — additive on the `provenance` slot, `error` unchanged.

## Provider capabilities
Required: **none.** This is presentation/attribution plumbing over data already fetched. It works in pure mock mode with no keys — `MockProvider` provenance flows through panels, exports, errors, and AI citations identically; BYO providers simply substitute their own `provider`/`providerMode`/`freshness` values.

## UI / module behavior
- Every panel footer shows `ProvenanceBadge` for both success **and** resolved error/gap states (provider + capability + freshness), never "no provenance available" after a request resolves.
- Capability-gap `EmptyState` keeps `describeCapabilityGap` messaging but the footer now names the would-be provider/capability.
- Exports (CSV) begin with `#`-prefixed provenance comment lines (source, mode, freshness tier + asOf, license, retrievedAt); JSON exports include the full `envelope`. Header is human-readable and machine-skippable.
- AI answers list citations rendered with the shared `formatCitation` string, linking `sourceUrl` when present; no-advice disclaimer and `grounded` flag unchanged.
- States via the shared ladder (`LoadingState`/`EmptyState`/`ErrorState`); never crashes.

## Testing plan
- Contract (`packages/contracts/src/provenance.test.ts` / new `citation.test.ts`): `formatCitation` and `provenanceToCitation` produce stable strings for mock/live/delayed tiers and with/without `sourceUrl`.
- UI (`packages/ui` test for the export util): `toCsvWithProvenance` prepends correct `#` header lines and preserves row order; `provenanceHeaderLines` handles missing optional fields.
- API (`apps/api/src/routes/*.test.ts` + a `helpers` test): `serveCapability` returns provenance (not null) on `capability_unavailable` and `provider_error`; success path unchanged.
- API (`apps/api/src/ai/copilot.test.ts`): citation labels use `formatCitation`; no-advice + `grounded` invariants hold.
- Component (`apps/web/src/modules/HistoryTableModule.test.tsx`, `common.test.tsx`, RTL): exported CSV string starts with provenance header; `ModuleBody` error/empty path still reports provenance to the frame.
- e2e (`apps/web` Playwright): open a panel with a missing capability and assert the footer shows provider/capability; trigger a history CSV export and assert the downloaded blob begins with `# source:`.

## Acceptance criteria
- [ ] `serveCapability` error/gap responses include a `DataProvenance` (provider + capability + freshness tier `unknown`/declared), not `provenance: null`; HTTP codes and `error` objects unchanged.
- [ ] After any request resolves, the panel footer renders a `ProvenanceBadge` (success and error/gap); "no provenance available" only appears before first resolve.
- [ ] CSV exports begin with `#` provenance header lines (source, mode, freshness asOf, license, retrievedAt); JSON exports embed the full `envelope`.
- [ ] `formatCitation`/`provenanceToCitation` exist in `packages/contracts` and are used by the copilot and the web AI panel; panel, export, and AI surfaces format sources identically.
- [ ] Works in pure mock mode with no keys; no new provider capability required.
- [ ] No order/brokerage/advice surface introduced; AI no-advice + `grounded` invariants preserved.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`provenance.ts`, `ai.ts`), the existing `serveCapability` helper, `ProvenanceBadge`/`FreshnessBadge`, and the `HistoryTableModule` export. "Show data source and freshness everywhere, including in exports and AI citations" is a generic data-transparency category goal benchmarked at the category level only; the matrix explicitly notes Gödel does *not* emphasize provenance, so there is nothing to copy. No Gödel Terminal UI, copy, code, layout, color scheme, or documentation is reproduced — the provenance model, citation format, and export header are Tyche-original.

## Non-goals
- New provenance/citation Zod schemas — existing `DataProvenance`/`AICitation` suffice.
- XLSX/Excel binary export (separate export ticket); this ticket covers CSV/JSON provenance headers only.
- Cryptographic signing, tamper-proofing, or audit-trail persistence of exports (see audit-log ticket).
- Changing freshness computation or provider modes; this ticket surfaces existing provenance, it does not generate new freshness data.
- Any order placement, brokerage, or personalized advice — out of scope by foundation constraint.
