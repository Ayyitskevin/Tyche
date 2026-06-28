# TKT-002 — Preserve workspace createdAt on save

**Priority:** P0  ·  **Milestone:** M1  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Foundation self-review finding (HIGH): `toWorkspace()` in `apps/web/src/state/workspaceStore.ts` stamps `createdAt = now` on every serialization, destroying the original creation timestamp; `loadWorkspace()` never retains `createdAt` into store state, so it cannot be restored.
- Dossier support: `docs/research/godel/workflow-teardown.md` (lines ~94–105) — "watchlists persist across layouts" / Tyche has a tiling workspace with persistence; a save that silently rewrites creation metadata undermines the persistence story this milestone promises.
- Inconsistency reference: `apps/api/src/routes/user.ts` (line 83) already does the correct `createdAt: body.createdAt ?? now` for the workspace upsert; the web store diverges from this established server contract.

## Problem
The web workspace store loses workspace provenance. `toWorkspace()` (workspaceStore.ts:170–185) sets both `createdAt` and `updatedAt` to `now` unconditionally. Because `loadWorkspace()` (lines 159–168) does not copy `createdAt`/`updatedAt` into `WorkspaceState`, a round-trip (load → edit → save) overwrites the true creation date. Every save makes the workspace look brand-new, breaking "age"/sort-by-created semantics and diverging from the API's `createdAt ?? now` contract.

## User story
As a solo operator, I want my saved workspace to keep its original creation date across edits and reloads so that I can trust workspace age/sorting and my layout history stays accurate.

## Technical design
Mirror the server contract (`createdAt ?? now`) in the client store. Concrete steps (`apps/web/src/state/workspaceStore.ts`):
1. Add `createdAt: string | null` to the `WorkspaceState` interface (lines 23–46).
2. In `emptyState()` (lines 52–54), include `createdAt: null` in the returned pick (extend the `Pick<...>` union accordingly) so `newWorkspace`/initial state start with no creation stamp.
3. In `loadWorkspace()` (lines 159–168), set `createdAt: workspace.createdAt` so the loaded value is retained in state.
4. In `toWorkspace()` (lines 170–185), compute `const now = new Date().toISOString();` then return `createdAt: state.createdAt ?? now` and keep `updatedAt: now`. The returned object must still satisfy `WorkspaceSchema` (createdAt is required `IsoDateTime`), so the `?? now` fallback guarantees a non-null value on first save.
No contract changes: `Workspace.createdAt` is already a required `IsoDateTime` in `packages/contracts/src/workspace.ts`. This is a pure client-state-tracking fix; persistence (`apps/web/src/workspace/persistence.ts`) and the API route are unchanged.

## Affected packages / apps
- `apps/web` — `src/state/workspaceStore.ts` (only file changed) and its test `src/state/workspaceStore.test.ts`.
- No changes to `packages/contracts`, `apps/api`, or any other package.

## Data contracts
None. `WorkspaceSchema`/`Workspace` in `packages/contracts/src/workspace.ts` already define `createdAt: IsoDateTime`. No new or changed Zod types.

## Provider capabilities
None. This is local UI workspace-state plumbing and touches no `DataProvider` call or `ProviderCapability` key; behavior is identical in mock mode and BYO mode (no keys required).

## UI / module behavior
No visible panel changes. Workspace save/load via `WorkspaceGrid`/`persistence.ts` continues to work; the only behavioral change is that `createdAt` now survives a load → save round-trip. No new empty/error/capability-gap states; provenance display is unaffected (workspaces are local user state, not envelope-wrapped provider data).

## Testing plan
- Unit (`apps/web/src/state/workspaceStore.test.ts`): extend the existing "round-trips through save/load" test to assert `createdAt` is preserved across `toWorkspace` → `loadWorkspace` → `toWorkspace` (timestamp equal to the first save's `createdAt`, not the second `now`). Add a case asserting `updatedAt` still advances on re-save while `createdAt` is stable.
- Contract: keep the existing `WorkspaceSchema.safeParse(workspace)` assertion green (createdAt must remain a valid `IsoDateTime` on first save with no prior value).
- API/e2e: no new tests required; confirm `apps/web` e2e workspace save/restore (`pnpm test:e2e`) still passes.

## Acceptance criteria
- [ ] `WorkspaceState` tracks `createdAt: string | null`; `emptyState()` returns `createdAt: null`.
- [ ] `loadWorkspace()` copies `workspace.createdAt` into state.
- [ ] `toWorkspace()` returns `createdAt: state.createdAt ?? now` and `updatedAt: now`.
- [ ] Round-trip (save → load → save) preserves the original `createdAt`; `updatedAt` still advances.
- [ ] First save of a never-persisted workspace yields a valid `IsoDateTime` `createdAt`.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation derived solely from Tyche's own `workspaceStore.ts` and its existing `apps/api/src/routes/user.ts` `createdAt ?? now` convention. Competitive research is category-benchmark only (workspace persistence as a feature class); no Gödel Terminal UI, copy, code, or documentation is reproduced or referenced in the implementation.

## Non-goals
- No change to `Workspace`/`Panel` Zod contracts or schema version.
- No change to API persistence routes or `FilePersistence`.
- No per-panel `createdAt` reconciliation (panels already stamp their own `createdAt` at open time).
- No UI surfacing of workspace age/sort (separate ticket if desired).
