# TKT-022 — Keyboard shortcut category parity (configurable)

**Priority:** P2  ·  **Milestone:** M3  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/workflow-teardown.md` §11 "Keyboard & window management" — public pattern: command bar via backtick, Tab cycles panels, movable/resizable panels; names `keyboard-shortcut-parity` as the follow-up ticket.
- `docs/research/godel/tyche-gap-analysis.md` and `docs/research/godel/competitive-feature-matrix.md` — shortcut/keyboard-navigation row (category benchmark only, no keybinding values copied).
- Sources `T4` (godelguide/docs) per `docs/research/godel/sources.md` — used only to establish *which categories* of shortcuts exist, not their exact chords.

## Problem
`packages/terminal-kernel/src/shortcuts.ts` defines a `DEFAULT_SHORTCUTS` map and a `ShortcutRegistry`, but `apps/web/src/app/App.tsx` (lines 40-60) hardcodes only four chords (`mod+k`, `mod+s`, `mod+shift+z`, `esc`) inline and ignores the registry entirely. The `focus-next`/`focus-prev` actions already declared in the kernel are never wired, and the `keymap` field on `UserPreferences` (`packages/contracts/src/workspace.ts:65`) is persisted but never read. Result: incomplete shortcut category coverage and no way for a user to rebind keys.

## User story
As a solo operator, I want a complete, configurable set of keyboard shortcuts (focus the command bar, save, reopen last-closed panel, cycle panels, focus next/prev) so that I can drive the whole terminal from the keyboard and remap chords to my own muscle memory.

## Technical design
1. Expand `DEFAULT_SHORTCUTS` in `packages/terminal-kernel/src/shortcuts.ts` so every category resolves to an `action`: `focus-command-bar`, `save-workspace`, `undo-close`, `cycle-panels` (forward), `focus-next`, `focus-prev`, `escape`, plus `HELP` via `commandId`. Use Tyche-original chords (already present: `mod+k`, `mod+s`, `mod+shift+z`, `alt+arrowright`, `alt+arrowleft`, `esc`); add `cycle-panels` on a Tyche-chosen chord (e.g. `mod+e`). Keep `eventToChord`/`KeyEventLike` as the single normalizer.
2. Add an `effectiveShortcuts(defaults, keymap)` helper in `shortcuts.ts` that overlays the `keymap` record (`keys -> commandId|action`) from `UserPreferences` onto `DEFAULT_SHORTCUTS`, returning a merged `KeyboardShortcut[]`. Pure, unit-testable, no React.
3. In `apps/web/src/app/App.tsx`, replace the inline `onKeyDown` branch list with a `ShortcutRegistry` built from `effectiveShortcuts(DEFAULT_SHORTCUTS, preferences.keymap)` (read from `preferencesStore`). On match, `event.preventDefault()` and dispatch by `action`/`commandId` to existing handlers: `focus-command-bar` -> `commandInputRef.focus()`, `save-workspace` -> `saveCurrentWorkspace()`, `undo-close` -> `useWorkspaceStore.getState().undoClose()`, `escape` -> blur.
4. Wire panel-navigation actions to `workspaceStore`: add `focusNextPanel()`/`focusPrevPanel()` actions (deriving from `panels` order + `activePanelId`, calling existing `setActivePanel`). `cycle-panels` reuses `focusNextPanel`. No new dependency — purely store-internal.
5. Surface rebinding in the SETTINGS module (`apps/web/src/modules/SettingsModule` / `commandId: SETTINGS`): a list of shortcut rows with editable chord capture that writes through `preferencesStore.patch({ keymap })`. Persisted via existing preferences persistence; `keymap` already validated by `UserPreferencesSchema`.

## Affected packages / apps
- `packages/terminal-kernel` (`shortcuts.ts`).
- `apps/web` (`app/App.tsx`, `state/workspaceStore.ts`, `state/preferencesStore.ts`, SETTINGS module, `help.ts`-driven shortcut listing if shown).
- `packages/contracts` — no schema change required (`keymap` already exists).

## Data contracts
None new. Reuse `KeyboardShortcut` / `KeyboardShortcutSchema` (`packages/contracts/src/module.ts:8`) and the existing `keymap: z.record(z.string())` on `UserPreferencesSchema` (`packages/contracts/src/workspace.ts:65`). No envelope/provenance changes — shortcuts are client-only state.

## Provider capabilities
None. This feature is provider-agnostic and fully functional in mock mode with no keys; it touches no `DataProvider` capability key.

## UI / module behavior
Shortcuts operate on existing panels/overlays only. Panel-focus actions are no-ops when `panels` is empty (no crash, no toast). The SETTINGS shortcut editor renders the current effective map; a conflicting chord shows an inline validation hint and is not saved. No provenance badge applies (no remote data). No `EmptyState`/`ErrorState` capability-gap path is reachable since there is no provider dependency.

## Testing plan
- Unit (`packages/terminal-kernel`): extend the shortcuts test to cover the expanded `DEFAULT_SHORTCUTS`, `eventToChord` normalization, `ShortcutRegistry.match`, and `effectiveShortcuts` keymap overlay (override + add + passthrough).
- Unit (`apps/web` store): `focusNextPanel`/`focusPrevPanel` wrap-around and empty-panel no-op against `workspaceStore`.
- E2E (`apps/web` Playwright, `pnpm test:e2e`): focus command bar via chord, save workspace, close then reopen a panel, and cycle focus across two panels.
- Keep `pnpm typecheck`, `pnpm test`, `pnpm build` green.

## Acceptance criteria
- [ ] `DEFAULT_SHORTCUTS` covers all six categories (focus bar, save, undo-close, cycle panels, focus next, focus prev) plus help/escape, each with a resolvable `action` or `commandId`.
- [ ] `effectiveShortcuts(defaults, keymap)` overlays `UserPreferences.keymap` and is unit-tested.
- [ ] `apps/web` dispatches shortcuts through `ShortcutRegistry` (no inline chord `if`-ladder remains in `App.tsx`).
- [ ] Panel focus next/prev/cycle work and no-op safely with zero panels.
- [ ] SETTINGS exposes editable keybindings persisted via `preferencesStore.patch`.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` pass.

## Clean-room notes
Original implementation. Only the *categories* of shortcuts (focus bar / save / cycle / focus-move) are benchmarked from public docs; the actual chords are Tyche-chosen (the inverse of any specific Gödel binding is irrelevant — they were defined independently). No Gödel UI, copy, layout, or keybinding table is reproduced. The `workflow-teardown.md` dossier is itself an original abstraction.

## Non-goals
- No window linking by color / active-ticker propagation (tracked under window-manager-improvements).
- No vim-style multi-key leader sequences beyond simple chords.
- No global OS-level hotkeys outside the app window.
- No order placement, brokerage, or advice surface touched.
