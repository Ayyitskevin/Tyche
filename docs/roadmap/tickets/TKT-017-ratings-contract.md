# TKT-017 — Analyst ratings (ANR) module

**Priority:** P1  ·  **Milestone:** M7  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/command-taxonomy.md:57` — "ANR | research | Analyst ratings, recommendations, price targets | confirmed / high" — the category benchmark and column intent (firm, rating, action, price target) this module surfaces.
- `docs/research/godel/command-taxonomy.md:42` (DES row) — confirms "analyst ratings" is a standard research surface in this product category; reinforces ANR as a first-class panel, not a sub-view.
- `docs/research/godel/command-taxonomy.md:85-86` — lists `ANR` among the command ids Tyche already category-matches, framing this as a wiring/UI ticket over an existing contract.

## Problem
`ANR` exists in `DEFAULT_COMMANDS` (`packages/terminal-kernel/src/commands.ts:222`, `moduleId: 'analyst-ratings'`, `requiredCapabilities: ['analystRatings']`, `maturity: 'beta'`). The capability key `analystRatings` is declared (`packages/contracts/src/provider.ts:21,45`), the `AnalystRating` Zod type already exists (`packages/contracts/src/fundamentals.ts:67`), and `MockProvider.getAnalystRatings` already returns deterministic rows with firm/rating/action/priceTarget/previousPriceTarget/date (`packages/data-adapters/src/MockProvider.ts:677`). But nothing surfaces it end to end: there is **no `/api/ratings/:symbol` route** (`apps/api/src/routes/research.ts` only serves news/filings/financials/options), **no `getRatings` client method** (`apps/web/src/providers/apiClient.ts`), and **no `AnalystRatingsModule`** in `apps/web/src/modules/`, so `analyst-ratings` falls through to `BetaPlaceholder` (`apps/web/src/modules/registry.ts:32`). Running `AAPL ANR` shows a placeholder, not ratings.

## User story
As a solo operator/analyst, I want `AAPL ANR` to render a table of analyst ratings — firm, rating, action, price target (and prior target), date — so that I can scan Street sentiment and target dispersion for a name without a brokerage account or leaving the terminal.

## Technical design
Contracts-first; capability model preserved; mirror the `FinancialsModule` + `ModuleBody` pattern.
1. **API route.** In `apps/api/src/routes/research.ts`, add `GET /api/ratings/:symbol` calling `serveCapability(reply, ctx.registry, 'analystRatings', (p) => p.getAnalystRatings(symbol))` (helper in `routes/helpers.ts`; route file already registered via `registerResearchRoutes` in `app.ts:48`). This yields the standard `{ data, provenance }` envelope and graceful `capability_unavailable` on a registry without the capability.
2. **Client method.** Add `getRatings: (symbol) => fetchEnvelope<AnalystRating[]>(\`/api/ratings/${encodeURIComponent(symbol)}\`)` to the `api` object in `apps/web/src/providers/apiClient.ts`, importing `AnalystRating` from `@tyche/contracts`.
3. **Module component.** Add `apps/web/src/modules/AnalystRatingsModule.tsx` modeled on `FinancialsModule.tsx`: load via `useApiData(() => symbol ? api.getRatings(symbol) : noSymbol(), [symbol])`; gate on `symbol` with `SymbolRequired`; lift provenance with `useReportProvenance`; render through `ModuleBody` (capability → loading → error → empty → content ladder, from `modules/common.tsx`). Sort rows by `date` desc. Columns: Firm, Rating, Action, Target, Prior, Date. Format `priceTarget`/`previousPriceTarget` via `@tyche/ui` `formatCurrency`/`formatNumber`; render `null` targets and absent `action` as an em-dash (never `NaN`/`undefined`). Optionally tone Action (upgrade/downgrade) with `changeToneClass`-style classes.
4. **Register the component.** Add `AnalystRatingsModule` to `moduleComponents` (`apps/web/src/modules/components.ts`) under key `'analyst-ratings'` so `registry.ts` stops falling back to `BetaPlaceholder`. Optionally flip `ANR` `maturity` from `beta` to `stable` in `commands.ts` once shipped (kernel-only metadata; defer if risky).

## Affected packages / apps
- `apps/api` — new `GET /api/ratings/:symbol` in `routes/research.ts` (reuses `serveCapability`).
- `apps/web` — new `modules/AnalystRatingsModule.tsx`; edit `modules/components.ts` (register); add `getRatings` to `providers/apiClient.ts`. Reuses `useApiData`, `modules/common.tsx`, `@tyche/ui` format helpers/state components.
- `packages/terminal-kernel` — optional `maturity` flip for `ANR` (no behavior change).
- No changes to `packages/contracts` or `packages/data-adapters` — type, capability, and mock data already exist.

## Data contracts
None. `AnalystRating` / `AnalystRatingSchema` and `RatingAction` already exist in `packages/contracts/src/fundamentals.ts`. The capability key `analystRatings` is already in `ProviderCapabilities` (`provider.ts`). No new or changed Zod types.

## Provider capabilities
Requires `analystRatings` (`ProviderCapabilities.analystRatings`, `packages/contracts/src/provider.ts:45`). Satisfied by `MockProvider` (`analystRatings: true`, deterministic rows), so **mock mode works with no keys**. BYO providers that declare `analystRatings` work unchanged. When the capability is absent, `serveCapability` returns `capability_unavailable` and `ModuleBody` renders the capability-gap `EmptyState` — never a crash. Non-equity symbols return an empty array from the mock (`MockProvider.ts:680`) → empty-state, not error.

## UI / module behavior
- Panel: a single ratings table (Firm | Rating | Action | Target | Prior | Date), newest first.
- No symbol → `SymbolRequired`; empty array (non-equity / no coverage) → `EmptyState` ("No analyst ratings for {symbol}."); loader error → `ErrorState` with retry; capability gap → capability `EmptyState`. All via `ModuleBody`.
- `ProvenanceBadge`/`FreshnessBadge` in the panel frame reflect the `analystRatings` provenance (mock freshness is `eod`) lifted via `useReportProvenance` — surfaced honestly, no fake "live".

## Testing plan
- Unit (`apps/web/src/modules/AnalystRatingsModule.test.tsx`, RTL + mocked `apiClient`): renders one row per rating with firm/rating/action/target/date; null `priceTarget` and absent `action` render em-dash; rows sorted by date desc; empty array → empty-state; error → `ErrorState`; no symbol → `SymbolRequired`; capability gap → capability `EmptyState`.
- Contract (`packages/data-adapters/src/MockProvider.test.ts` area): assert `getAnalystRatings` output parses `AnalystRatingSchema` (extend if not covered); `checkProviderConformance` (`conformance.ts`) still passes.
- API (`apps/api` route tests): `GET /api/ratings/AAPL` returns `{ data, provenance }` with `provenance.capability === 'analystRatings'`; a registry lacking the capability returns graceful `capability_unavailable`.
- e2e (`apps/web` Playwright): `AAPL ANR` opens the ratings panel against mock; assert table rows and the Firm/Rating/Target/Date columns render; a non-equity symbol shows the empty-state.

## Acceptance criteria
- [ ] `GET /api/ratings/:symbol` serves `analystRatings` via `serveCapability` with a `{ data, provenance }` envelope.
- [ ] `api.getRatings` exists in `apiClient.ts` and is typed `EnvelopeResult<AnalystRating[]>`.
- [ ] `AAPL ANR` renders a ratings table (Firm | Rating | Action | Target | Prior | Date), newest first.
- [ ] `analyst-ratings` is registered in `moduleComponents` and no longer falls back to `BetaPlaceholder`.
- [ ] Missing targets / absent action render as em-dash (never `NaN`/`undefined`).
- [ ] Capability gap / empty (non-equity) / error / no-symbol states render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] Provenance (`analystRatings`, `eod`) is surfaced via panel badges; no false "live".
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`fundamentals.ts`, `provenance.ts`, `provider.ts`), the deterministic `MockProvider`, the existing `serveCapability` helper, and `@tyche/ui` components (`DataTable`/table, `EmptyState`/`ErrorState`, `ProvenanceBadge`/`FreshnessBadge`, `format.ts`). An analyst-ratings table (firm/rating/action/target/date) is a standard category feature; the column set is benchmarked from public command docs and Tyche's own dossier, not copied. No Gödel Terminal UI, copy, code, layout, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Earnings Matrix / forward estimates (`EM`, `ERN`) — separate fundamentals tickets.
- Consensus aggregation, rating-trend charts, or target-vs-price visualization beyond the row table.
- Streaming/real-time ratings (mock is `eod`); no SSE here.
- Any new provider capability or changes to `AnalystRating`/`RatingAction` Zod contracts.
- Personalized advice or buy/sell signals — display Street data verbatim only, no recommendation synthesis (foundation constraint).
