# TKT-045 — Named workspace layouts (LAYOUT)

**Priority:** P2 (revamp)  ·  **Milestone:** Revamp Cycle 3  ·  **Status:** in-progress  ·  **Clean-room risk:** None

## Source evidence
- Revamp-loop codebase review: the API stores N named workspaces (`routes/user.ts`), but the web app
  only ever auto-restores the most recent (`workspace/persistence.ts`). No switcher, no save-as, no
  way to keep a "research" and a "monitoring" layout side by side — a staple of professional
  multi-layout terminals (category-level benchmark).

## Problem
One implicit workspace. Power users maintain task-specific layouts and switch between them; Tyche
made them rebuild the grid by hand.

## Technical design
Pure web-layer change — the server routes already exist.
- `workspace/persistence.ts`: `switchWorkspace(ws)` (apply + remember as last-open) and
  `saveWorkspaceAs(name)` (fork the current panels under a fresh id/name, switch, persist).
- `LayoutManagerModule` (`LAYOUT`, aliases `WS`/`LAYOUTS`, no capability): lists every saved
  workspace sorted by recency (name, panel count, relative age), with **Open** (row click),
  **Save current**, **Save as…**, **New empty**, and **Delete** (confirm; the active layout is
  protected). JSON export/import stays in the header.
- Registered in the command registry → reachable entirely from the keyboard via autocomplete.

## Acceptance criteria
- [x] `LAYOUT` lists layouts; Save as… forks the current grid; New empty starts clean; row click
      switches the whole terminal; the active layout cannot be deleted.
- [x] Switching updates the last-open mirror so reload restores the chosen layout.
- [x] No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Multi-layout management is a generic terminal/IDE pattern; implementation is original.

## Non-goals (later)
- Per-layout keyboard chords (e.g. mod+1..9); layout thumbnails; shared/team layouts.
