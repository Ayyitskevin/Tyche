# TKT-035 — Market movers (MOST)

**Priority:** P3  ·  **Milestone:** M14  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `ROADMAP.md` research pool: "global `TOP`/`MOST` feeds" listed under research-backed opportunities.
- A movers board (top gainers/losers/most-active) is a generic daily-driver discovery surface,
  benchmarked at the category level only.

## Problem
The `EQS` screener (TKT-033) can answer any custom query, but the most common discovery question —
"what's moving today?" — shouldn't require building a filter each time.

## Technical design (M14 anchor)
A curated screen, reusing the existing `screener` capability — **no new contract, route, or persistence**.
- New `MOST` command (aliases `MOVERS`, `GAINERS`; `moduleId: 'movers'`, `requiredCapabilities:
  ['screener']`, stable, category `market-data`).
- `MoversModule`: three tab views — **Gainers** (`sort changePercent desc`), **Losers** (`changePercent
  asc`), **Most active** (`volume desc`) — each a preset `api.screen` query (limit 20). Sortable results
  table; click-through to `DES`. Reuses the screener envelope/provenance and the capability-gap state.

## Acceptance criteria
- [x] `MOST` opens a movers board with Gainers/Losers/Most-active views.
- [x] Each view ranks the universe by the right field; switching views re-queries.
- [x] Gates on the `screener` capability (degrades to capability-unavailable without it); no new route.
- [x] No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Built entirely on Tyche's own `screener` capability and the `EQS` plumbing. A movers board is a generic
discovery-tooling category feature; no Gödel artifact is reproduced.

## Non-goals (later)
- Movers scoped to a watchlist/sector; intraday/streaming movers; configurable result count.
