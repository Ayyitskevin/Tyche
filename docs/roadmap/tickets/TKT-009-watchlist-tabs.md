# TKT-009 — Multiple named watchlist tabs

**Priority:** P1  ·  **Milestone:** M3  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Dossier: `docs/research/godel/workflow-teardown.md` §2 "Quote monitor / multi-watchlist" — public pattern lets users "Create multiple **named lists** (`+`)" and the Tyche translation names the gap "multiple **named watchlist tabs**" with the ticket id `watchlist-tabs` (this ticket). Category-benchmark only; no UI/copy reproduced.
- Dossier: `docs/research/godel/workflow-teardown.md` §10 "Settings & defaults" — "watchlists persist across layouts", supporting the persistence requirement met by `FilePersistence`.
- Sources: `docs/research/godel/sources.md` (T1 official command reference, T4 godelguide) frame `QM`/lists as a feature class only; the tabbed UI and CRUD wiring here are Tyche-original.

## Problem
`WatchlistModule` (`apps/web/src/modules/WatchlistModule.tsx`) only ever shows the first list: `const watchlist = watchlists.data?.[0] ?? null`. The full multi-list backend already exists — `WatchlistSchema` (`packages/contracts/src/portfolio.ts`) supports many lists, `FilePersistence` stores `watchlists: Watchlist[]` with `saveWatchlist`/`deleteWatchlist`, and `/api/watchlists` (`apps/api/src/routes/user.ts`) serves GET/POST/DELETE. A solo operator cannot create, name, rename, reorder, or switch between lists — so all symbols pile into one default list.

## User story
As a solo operator, I want multiple named watchlists I can switch between with tabs, create, rename, reorder, and delete, so that I can keep separate boards (e.g. "Megacaps", "Energy", "Earnings this week") without one giant undifferentiated list.

## Technical design
Contracts-first, capability-respecting; the backend is largely in place, so the work is UI + one optional contract field:
1. Add an optional `order: z.number().optional()` field to `WatchlistSchema` (`packages/contracts/src/portfolio.ts`) for stable tab ordering. Optional keeps existing persisted lists valid (no migration); lists without `order` sort after ordered ones, then by `createdAt`.
2. `apps/web/src/modules/WatchlistModule.tsx`: replace the `data?.[0]` selection with a tab strip. Track the active list id in local `useState` (seeded from the first list); render one tab per `Watchlist` (name + symbol count), an active-tab quote table (existing `mergeQuotes`/`quoteColumns`/`useQuoteStream` path is reused per active list's `symbols`), and a `+` "new list" affordance.
3. CRUD via the existing `apiClient` (`apps/web/src/providers/apiClient.ts`): `getWatchlists`, `saveWatchlist` already exist; add `deleteWatchlist(id)` calling `DELETE /api/watchlists/:id` (route already exists). Create = `saveWatchlist({ name, symbols: [], order })` (no `id` → server mints `wl_<uuid>`). Rename = `saveWatchlist({ ...list, name })`. Reorder = `saveWatchlist` with swapped `order` values. Each mutation calls `watchlists.reload()`.
4. Reorder UI: left/right arrow buttons (or drag) on the active tab that swap `order` with the neighbor — original, minimal interaction; no library needed.
5. Rename UI: double-click (or an inline edit affordance) on a tab turns the label into a controlled `<input>`; Enter commits via `saveWatchlist`, Escape cancels.
6. No new provider method and no new command: `W` (`packages/terminal-kernel/src/commands.ts`, `moduleId: 'watchlist'`, `requiredCapabilities: ['quotes']`) stays the single entry point; the module gains tabs internally.

## Affected packages / apps
- `apps/web` — `src/modules/WatchlistModule.tsx` (tab strip + CRUD), `src/providers/apiClient.ts` (add `deleteWatchlist`).
- `packages/contracts` — `src/portfolio.ts` (add optional `order` to `WatchlistSchema`).
- `apps/api` — no change (`/api/watchlists` GET/POST/DELETE already present in `routes/user.ts`); `FilePersistence` already stores the array.

## Data contracts
Changed: `WatchlistSchema` (`packages/contracts/src/portfolio.ts`) gains `order: z.number().optional()`. No other schema changes; `Watchlist` (`z.infer`) flows unchanged through `apiClient`, `user.ts`, and `PersistedState.watchlists` (`apps/api/src/persistence/types.ts`).

## Provider capabilities
Required: `quotes` (already gates `W` and drives the per-list quote table; `MockProvider` returns quotes). Watchlist CRUD itself is local persistence, not a provider capability — works in **mock mode with no keys** (default `My Watchlist` exists via `FilePersistence` seed) and identically in BYO mode.

## UI / module behavior
- Tab strip across the top: one tab per list (name + count), active tab highlighted; `+` creates a new "Untitled" list and focuses its rename input.
- Active list renders the existing virtualized `DataTable` quote board with streaming; row click keeps `executeInput('<SYM> DES')`; per-row remove and the add-symbol input operate on the **active** list only.
- Empty/error/capability-gap: zero lists → `EmptyState` ("Create a watchlist to begin"); active list empty → existing "Watchlist is empty." `EmptyState`; missing `quotes` capability → existing `missingCapabilities` gap state (never crashes). Delete of the last list returns to the zero-list `EmptyState`.
- Provenance: unchanged — `useReportProvenance(reportProvenance, initial.provenance)` reports the active list's quote-batch provenance; `/api/watchlists` responses still carry `localProvenance('watchlists')`.

## Testing plan
- Contract (`packages/contracts/src/portfolio.test.ts`): `WatchlistSchema` accepts and round-trips `order`; lists without `order` still parse.
- API (`apps/api` route tests for `user.ts`): POST creates a second list (distinct `id`); POST with existing `id` updates name/order; DELETE removes by id; GET returns all lists with provenance.
- Unit (`apps/web/src/modules/WatchlistModule.test.tsx`): renders one tab per list; clicking a tab swaps the active board; `+` calls `saveWatchlist`; rename commits via `saveWatchlist`; reorder swaps `order`; deleting the last list shows `EmptyState`.
- e2e (`apps/web` Playwright, watchlist flow): `W` → create "Energy" → add a symbol → switch tabs → rename → delete; assert persistence across reload.

## Acceptance criteria
- [ ] `WatchlistModule` renders a tab per `Watchlist` and switches the active quote board on tab click (no longer hardcoded to `data?.[0]`).
- [ ] Create, rename, reorder (`order`), and delete work via `/api/watchlists` (POST/DELETE) and persist across an API restart through `FilePersistence`.
- [ ] `WatchlistSchema` gains optional `order`; existing persisted lists without it still parse (no migration needed).
- [ ] Zero-list and capability-gap (`quotes` missing) states render graceful `EmptyState` and never crash; every API response keeps its provenance envelope.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are all green.

## Clean-room notes
Original implementation built solely from Tyche's own `WatchlistModule`, `apiClient`, `user.ts` routes, `FilePersistence`, and `WatchlistSchema`. "Multiple named watchlists with tabs" is treated as a feature *category* benchmarked from public descriptions only; no Gödel Terminal UI, layout, tab design, copy, or command-doc text is reproduced. The `+`-to-create affordance is a generic UI pattern, implemented in Tyche's own chrome.

## Non-goals
- No batch/CSV symbol import (separate `batch-import` ticket) and no higher symbol ceiling / latency column (`quote-monitor-v2`).
- No cross-device sync, sharing, or multi-user watchlists; persistence stays local via `FilePersistence`.
- No new provider capability, no new terminal command, no changes to `QM`.
- No order placement and no personalized advice; lists are read-only quote boards.
