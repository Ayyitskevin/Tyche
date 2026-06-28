# TKT-021 — Preferences: default command + pinned commands

**Priority:** P2  ·  **Milestone:** M3  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- https://godelterminal.com (settings) — category benchmark for a settings surface exposing theme, default command, and **pinned commands**. Used only to confirm the feature category, not for UI, copy, layout, or colors.
- `docs/research/godel/workflow-teardown.md:91-98` — "Settings & defaults … users set … **theme**, and **pinned commands** … Tyche has a SETTINGS module + preferences persistence. Gaps: a **default command** for bare symbols (already a pref), **pinned commands** … Ticket `user-preferences-defaults`." — direct translation note this ticket implements.
- `docs/research/godel/command-taxonomy.md:68` and `:78` — "SETTINGS | system | … theme, **pinned commands**, window sizes; watchlists persist" / "Persistence: … pinned commands; color/theme settings."
- `docs/research/godel/tyche-gap-analysis.md:58` — "User preferences / default command / pinned cmds | parity + ergonomics | `contracts/workspace`, `apps/web` | S | M3 / `user-preferences-defaults`."
- `docs/research/godel/competitive-feature-matrix.md:52` — "User preferences | SETTINGS | … pinned cmds, theme tokens | contracts | … prefs (done) + pins | M3."

## Problem
`UserPreferences` (`packages/contracts/src/workspace.ts:56`) already carries `defaultCommandId` (used by `executeInput` → `parseCommand` at `apps/web/src/terminal/execute.ts:11-13` to expand a bare symbol like `AAPL` into `AAPL DES`). The `SettingsModule` (`apps/web/src/modules/SettingsModule.tsx`) edits it via a free-text input that accepts any string — including non-existent command ids, which silently break bare-symbol expansion. There is no concept of **pinned commands**: a solo operator who repeatedly runs `QM`, `N`, `FA` has no one-click launch surface and must retype each. This ticket adds a validated `defaultCommandId` picker plus a `pinnedCommandIds` preference, surfaced as a pin manager in `SettingsModule` and a quick-launch row in the `Header`, persisted through the existing `/api/preferences` path.

## User story
As a solo operator, I want to pin the handful of commands I use constantly and choose my default bare-symbol command from a validated list, so that I can launch my routine views in one click and never silently break symbol expansion with a typo.

## Technical design
Contracts-first; capability model untouched (this is a local-preferences feature, no provider data).
1. **Contract (changed).** In `packages/contracts/src/workspace.ts`, extend `UserPreferencesSchema` with `pinnedCommandIds: z.array(z.string()).default([])` (placed next to `defaultCommandId`). `z.infer` flows the new field into `UserPreferences` automatically. No other contract changes; `defaultCommandId` stays a string (validity is enforced at the UI against the live registry, not in the schema, to avoid coupling contracts to the kernel command set).
2. **Store default (web).** Add `pinnedCommandIds: []` to `DEFAULT_PREFERENCES` in `apps/web/src/state/preferencesStore.ts`. `patch`/`setPreferences` already spread arbitrary `Partial<UserPreferences>`, so no store API change.
3. **API persistence.** No route change needed: `POST /api/preferences` (`apps/api/src/routes/user.ts:19-29`) re-parses the whole body through `UserPreferencesSchema`, so the new field round-trips once the schema is extended. `FilePersistence` seeds prefs via `UserPreferencesSchema.parse(...)` (`apps/api/src/persistence/FilePersistence.ts:22`), so existing persisted state defaults `pinnedCommandIds` to `[]` on read (forward-compatible).
4. **Settings UI (web).** In `SettingsModule.tsx`:
   - Replace the free-text default-command `<input>` with a `<select>` populated from `commandRegistry.list()` (`apps/web/src/terminal/registry.ts` → kernel `CommandRegistry.list()`), filtered to global-launchable commands (exclude `requiresInstrument: false`-only system ids as appropriate; show `id — title`). Keep writing `defaultCommandId` via the existing `update()` helper (which calls `patch` + `api.savePreferences`).
   - Add a "Pinned commands" section: a multi-select chip list. Clicking a registry command toggles it in `pinnedCommandIds` (mirror the add/remove chip pattern already used in `WatchlistModule.tsx`). Persist via the same `update({ pinnedCommandIds })` path.
5. **Quick-launch (web).** In `apps/web/src/app/Header.tsx`, read `usePreferencesStore((s) => s.preferences.pinnedCommandIds)` and render a row of small buttons (one per pinned id, label = command id). Clicking calls `executeInput(id)` from `apps/web/src/terminal/execute.ts` (instrument-requiring commands resolve against the active instrument exactly as if typed). Unknown ids (e.g. a pin whose command was removed) are skipped gracefully.
6. **Hydration.** Unchanged — `App.tsx:29-31` already hydrates prefs from `api.getPreferences()` into the store; the new field arrives with it.

## Affected packages / apps
- `packages/contracts` — extend `UserPreferencesSchema` (`workspace.ts`) with `pinnedCommandIds`.
- `apps/web` — `state/preferencesStore.ts` (default), `modules/SettingsModule.tsx` (validated default-command select + pin manager), `app/Header.tsx` (quick-launch row). Reuses `commandRegistry.list()`, `executeInput`, the existing `update()`/`api.savePreferences` path.
- `apps/api` — none (schema-driven `/api/preferences` and `FilePersistence` already handle the field).

## Data contracts
Changed: `UserPreferencesSchema` in `packages/contracts/src/workspace.ts` gains `pinnedCommandIds: z.array(z.string()).default([])`. Additive and backward-compatible (defaults to `[]` for any previously persisted prefs). No new schema file; `defaultCommandId` unchanged.

## Provider capabilities
None. Preferences are local persistence (`localProvenance('preferences')`), not provider-backed. No `ProviderCapability` key is required; nothing differs between mock and BYO mode, and **mock mode works with no keys**.

## UI / module behavior
- `SettingsModule`: "Terminal" section now shows a validated default-command `<select>` and a "Pinned commands" chip toggler. Both write through the existing local-persistence path; the provider/capability sections are unchanged.
- `Header`: a quick-launch row of pinned-command buttons; clicking runs the command via `executeInput`. Empty `pinnedCommandIds` → the row renders nothing (no empty box). A pinned id no longer in the registry is silently omitted (never crash).
- No provider data is fetched here, so there is no capability-gap EmptyState in this surface; provenance for the saved prefs remains the local `preferences` provenance returned by the API. No fake "live" state.

## Testing plan
- Contract (`packages/contracts/src/*.test.ts` area): `UserPreferencesSchema.parse({})` yields `pinnedCommandIds: []`; round-trips an explicit array; rejects a non-array.
- API (`apps/api/src/app.test.ts`, extend "saves and reads preferences" at `:108`): POST prefs including `pinnedCommandIds`, GET returns them; omitted field defaults to `[]`.
- Unit — store (`apps/web/src/state/preferencesStore.test.ts`): `patch({ pinnedCommandIds })` merges and bumps `updatedAt`; default is `[]`.
- Unit — settings (`apps/web/src/modules/SettingsModule.test.tsx`, RTL + mocked `apiClient`): default-command select lists only registry ids and saves on change; toggling a pin updates `pinnedCommandIds` and calls `savePreferences`.
- Unit — header (`apps/web/src/app/Header.test.tsx`, RTL): renders one button per pinned id; clicking invokes `executeInput`; unknown pinned id is omitted; empty list renders no row.
- e2e (`apps/web` Playwright): open `SETTINGS`, change default command and pin `QM`; reload; assert the pin persists in the header and clicking it opens the Quote Monitor panel.

## Acceptance criteria
- [ ] `UserPreferencesSchema` has `pinnedCommandIds` (array, default `[]`); `defaultCommandId` unchanged.
- [ ] `SettingsModule` default-command control is a validated select sourced from `commandRegistry.list()` (no free-text typos).
- [ ] `SettingsModule` lets users pin/unpin commands; the set persists via `/api/preferences` and survives reload.
- [ ] `Header` renders a quick-launch row from `pinnedCommandIds`; clicking a pin runs it via `executeInput`; unknown ids are skipped; empty list renders nothing.
- [ ] Existing persisted prefs without the field load with `pinnedCommandIds: []` (no migration error).
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation assembled entirely from Tyche's own pieces: the existing `UserPreferencesSchema`, `usePreferencesStore`/`patch`, `commandRegistry.list()`, `executeInput`, the schema-driven `/api/preferences` route, and `FilePersistence`. A settings panel exposing a default command and a list of pinned/favorite commands is a standard category-parity feature; the behavior is benchmarked from public observation only (the dossier `workflow-teardown`/`command-taxonomy` notes), not copied. No Gödel Terminal UI, copy, code, color tokens, layout, command ids, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Theme color tokens (primary/positive/negative/background) and window-size persistence — separate M3 settings-v2 work, out of scope here.
- Keybinding-customization UI for the `keymap` preference — its own ticket (`tyche-gap-analysis.md:67`).
- Server-side validation of `defaultCommandId`/`pinnedCommandIds` against the kernel (validity enforced at the UI to keep contracts decoupled from the command set).
- Drag-to-reorder pins, pin groups, or per-pin custom labels — future ergonomics.
- Any provider data, capability, or order/advice behavior (foundation constraints).
