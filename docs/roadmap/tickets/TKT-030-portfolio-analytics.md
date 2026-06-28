# TKT-030 — Portfolio analytics (read-only, no broker)

**Priority:** P2  ·  **Milestone:** M10  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/command-taxonomy.md:32,66,70` — Gödel's portfolio category is `BROK` (link a brokerage → upcoming portfolio features) and an unconfirmed `PORT`; the taxonomy explicitly records **"Tyche will NOT implement" `BROK`**. This ticket builds the *read-only* slice (`PORT` minus execution and minus broker linking).
- `docs/research/godel/tyche-gap-analysis.md:55` — gap row **"Portfolio (read-only, manual/import, NO broker)" → `PORT` minus execution**, areas `contracts/portfolio`, `api`, `apps/web`, effort M, milestone **M10 / `portfolio-analytics`**. This ticket is that row.
- `docs/research/godel/tyche-gap-analysis.md:71` and `docs/research/godel/solo-operator-strategy.md:80` — guardrail this ticket honors: **no brokerage linking / order placement** (Gödel `BROK`); "Tyche places no orders, period."
- `docs/research/godel/solo-operator-strategy.md:51` — "Workspaces, watchlists, notes, alerts, **portfolios** → local file / SQLite (already the design)" — the local-first persistence model this ticket realizes.

## Problem
The `PORT` command exists (`packages/terminal-kernel/src/commands.ts:297`, `moduleId: 'portfolio'`, maturity `beta`) and `PortfolioSchema`/`PositionSchema` are defined (`packages/contracts/src/portfolio.ts`), and `PersistedState.portfolios: Portfolio[]` is reserved (`apps/api/src/persistence/types.ts`). But there is **no portfolio component** (no `portfolio` key in `apps/web/src/modules/components.ts`, so the registry falls back to `BetaPlaceholder`), **no `PersistenceStore` CRUD** for portfolios, and **no API routes**. Today `PORT` renders an empty placeholder. This ticket makes it functional: enter positions manually or via CSV import, mark them live against `quotes`, and compute P&L with `@tyche/analytics` — strictly read-only.

## User story
As a solo operator/analyst, I want to record my holdings (or paste them in) and see live market value and unrealized P&L marked against current quotes, so that I can track my book inside Tyche without linking a brokerage or placing any orders.

## Technical design
Contracts-first; provenance preserved; the only market call is `quotes`.
1. **Persistence methods (`apps/api/src/persistence/types.ts` + `FilePersistence.ts`).** Add `listPortfolios()/getPortfolio(id)/savePortfolio(p)/deletePortfolio(id)` to `PersistenceStore`, mirroring the existing watchlist methods; back them with the reserved `portfolios` array. No version bump needed (the field already exists; default `[]`).
2. **API routes (`apps/api/src/routes/user.ts`).** Add `GET/POST /api/portfolios`, `DELETE /api/portfolios/:id` validating with `PortfolioSchema.safeParse` (400 on failure, matching the watchlist block at `user.ts:37-53`), each `audit.record({ action: 'portfolio.save' | 'portfolio.delete' })`, all responses enveloped `{ data, provenance: localProvenance('portfolios') }`. Stored positions persist only entry data (`symbol, quantity, averageCost, assetClass`); `marketPrice/marketValue/unrealizedPnl` are **never persisted** — they are computed live.
3. **Live marks via quotes (web).** The panel fetches `api.getQuotes(symbols)` (`apiClient.ts:101`) for the held symbols; capability-gap (no `quotes`) → graceful `EmptyState`, never a crash.
4. **Analytics (`@tyche/analytics`).** Compute per-position `marketValue = quantity * quote.last`, `unrealizedPnl = (last - averageCost) * quantity`, and weight %; portfolio totals + day change. Use `simpleReturns`/`cumulativeReturn` (`returns.ts`) and `volatility`/`maxDrawdown` (`risk.ts`) for the summary band; no new analytics primitives required.
5. **apiClient (`apps/web/src/providers/apiClient.ts`).** Add `getPortfolios/savePortfolio/deletePortfolio` alongside the watchlist calls, typed with the `Portfolio` contract.
6. **PortfolioModule + registration.** New `apps/web/src/modules/PortfolioModule.tsx`; register `portfolio: PortfolioModule` in `components.ts` so the registry (`modules/registry.ts`) binds it instead of `BetaPlaceholder`. CSV import reuses the batch-import pattern from TKT-010.

## Affected packages / apps
- `apps/api` — `persistence/types.ts` (portfolio store methods), `persistence/FilePersistence.ts` (impl), `routes/user.ts` (3 routes + audit).
- `apps/web` — `providers/apiClient.ts` (portfolio calls), `modules/PortfolioModule.tsx` (new), `modules/components.ts` (register).
- `packages/analytics` — used as-is (returns/risk); no new exports.
- `packages/contracts` — `portfolio.ts` reused; no shape change required (see below).

## Data contracts
**No new schema required** — `PositionSchema`/`PortfolioSchema` already exist in `packages/contracts/src/portfolio.ts` and cover entry (`quantity`, `averageCost`, `costBasis`, `assetClass`) plus computed (`marketPrice`, `marketValue`, `unrealizedPnl`) fields as `.optional()`. Optionally add a `PortfolioImportRowSchema` (`{ symbol, quantity, averageCost? }`) in `portfolio.ts` for CSV validation, registered in `schemas.ts` as `PortfolioImportRow`. The computed-value fields stay optional and are populated only in the response/UI, never persisted.

## Provider capabilities
**Required: `quotes`.** Live marks come exclusively from the `quotes` capability (`MockProvider` already returns quotes, so this works in **mock mode with no keys**). The `PORT` command's declared `requiredCapabilities: ['portfolio']` (`commands.ts:306`) is changed to `['quotes']` — the `portfolio` capability key is reserved for *broker-fed* portfolios, which is an explicit non-goal. Entry/persistence is local (`localProvenance('portfolios')`) and needs no capability. BYO providers that advertise `quotes` mark positions identically.

## UI / module behavior
- Panel: a positions `DataTable` (symbol, qty, avg cost, last, mkt value, unrealized P&L, weight %) plus a summary band (total value, cash, total/day P&L). Manual add-row + CSV import; per-row delete. No buy/sell/trade affordance anywhere.
- Empty: no positions → `EmptyState` ("Add a position or import a CSV").
- Error: a failed save/import surfaces `ErrorState`; malformed CSV rows are rejected (Zod) without corrupting the stored portfolio.
- Capability-gap: provider without `quotes` → marks/P&L columns show em-dash and an inline `EmptyState` hint; entered positions still render (cost basis only). Never crashes.
- Provenance: quote-derived cells show `ProvenanceBadge`/`FreshnessBadge` from the quote envelope; persisted positions show `localProvenance('portfolios')` (mode `local`).

## Testing plan
- Contract — `packages/contracts/src/schemas.test.ts`: `PortfolioSchema` round-trips; `PortfolioImportRow` (if added) rejects a non-numeric quantity.
- API — `apps/api/src/app.test.ts`: `POST /api/portfolios` 400s on invalid body, 200s enveloped; `GET`/`DELETE` round-trip; `portfolio.save`/`portfolio.delete` audit events recorded; computed mark fields are not persisted.
- Unit — `apps/web/src/modules/PortfolioModule.test.tsx`: P&L math (`marketValue`, `unrealizedPnl`, weight) is correct; CSV import parses valid rows and rejects bad ones; capability-gap hides marks without crashing.
- Analytics — `packages/analytics/src/analytics.test.ts`: confirm `cumulativeReturn`/`maxDrawdown` used by the summary band on a known series.
- e2e (`apps/web` Playwright): open `PORT` against mock, add `AAPL` 10 @ 100, assert live mkt value/P&L render and reload persists the position.

## Acceptance criteria
- [ ] `PORT` renders a functional portfolio panel (not `BetaPlaceholder`); `portfolio` registered in `modules/components.ts`.
- [ ] Positions are added manually and via CSV import; persisted via new `PersistenceStore` portfolio methods; entry-only fields stored, marks never persisted.
- [ ] `GET/POST/DELETE /api/portfolios` validate with `PortfolioSchema`, record audit events, and return enveloped `{ data, provenance }`.
- [ ] Live market value + unrealized P&L computed from `quotes` via `@tyche/analytics`; works in mock mode with no keys.
- [ ] Capability-gap (no `quotes`) and empty/error states render gracefully; no order placement or brokerage UI exists anywhere.
- [ ] `PORT` `requiredCapabilities` is `['quotes']`; `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` all green.

## Clean-room notes
Original implementation assembled only from Tyche's own pieces: the existing `PortfolioSchema`/`PositionSchema` contracts, the reserved `PersistedState.portfolios` field, the watchlist route/persistence pattern, `@tyche/analytics` primitives, and `localProvenance`. The feature is a **category benchmark** only — `PORT` minus execution per the gap analysis — and deliberately omits Gödel's `BROK` broker-link path. No Gödel Terminal UI, copy, command documentation, layout, or trade dress is reproduced. Portfolios stay local files the user owns.

## Non-goals
- Brokerage account linking or any `BROK`-style integration — explicit non-goal; nothing is fetched from a broker.
- Order placement, trade execution, or any buy/sell affordance — Tyche places no orders, period.
- Personalized advice, position sizing recommendations, or tax-lot optimization.
- Multi-currency FX conversion of marks, realized-P&L/transaction-ledger accounting, and cloud sync/sharing — later tracks (positions are local-first, base-currency only here).
