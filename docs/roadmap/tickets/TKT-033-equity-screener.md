# TKT-033 — Equity screener (EQS)

**Priority:** P2  ·  **Milestone:** M13  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `ROADMAP.md` research pool: "`EQS` screener" listed under research-backed opportunities (benchmarked at the category level). A universe screener is a generic research-terminal category feature.
- `docs/research/godel/competitive-feature-matrix.md` — discovery/screening as a daily-driver capability.

## Problem
The terminal can describe, chart, and compare instruments the user already knows, but offers no way to
*discover* instruments by their numbers. A screener filters the provider's universe by quote/fundamental
fields and ranks the matches.

## Technical design (this ticket — M13 PR A)
1. **Contract** — `ScreenQuery` (`filters[]`, optional `sort`, `limit`), `ScreenFilter` (`field`, `op`,
   `value`), `ScreenRow` (symbol, name, assetClass, sector, price, changePercent, marketCap, volume) in
   `packages/contracts/src/screener.ts`; registered in the schema registry. New `screener` provider
   capability (`PROVIDER_CAPABILITY_KEYS` + `ProviderCapabilitiesSchema`).
2. **Pure evaluator** — `applyScreen(rows, query)` in `@tyche/analytics`: AND across numeric/categorical
   filters (case-insensitive text), sort (nulls last), limit. Unit-tested.
3. **Provider** — `DataProvider.screen(query)` (+ `StubProvider` fail). `MockProvider.screen` values the
   whole synthetic seed universe (`quoteFor` + seed fundamentals) then `applyScreen`s it; `screener: true`
   in `MOCK_CAPABILITIES`. Conformance gains a `screener` probe.
4. **API/web** — `POST /api/screen` (`serveCapability('screener', …)`, validates `ScreenQuery`);
   `api.screen`. New `EQS` command (`moduleId: 'screener'`, `requiredCapabilities: ['screener']`, stable)
   + `ScreenerModule` (filter builder + sortable results table, click-through to `DES`). Registered in
   `components.ts`.

## Acceptance criteria
- [x] `EQS` opens a screener; the default screen returns the universe ranked by market cap.
- [x] Filters narrow results (numeric comparisons + categorical eq/neq); sortable result columns.
- [x] `POST /api/screen` validates the query (400 on invalid) and returns rows + `screener` provenance.
- [x] Works in pure mock mode; a provider lacking `screener` degrades to the capability-unavailable state.
- [x] No order/advice surface; a screen ranks data, it does not recommend. typecheck/test/build/e2e green.

## Clean-room notes
Built on Tyche's own contracts, `DataProvider`, and the mock universe. A universe screener is a generic
discovery-tooling category feature; no Gödel artifact is reproduced.

## Non-goals (later)
- Saved screens / screen presets; alerting on a screen; backtesting.
- Fundamental ratios beyond what the mock universe carries (P/E etc.) — additive once a real provider
  supplies them.
