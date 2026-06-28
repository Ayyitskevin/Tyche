# TKT-003 — Validate imported/restored workspace JSON

**Priority:** P0  ·  **Milestone:** M1  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Foundation self-review finding (HIGH): `apps/web/src/workspace/persistence.ts` casts parsed JSON to `Workspace` with `as Workspace` in three places — `restoreWorkspace()` (line 35), `importWorkspaceJson()` (line 61), and implicitly via the API path — guarding only with `Array.isArray(workspace.panels)`. Malformed/old/hand-edited JSON flows straight into `useWorkspaceStore.getState().loadWorkspace()` (via `applyWorkspace`, line 12), violating the contracts-first rule and risking a render crash that breaks the "never crash" constraint.
- Dossier support: `docs/research/godel/workflow-teardown.md` (line ~105) — "Tyche has a tiling workspace, link groups (color), undo-close, and shortcuts"; line ~94 — "watchlists/layouts persist across layouts." A persistence story that silently loads invalid layout JSON undermines the workspace reliability this milestone promises.
- Contract reference: `packages/contracts/src/workspace.ts` already defines `WorkspaceSchema`/`WorkspaceSchema.safeParse` (lines 33–46) with required `IsoDateTime` `createdAt`/`updatedAt`, `version: z.literal(WORKSPACE_SCHEMA_VERSION)`, and `panels` — the validator to apply.

## Problem
`persistence.ts` trusts untrusted JSON. `restoreWorkspace()` reads `localStorage` and `JSON.parse(local) as Workspace`, then applies it if `panels` is an array. `importWorkspaceJson()` does the same for pasted text. Neither validates against `WorkspaceSchema`, so a stale schema `version`, missing `createdAt`/`updatedAt`, malformed `grid`, or a non-conforming `activeInstrument` is loaded into store state. Downstream (`WorkspaceGrid`, `PanelHost`) then reads fields that may be `undefined`, which can throw and crash the shell. The structural `Array.isArray(panels)` check is far weaker than the existing Zod contract.

## User story
As a solo operator, I want imported or restored workspace JSON to be validated before it loads so that a corrupt or outdated layout file fails cleanly with a clear message instead of crashing my terminal or silently loading a broken layout.

## Technical design
Make `WorkspaceSchema` the single gate before any `applyWorkspace()` call (`apps/web/src/workspace/persistence.ts`):
1. Import the schema: `import { WorkspaceSchema, type Workspace } from '@tyche/contracts';`.
2. Add a private helper `parseWorkspace(value: unknown): Workspace | null` that returns `WorkspaceSchema.safeParse(value).success ? result.data : null`. Because the schema supplies `.default(...)` for optional fields (`version`, `cols`, `rowHeight`, `panels`, etc.), safe-parse also normalizes partially-formed input.
3. `restoreWorkspace()` (lines 31–53): replace `JSON.parse(local) as Workspace` + `Array.isArray` with `const parsed = parseWorkspace(JSON.parse(local));` and only `applyWorkspace(parsed)` when non-null; on null, fall through to the API path (existing behavior). Validate the API result too: run `parseWorkspace(result.data)` before `applyWorkspace` so a stale server record cannot crash the client.
4. `importWorkspaceJson()` (lines 59–68): return `false` on `JSON.parse` throw OR on `parseWorkspace === null`; on success call `applyWorkspace(parsed)` and return `true`. Keep the boolean signature so the caller in `apps/web/src/workspace/*`/modules UI is unchanged.
5. On import failure, surface a message via the existing terminal store pattern used elsewhere in this file: `useTerminalStore.getState().pushMessage('error', 'Invalid workspace file: does not match the expected format.')`. Restore failures stay silent (fall through to empty workspace) to match current restore semantics.
6. Respect the capability model: workspaces are local user state, not provider data — no envelope/provenance and no `DataProvider` call is involved.

## Affected packages / apps
- `apps/web` — `src/workspace/persistence.ts` (only source file changed) and its test `src/workspace/persistence.test.ts`.
- `packages/contracts` — consumed only (`WorkspaceSchema`); no change.
- No changes to `apps/api`, `data-adapters`, `terminal-kernel`, or any other package.

## Data contracts
None new or changed. Reuses `WorkspaceSchema` / `Workspace` from `packages/contracts/src/workspace.ts`. The `.default(...)` clauses already present on `WorkspaceSchema` provide forward-tolerant normalization without a schema edit.

## Provider capabilities
None. This is local workspace-state plumbing; it touches no `DataProvider` method or `ProviderCapability` key. Behavior is identical in mock mode and BYO mode (no keys required).

## UI / module behavior
No new panels. On a failed `importWorkspaceJson`, the user sees an error message via the terminal status/message channel (existing `pushMessage('error', …)`); the current workspace is left untouched (no partial load). On a failed `restoreWorkspace`, the app starts from an empty workspace exactly as today (graceful, never crash). No capability-gap `EmptyState` is involved since no provider data is fetched; provenance display is unaffected (workspaces are not envelope-wrapped).

## Testing plan
- Unit (`apps/web/src/workspace/persistence.test.ts`): (a) valid `Workspace` JSON imports and `applyWorkspace` is invoked; (b) JSON missing `createdAt`/`updatedAt` is rejected — `importWorkspaceJson` returns `false` and `loadWorkspace` is not called; (c) JSON with a wrong `version` literal is rejected; (d) syntactically invalid JSON returns `false`; (e) `restoreWorkspace` with a corrupt localStorage mirror falls through to the API and, if that is also invalid, leaves an empty workspace; (f) an error message is pushed on import failure.
- Contract: assert `WorkspaceSchema.safeParse` accepts a freshly exported `exportWorkspaceJson()` payload (round-trip stays green).
- API/e2e: confirm `pnpm test:e2e` workspace save/restore still passes; add a case where a tampered exported file is rejected without crashing the shell.

## Acceptance criteria
- [ ] `restoreWorkspace()` and `importWorkspaceJson()` validate parsed JSON with `WorkspaceSchema.safeParse` before any `applyWorkspace()` call; no `as Workspace` cast remains as the sole guard.
- [ ] The API restore path also validates `result.data` before applying.
- [ ] Invalid import returns `false` and pushes an `'error'` message; the current workspace is unchanged.
- [ ] Invalid restore falls through to the API, then to an empty workspace — no crash.
- [ ] A valid exported workspace still round-trips (export → import) successfully.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation derived solely from Tyche's own `persistence.ts` and the existing `WorkspaceSchema` contract. Competitive research is category-benchmark only (workspace import/export persistence as a feature class); no Gödel Terminal UI, copy, code, or documentation is reproduced or referenced.

## Non-goals
- No change to `Workspace`/`Panel` Zod contracts or `WORKSPACE_SCHEMA_VERSION`.
- No schema-version migration/upgrade logic for old layouts (separate ticket if needed).
- No new import UI affordance (file picker/drag-drop) — only validation of the existing text/localStorage path.
- No server-side validation hardening in `apps/api` routes (the API already parses with its own schemas).
