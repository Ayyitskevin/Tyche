# TKT-044 — Command bar v2: keyboard autocomplete for commands and symbols

**Priority:** P2 (revamp)  ·  **Milestone:** Revamp Cycle 2  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- Revamp-loop codebase review: suggestions were **prefix-only on command ids, click-only** (no
  keyboard selection — `CommandBar.tsx` handled Enter/history only), filled without executing, and
  never suggested symbols. For a keyboard-first terminal, needing the mouse to use autocomplete is a
  contradiction.

## Problem
Discoverability. A new user cannot find `OMON` by typing "options", and a power user cannot complete
`AAPL CHAR` → `AAPL GP` without leaving the keys.

## Technical design
- `apps/web/src/terminal/suggest.ts` (pure, unit-tested): `buildCommandSuggestions` ranks matches —
  id prefix → alias prefix → id subsequence ("fuzzy", ≥2 chars) → title substring (≥3 chars) — and
  preserves everything before the token being completed. `wantsSymbolSuggestions` decides when the
  first token merits an async symbol search (symbol-shaped, not an exact command — mnemonics win).
- `CommandBarContainer`: sync command suggestions + **debounced (150 ms) symbol suggestions via the
  provider-agnostic `/api/search`** (any enabled provider's universe, not a hardcoded list), stale
  responses cancelled; capped at 8 total.
- `CommandBar` (ui): full keyboard model — **↓/↑** moves the selection (wraps), **Tab** fills,
  **Enter** executes the completed line, **Esc** dismisses the popup (stopPropagation so the second
  Esc blurs via the app handler); history walking preserved when no popup is open. ARIA listbox /
  option / `aria-selected` semantics; symbol rows get a `sym` badge; `mousedown` runs a suggestion
  before the input blur can swallow the click.

## Acceptance criteria
- [x] `AAPL CHAR` + ↓ + Enter opens `AAPL GP`; `OMN` finds `OMON`; "movers" finds `MOST`.
- [x] Typing `msf` suggests `MSFT` from the search capability; Tab fills `MSFT `; Enter runs DES.
- [x] History walk, Esc-to-blur, and Tab panel-cycling behaviors preserved.
- [x] No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Command palettes/autocomplete are generic UI patterns; implementation is original.

## Non-goals (later)
- Argument-level completion (e.g. FRED series ids, screen fields); recency-weighted ranking;
  inline ghost-text completion.
