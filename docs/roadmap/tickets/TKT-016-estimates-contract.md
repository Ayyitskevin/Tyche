# TKT-016 — Estimates matrix (EM) module

**Priority:** P1  ·  **Milestone:** M7  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/command-taxonomy.md:55` — "EM | fundamentals | Earnings Matrix: forward EPS/revenue by Q/Y + implied P/E·P/S·P/CF + ratings/targets" — the category feature this ticket benchmarks (status: confirmed / med).
- `docs/research/godel/competitive-feature-matrix.md:32` — "Estimates | EM | beta | matrix + implied multiples | estimates | contracts | P2 | M | Low | estimates matrix | M7" — the named gap and its M7 milestone.
- `docs/research/godel/competitive-feature-matrix.md:64` — "estimates, ratings, holders, and trades, so several beta rows are data-ready, UI-pending" — confirms the data/contract layer is done and this is a route + UI wiring ticket.
- Public command grammar (`docs/research/godel/command-taxonomy.md:8-21`) — `AAPL EM` style invocation; Tyche's tolerant parser already supports it.

## Problem
`EM` exists in `DEFAULT_COMMANDS` (`packages/terminal-kernel/src/commands.ts:197`, `moduleId: 'estimates'`, `requiredCapabilities: ['estimates']`, `maturity: 'beta'`), the `estimates` capability is declared (`packages/contracts/src/provider.ts`), the `EstimateMetric` contract exists (`packages/contracts/src/fundamentals.ts:42`), and `MockProvider.getEstimates` already returns deterministic EPS + revenue metrics across four periods with mean/median/high/low/numAnalysts (`packages/data-adapters/src/MockProvider.ts:632`). But there is **no `/api/estimates/:symbol` route** (`apps/api/src/routes/research.ts` serves news/filings/financials/options only), no `getEstimates` method on the web `api` client (`apps/web/src/providers/apiClient.ts`), and no `EstimatesModule` (`apps/web/src/modules/`). So `estimates` is absent from `moduleComponents` (`apps/web/src/modules/components.ts`) and `AAPL EM` falls through to `BetaPlaceholder`.

## User story
As a solo operator/analyst, I want `AAPL EM` to show forward consensus EPS and revenue by period alongside locally-computed implied P/E, P/S, and P/CF, so that I can read a name's forward valuation in one panel without a brokerage account or external spreadsheet.

## Technical design
Contracts-first; capability model preserved; reuse the `FinancialsModule` matrix pattern and the `ModuleBody` ladder.
1. **API route.** Add `GET /api/estimates/:symbol` to `apps/api/src/routes/research.ts` via `serveCapability(reply, ctx.registry, 'estimates', (p) => p.getEstimates(symbol))` — same shape as the existing `/api/financials/:symbol` handler. No new helper; provenance envelope is automatic.
2. **API client method.** Add `getEstimates: (symbol) => fetchEnvelope<EstimateMetric[]>(\`/api/estimates/${encodeURIComponent(symbol)}\`)` to the `api` object in `apps/web/src/providers/apiClient.ts`, importing `EstimateMetric` from `@tyche/contracts`.
3. **Module component.** Add `apps/web/src/modules/EstimatesModule.tsx` mirroring `FinancialsModule`: load with `useApiData(() => symbol ? api.getEstimates(symbol) : noSymbol(), [symbol])`; gate on `symbol` with `SymbolRequired`; render through `ModuleBody`; lift provenance via `useReportProvenance`. Build a matrix with one row per metric/derived-multiple and one column per `EstimatePeriod` (`current_quarter`, `next_quarter`, `current_year`, `next_year`), using `fiscalLabel` as the column header (fallback to the period key). Rows: EPS (mean, with high/low as a secondary line or tooltip), Revenue (mean), and the three **locally computed** implied multiples.
4. **Implied multiples (local compute).** Implied P/E = price ÷ forward EPS mean; implied P/S = price × sharesOutstanding ÷ forward revenue mean; implied P/CF = price × sharesOutstanding ÷ forward operating-cash-flow estimate. Source price from `api.getQuote(symbol)` (`Quote.last`/`price`). Source shares-out and operating cash flow from `api.getFinancials(symbol, { type: 'cash_flow' })` (mock cash-flow statement carries an operating-cash-flow line item). Compute in a small pure helper (e.g. `computeImpliedMultiples(metrics, quote, statements)`) co-located in the module or a `modules/estimates.ts` util so it is unit-testable. Any missing input (null EPS, no quote, zero divisor) yields `null` → renders em-dash, never `NaN`/`Infinity`.

## Affected packages / apps
- `apps/api` — new `GET /api/estimates/:symbol` in `routes/research.ts` (one `serveCapability` call).
- `apps/web` — new `modules/EstimatesModule.tsx`; register `estimates` in `modules/components.ts`; add `getEstimates` to `providers/apiClient.ts`. Reuses `providers/useApiData.ts`, `modules/common.tsx`, `@tyche/ui` `formatNumber`/`formatCurrency`/`formatPercent`.
- `packages/terminal-kernel` — optional `maturity` flip `beta` → `stable` for `EM` in `commands.ts` once shipped (metadata-only; skip if risky).
- No changes to `packages/contracts` or `packages/data-adapters` — `EstimateMetric` and `MockProvider.getEstimates` already exist.

## Data contracts
None required. `EstimateMetric` / `EstimatePeriodSchema` already exist (`packages/contracts/src/fundamentals.ts:34-54`). The implied P/E·P/S·P/CF are **derived view-model fields computed in the web layer**, not persisted or transported, so no new Zod type is added. If a future BYO provider ships pre-computed multiples, that is a separate ticket.

## Provider capabilities
Requires `estimates` (`ProviderCapabilities.estimates`, `packages/contracts/src/provider.ts`). Satisfied by the deterministic `MockProvider`, so mock mode works with no keys. The multiples additionally read `quotes` and `fundamentals` for price/shares/cash-flow; when those are absent the affected multiple rows degrade to em-dash while the EPS/revenue matrix still renders. BYO providers declaring `estimates` work unchanged. When `estimates` is missing, `serveCapability` yields `unavailable`/`missingCapabilities` and `ModuleBody` renders the capability-gap `EmptyState` — never a crash.

## UI / module behavior
- Panel: a period-column matrix (EPS / Revenue / implied P/E / P/S / P/CF rows) styled like `FinancialsModule`'s table; right-aligned mono numerics via `@tyche/ui` `formatNumber`/`formatCurrency`.
- No symbol → `SymbolRequired`; empty metrics (e.g. non-equity asset class, which mock returns as `[]`) → `EmptyState` ("No estimates for {symbol}."); loader error → `ErrorState` with retry; capability gap → capability `EmptyState`. All via `ModuleBody`.
- Missing/derived nulls render em-dash, never `NaN`. Multiples are clearly labeled "implied" and computed locally — no forward-looking advice or recommendation.
- `ProvenanceBadge`/`FreshnessBadge` reflect the `estimates` provenance (mock freshness `eod`) lifted via `useReportProvenance` — surfaced honestly.

## Testing plan
- Unit (`apps/web/src/modules/EstimatesModule.test.tsx`, RTL + mocked `api`): matrix renders EPS/revenue rows across the four periods with `fiscalLabel` headers; implied multiples appear when quote + financials resolve; missing quote/EPS/divisor → em-dash; empty metrics → empty-state; error → `ErrorState`; capability gap → capability `EmptyState`.
- Unit (`computeImpliedMultiples`): pure-function table tests for P/E, P/S, P/CF including null EPS, missing quote, and zero-divisor guards.
- API (`apps/api` route tests): `GET /api/estimates/AAPL` returns `{ data, provenance }` with `provenance.capability === 'estimates'`; a registry without `estimates` returns graceful `unavailable`/`missingCapabilities`.
- Contract (`packages/data-adapters/src/MockProvider.test.ts` area): confirm `getEstimates` output parses `EstimateMetricSchema[]`; `checkProviderConformance` (`conformance.ts`) still passes.
- e2e (`apps/web` Playwright): `AAPL EM` opens the estimates matrix against mock; assert EPS/revenue rows + at least one implied-multiple value render, and a non-equity symbol shows the empty-state.

## Acceptance criteria
- [ ] `AAPL EM` renders a period matrix of forward EPS and revenue (mean) from `EstimateMetric[]`, with `fiscalLabel` column headers.
- [ ] Implied P/E, P/S, and P/CF rows are computed locally from quote + financials and render right-aligned; missing inputs render em-dash (never `NaN`/`Infinity`).
- [ ] `GET /api/estimates/:symbol` serves an `{ data, provenance }` envelope via `serveCapability` and `provenance.capability === 'estimates'`.
- [ ] `estimates` is registered in `moduleComponents` and `EM` no longer falls back to `BetaPlaceholder`.
- [ ] Capability gap / empty (non-equity) / error / no-symbol states render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] Estimates provenance/freshness is surfaced via the panel badges; no false "live".
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`fundamentals.ts`, `provenance.ts`), the deterministic `MockProvider`, the existing `serveCapability` route pattern, and `@tyche/ui` components (`format.ts`, `EmptyState`/`ErrorState`, provenance badges). A forward-estimates matrix with implied valuation multiples is a standard category feature; the row/column set is benchmarked from Tyche's own research dossier, and the multiples are computed by Tyche's own formulas. No Gödel Terminal UI, copy, code, layout, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Earnings history vs actual (`ERN`, separate ticket / `moduleId: 'earnings'`).
- New `estimates` provider stubs or live BYO estimate feeds — mock-only here.
- Persisting or transporting computed multiples as a Zod contract (view-model only).
- Charting estimate revisions/trends over time, or surprise/beat-miss analytics.
- Any forward-looking recommendation, target, or personalized advice — out of scope by foundation constraint.
- Order placement or brokerage — out of scope by foundation constraint.
