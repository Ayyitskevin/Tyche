# TKT-023 — Link-group active-ticker propagation + focus cycling

**Priority:** P2  ·  **Milestone:** M3  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/workflow-teardown.md` §11 "Keyboard & window management" — public pattern: command bar via backtick, up to 6 movable/resizable panels, **Tab cycles panels**, and **window linking by color** syncs the active ticker across linked windows; names `window-manager-improvements` as the follow-up ticket.
- `docs/research/godel/workflow-teardown.md` §1 "Single-name analyst deep-dive" — establishes the multi-panel single-name workflow (DES/GP/CF/FA/N on one ticker) that link-group propagation accelerates.
- `docs/research/godel/competitive-feature-matrix.md` / `docs/research/godel/tyche-gap-analysis.md` — window-management / linking row (category benchmark only; no UI, layout, or color values copied).
- Sources `T4` (godelguide/docs) per `docs/research/godel/sources.md` — used only to confirm *that* color linking + Tab cycling exist as categories, not their exact behavior or chrome.

## Problem
Tyche already has link groups as a visual affordance: `cyclePanelLink` in `apps/web/src/state/workspaceStore.ts:143` rotates a panel through `LINK_COLORS` (`apps/web/src/constants.ts:21`) and `PanelHost.tsx:39` passes `linkColor` to `PanelFrame`. But the link color is cosmetic — changing the active instrument in one panel does **not** propagate to other panels in the same group. There is also no keyboard focus cycling: `App.tsx:42-57` hardcodes four chords and never advances `activePanelId` across panels (deferred from `TKT-022`). Result: a solo operator must retype/re-issue the ticker in every panel of a deep-dive layout.

## User story
As a solo operator running a single-name deep-dive across several linked panels, I want changing the active ticker in one linked panel to update every panel sharing its link color, and I want to Tab-cycle focus between panels, so that I can drive a multi-panel layout from one place without re-issuing commands.

## Technical design
1. Add a per-panel symbol broadcast to `apps/web/src/state/workspaceStore.ts`: new action `setLinkedSymbol(sourcePanelId: string, symbol: string)` that finds the source panel's `linkGroup`; if non-null, it maps over `panels` and sets `symbol` (and `state.args = [symbol]`) on every panel whose `linkGroup` matches — never touching unlinked panels. If `linkGroup` is null, it updates only the source panel. Pure store update; reuses existing `Panel` shape (no contract change).
2. Wire propagation in `apps/web/src/workspace/PanelHost.tsx`: when a module reports a new active symbol (extend `ModulePanelProps` callback usage — pass a `setSymbol(symbol)` prop alongside the existing `setState`), `PanelHost` calls `setLinkedSymbol(panel.id, symbol)`. Keep `terminalStore.setActiveInstrument` as the global pointer (set from the focused/source panel only), so the StatusBar (`apps/web/src/app/StatusBar.tsx`) still reflects the operative ticker.
3. Add focus-cycling actions to `workspaceStore`: `focusNextPanel()` / `focusPrevPanel()` derive from `panels` array order + current `activePanelId`, wrap around, skip nothing, and call the existing `setActivePanel`. No-op safely when `panels` is empty.
4. Bind Tab / Shift+Tab in `apps/web/src/app/App.tsx` global `onKeyDown`: when focus is not inside the command bar / a text input, `event.preventDefault()` and call `focusNextPanel` / `focusPrevPanel`. Guard against hijacking Tab inside form fields (check `event.target` tag). Chord choice is Tyche-original and coordinated with `TKT-022`'s `ShortcutRegistry` if landed first.
5. No persistence change required: propagated `symbol` already serializes via `PanelSchema` (`packages/contracts/src/workspace.ts:16`) through `toWorkspace`/`loadWorkspace`.

## Affected packages / apps
- `apps/web` — `state/workspaceStore.ts` (new actions), `workspace/PanelHost.tsx` (broadcast wiring + `setSymbol` prop), `app/App.tsx` (Tab bindings).
- `packages/module-sdk` — `PanelState.ts` (`ModulePanelProps`): add optional `setSymbol?: (symbol: string) => void`.
- `packages/contracts` — none (no schema change; `Panel.symbol`/`linkGroup` already exist).

## Data contracts
None new or changed. `PanelSchema.symbol` (nullable string) and `PanelSchema.linkGroup` (nullable string) in `packages/contracts/src/workspace.ts` already carry everything needed. No envelope/provenance schema is touched — link propagation is client-only workspace state.

## Provider capabilities
None. Feature is provider-agnostic and fully functional in mock mode with no keys. It dispatches no `DataProvider` call itself; downstream modules re-fetch through their existing capability-gated hooks (e.g. `useApiData`) when their `symbol` changes.

## UI / module behavior
Changing the active ticker in a linked panel recolors no chrome but updates the `symbol` on all same-color panels; each re-renders through its own module path. Modules already render graceful `EmptyState`/`ErrorState` for missing data or capability gaps — a propagated symbol with no data shows that panel's existing `EmptyState`, never a crash. Provenance/freshness badges remain per-panel (each panel reports its own `DataProvenance` via `reportProvenance`). Unlinked panels are unaffected. Tab focus cycling moves the `active` highlight (`PanelFrame active`) with zero panels = no-op.

## Testing plan
- Unit (`apps/web` store, extend `apps/web/src/state/workspaceStore.test.ts`): `setLinkedSymbol` updates all same-`linkGroup` panels, leaves unlinked/other-color panels untouched, and updates only the source when `linkGroup` is null; `focusNextPanel`/`focusPrevPanel` wrap-around and empty-panel no-op.
- Contract: none required (no schema change); a round-trip `toWorkspace`/`loadWorkspace` assertion that a propagated `symbol` persists.
- E2E (`apps/web` Playwright, `pnpm test:e2e`): open two panels, link them the same color, change the ticker in one, assert the other follows; Tab cycles focus across panels.
- Keep `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` green.

## Acceptance criteria
- [ ] `setLinkedSymbol` propagates `symbol` (and `state.args`) to all panels sharing the source's `linkGroup`, and only the source when unlinked.
- [ ] Unlinked panels and panels of a different link color are never mutated by propagation.
- [ ] `focusNextPanel`/`focusPrevPanel` cycle `activePanelId` with wrap-around and no-op with zero panels.
- [ ] Tab / Shift+Tab cycle panel focus and do not fire while typing in the command bar / a text input.
- [ ] `PanelHost` passes `setSymbol` and StatusBar still reflects the operative ticker.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` pass.

## Clean-room notes
Original implementation. Only the *categories* (color link-groups, active-ticker sync, Tab focus cycling) are benchmarked from the public `workflow-teardown.md` abstraction; the link palette (`LINK_COLORS`), propagation semantics, store shape, and chords are Tyche-chosen and pre-exist independently. No Gödel UI, copy, layout, color values, or keybinding table is reproduced. The dossier is itself an original abstraction reconstructed from public materials.

## Non-goals
- No configurable keybinding editor / keymap overlay (tracked under `TKT-022` keyboard-shortcut-parity).
- No pop-out / multi-window OS panels; cycling and linking are within the single workspace grid.
- No cross-workspace or cross-tab propagation.
- No new provider capability, data fetch path, order placement, brokerage, or advice surface.
