# TKT-041 — Keyboard-shortcut customization

**Priority:** P3  ·  **Milestone:** M17  ·  **Status:** in-progress  ·  **Clean-room risk:** None

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md` P3 list: *"keyboard-shortcut customization UI."* Part of
  the self-host / operator-owned polish (M17 PR B; PR A was the durable audit sink).

## Problem
The global shortcuts (focus command bar, save workspace, reopen panel) were hard-coded in `App.tsx`. A
keyboard-first terminal should let the operator rebind them to their own muscle memory.

## Technical design
Pure web-layer change; reuses the existing (previously unused) `UserPreferences.keymap` field — **no
new contract, route, or persistence**.
- `apps/web/src/terminal/keybindings.ts` (pure, unit-tested): `KEY_ACTIONS` (the rebindable set +
  defaults), `comboFromEvent` (normalized `mod+shift+key` string; `mod` collapses ⌘/Ctrl; returns null
  for modifier-only), `formatCombo` (readable label), `resolveBindings` (defaults overridden by the
  keymap → `byAction`/`byCombo`), and `conflictingCombos`.
- `App.tsx` resolves bindings **live** from preferences on each keydown (changes apply immediately, no
  listener re-register) and dispatches the matched action. Tab panel-cycling and Esc stay fixed.
- `SETTINGS` gains a "Keyboard shortcuts" section: each action shows its current chord with **Rebind**
  (captures the next keypress in the capture phase so it wins over the global handler) and **Reset**
  (drops the override). Conflicts are flagged. Overrides persist via `keymap` (actionId → combo).

## Acceptance criteria
- [x] The three global chords can be rebound from SETTINGS and persist across reload.
- [x] A rebound shortcut takes effect immediately; Reset restores the default; conflicts are flagged.
- [x] Tab/Esc remain fixed. No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Original implementation. No third-party artifact involved.

## Non-goals (later)
- Rebinding contextual keys (Tab/Esc/history); per-command chords; multi-key sequences; import/export of
  a keymap; guarding against shadowing browser-reserved chords (e.g. ⌘W).
