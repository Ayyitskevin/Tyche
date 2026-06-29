# TKT-034 — Saved screens / presets

**Priority:** P3  ·  **Milestone:** M13  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- Follows TKT-033 (equity screener). Saved/named queries are a generic research-terminal convenience
  (cf. saved searches), benchmarked at the category level only.

## Problem
TKT-033 shipped the `EQS` screener, but a screen is ephemeral — the operator rebuilds the filters each
session. A named, persisted screen lets them re-run "small-cap energy gainers" with one click.

## Technical design (M13 PR B)
1. **Contract** — `SavedScreen` (`id`, `name`, `query: ScreenQuery`, timestamps) in
   `packages/contracts/src/screener.ts`; registered in the schema registry.
2. **Persistence** — `savedScreens` collection on `PersistedState` (defaults to `[]`); `PersistenceStore`
   gains `list/save/deleteSavedScreen`. Implemented in both adapters: `FilePersistence` (forward-compat via
   the `defaultState()` spread) and `SqlitePersistence` (a `saved_screens` table created with
   `CREATE TABLE IF NOT EXISTS`, so an existing db gains it on reopen — no version bump needed). Covered by
   the cross-backend parity suite.
3. **API/web** — `GET/POST/DELETE /api/screens` validating `SavedScreenSchema` (400 on invalid) + audit
   `screen.save`, local `savedScreens` provenance. `api.getSavedScreens/saveScreen/deleteScreen`. The
   `ScreenerModule` gains a Save button (name prompt → persist the current query) and a "Saved:" chip row
   (click a chip to load its query into the filter builder + sort + run; ✕ to delete).

## Acceptance criteria
- [x] A screen can be named and saved; saved screens persist and reload as clickable presets.
- [x] Loading a preset repopulates the filters/sort and re-runs the screen.
- [x] `POST /api/screens` validates the embedded `ScreenQuery` (400 on a bad query) and audits the save.
- [x] Both persistence backends store/retrieve saved screens (parity suite); SQLite gains the table on an
  existing db without a migration.
- [x] No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Built on Tyche's own `ScreenQuery` contract, the `PersistenceStore` interface, and the existing routes.
A saved-search convenience is a generic category feature; no Gödel artifact is reproduced.

## Non-goals (later)
- Sharing/exporting saved screens; scheduled screens / alerting on a screen.
- A dedicated screen-manager panel (the chip row in `EQS` suffices for now).
