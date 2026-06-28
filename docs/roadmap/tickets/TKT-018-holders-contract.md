# TKT-018 — Institutional holders (HDS) module

**Priority:** P1  ·  **Milestone:** M7  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/command-taxonomy.md:58` — "HDS | research | Institutional holders (13F): value, shares, change, %" (status: confirmed / high) — the category feature this ticket benchmarks.
- `docs/research/godel/command-taxonomy.json:162-169` — `id: HDS`, `purpose: "Institutional holdings / ownership (13F-style)"`, `dataDependencies: ["ownership"]` — confirms the capability key.
- `docs/research/godel/competitive-feature-matrix.md:35` — "Holders / 13F | HDS | beta | holders table | ownership | contracts | P2 | M | Low | holders module | M7" — the named gap and its M7 milestone.
- `docs/research/godel/competitive-feature-matrix.md:64` — "estimates, ratings, holders, and trades, so several beta rows are data-ready, UI-pending" — confirms the contract/mock layer is done and this is route + UI wiring.
- `docs/research/godel/tyche-competitive-roadmap.md:86-95` — "Milestone 7 — Estimates, ratings, holders ... ownership (mock ready; EDGAR 13F for holders; BYO)" — places HDS in M7 and flags EDGAR 13F as the later real source.
- `docs/research/godel/tyche-gap-analysis.md:44` — maps `HDS` [T1] to `apps/web` + `contracts/fundamentals` + `ownership` under `holders-contract` / M7.

## Problem
`HDS` exists in `DEFAULT_COMMANDS` (`packages/terminal-kernel/src/commands.ts:236`, `aliases: ['HOLDERS']`, `moduleId: 'holders'`, `requiredCapabilities: ['ownership']`, `maturity: 'beta'`, `defaultPanelSize { w: 6, h: 12 }`), the `ownership` capability is declared (`packages/contracts/src/provider.ts:22,46`), the `InstitutionalHolder` contract exists (`packages/contracts/src/fundamentals.ts:81-90`), and `MockProvider.getOwnership` already returns deterministic holder rows with shares / marketValue / percentOfShares / changeShares / reportDate (`packages/data-adapters/src/MockProvider.ts:700-721`). But there is **no `/api/ownership/:symbol` route** (`apps/api/src/routes/research.ts` serves news/filings/financials/options only), no `getOwnership` method on the web `api` client (`apps/web/src/providers/apiClient.ts`), and no `HoldersModule` (`apps/web/src/modules/`). So `holders` is absent from `moduleComponents` (`apps/web/src/modules/components.ts:17-31`) and `AAPL HDS` falls through to `BetaPlaceholder`.

## User story
As a solo operator/analyst, I want `AAPL HDS` to show the top institutional holders of a name with shares, market value, ownership %, and reported change, so that I can gauge who holds the stock and how positions are shifting — without a brokerage account or a 13F spreadsheet.

## Technical design
Contracts-first; capability model preserved; reuse the `FilingsModule` table pattern and the `ModuleBody` ladder.
1. **API route.** Add `GET /api/ownership/:symbol` to `apps/api/src/routes/research.ts` via `serveCapability(reply, ctx.registry, 'ownership', (p) => p.getOwnership(symbol))` — same shape as the existing `/api/filings/:symbol` handler. No new helper; the provenance envelope is automatic.
2. **API client method.** Add `getOwnership: (symbol) => fetchEnvelope<InstitutionalHolder[]>(\`/api/ownership/${encodeURIComponent(symbol)}\`)` to the `api` object in `apps/web/src/providers/apiClient.ts`, importing `InstitutionalHolder` from `@tyche/contracts`.
3. **Module component.** Add `apps/web/src/modules/HoldersModule.tsx`, mirroring `FilingsModule`: `useApiData(() => symbol ? api.getOwnership(symbol) : noSymbol(), [symbol])`; gate on `symbol` with `SymbolRequired`; render through `ModuleBody` with `emptyMessage="No institutional holders for this instrument."`; lift provenance via `useReportProvenance(reportProvenance, holders.provenance)`. Render a `DataTable<InstitutionalHolder>` (`getRowKey={(h) => h.holder}`, `rowHeight={26}`) with columns: Holder (`holder`), Shares (`shares`, right-aligned, `formatNumber`), Value (`marketValue`, `formatCurrency`), % Out (`percentOfShares`, `formatPercent`), Change (`changeShares`, signed, color-coded positive/negative like other modules). Default sort by shares descending in the cell-builder before passing rows.
4. **Register.** Import `HoldersModule` and add `holders: HoldersModule` to `moduleComponents` so `registry.ts` resolves it instead of `BetaPlaceholder`. Optional metadata-only flip of `HDS` `maturity` `beta` → `stable` in `commands.ts` once shipped.

## Affected packages / apps
- `apps/api` — new `GET /api/ownership/:symbol` in `routes/research.ts` (one `serveCapability` call).
- `apps/web` — new `modules/HoldersModule.tsx`; register `holders` in `modules/components.ts`; add `getOwnership` to `providers/apiClient.ts`. Reuses `providers/useApiData.ts`, `modules/common.tsx`, `@tyche/ui` `DataTable` + `format.ts` (`formatNumber`/`formatCurrency`/`formatPercent`).
- `packages/terminal-kernel` — optional `maturity` flip for `HDS` (metadata-only; skip if risky).
- No changes to `packages/contracts` or `packages/data-adapters` — `InstitutionalHolder` and `MockProvider.getOwnership` already exist.

## Data contracts
None required. `InstitutionalHolderSchema` / `InstitutionalHolder` already exist (`packages/contracts/src/fundamentals.ts:81-90`) with `holder`, `shares`, optional `marketValue` / `percentOfShares` / `percentOfPortfolio` / `changeShares`, and `reportDate`. The module renders these fields as-is; no new or changed Zod type is added.

## Provider capabilities
Requires `ownership` (`ProviderCapabilities.ownership`, `packages/contracts/src/provider.ts:22,46`). Satisfied by the deterministic `MockProvider`, so mock mode works with no keys. BYO providers declaring `ownership` work unchanged. A future EDGAR-13F-backed implementation is a **separate provider ticket** (extend `stubs/SecEdgarProvider.ts`), not this one. When `ownership` is missing, `serveCapability` yields `unavailable` / `missingCapabilities` and `ModuleBody` renders the capability-gap `EmptyState` — never a crash.

## UI / module behavior
- Panel: a holders `DataTable` (Holder / Shares / Value / % Out / Change), numerics right-aligned mono via `@tyche/ui` `format.ts`; positive/negative `changeShares` color-coded; default `w: 6, h: 12`.
- No symbol → `SymbolRequired`; empty holders (mock returns `[]` for non-equity asset classes, `MockProvider.ts:702-704`) → `EmptyState` ("No institutional holders for this instrument."); loader error → `ErrorState` with retry; capability gap → capability `EmptyState`. All via `ModuleBody`.
- Missing optional fields (`marketValue`, `percentOfShares`, `changeShares`) render em-dash, never `NaN`.
- `ProvenanceBadge` / `FreshnessBadge` reflect `ownership` provenance (mock freshness `eod`) lifted via `useReportProvenance` — surfaced honestly, no false "live".

## Testing plan
- Unit (`apps/web/src/modules/HoldersModule.test.tsx`, RTL + mocked `api`): rows render Holder/Shares/Value/%Out/Change; missing optional fields → em-dash; empty list → empty-state; error → `ErrorState`; capability gap → capability `EmptyState`; no symbol → `SymbolRequired`.
- API (`apps/api` route tests): `GET /api/ownership/AAPL` returns `{ data, provenance }` with `provenance.capability === 'ownership'`; a registry without `ownership` returns graceful `unavailable` / `missingCapabilities`.
- Contract (`packages/data-adapters/src/MockProvider.test.ts` area): confirm `getOwnership` output parses `InstitutionalHolderSchema[]`; `checkProviderConformance` (`conformance.ts`) still passes.
- e2e (`apps/web` Playwright): `AAPL HDS` opens the holders panel against mock; assert at least one holder row with shares + value renders, and a non-equity symbol shows the empty-state.

## Acceptance criteria
- [ ] `AAPL HDS` renders an institutional-holders table (Holder, Shares, Value, % Out, Change) from `InstitutionalHolder[]`, sorted by shares descending.
- [ ] `GET /api/ownership/:symbol` serves an `{ data, provenance }` envelope via `serveCapability` and `provenance.capability === 'ownership'`.
- [ ] `holders` is registered in `moduleComponents` and `HDS` no longer falls back to `BetaPlaceholder`.
- [ ] Capability gap / empty (non-equity) / error / no-symbol states render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] Missing optional fields render em-dash (never `NaN`); ownership provenance/freshness is surfaced via the panel badges.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`fundamentals.ts`, `provenance.ts`), the deterministic `MockProvider`, the existing `serveCapability` route pattern, and `@tyche/ui` components (`DataTable`, `format.ts`, `EmptyState`/`ErrorState`, provenance badges). An institutional-holders table (holder / shares / value / % / change) is a standard category feature; the column set is benchmarked from Tyche's own research dossier and rendered with Tyche's own components. No Gödel Terminal UI, copy, code, layout, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- A real EDGAR 13F ingestion pipeline / `SecEdgarProvider.getOwnership` implementation — separate provider ticket; mock-only here.
- Holder-level drill-through (per-institution position history, filings links) or ownership-trend charting.
- Insider transactions, fund flows, or short-interest data (distinct capabilities/contracts).
- Persisting or transporting derived ownership aggregates as a new Zod contract.
- Any personalized advice or recommendation derived from ownership — out of scope by foundation constraint.
- Order placement or brokerage — out of scope by foundation constraint.
