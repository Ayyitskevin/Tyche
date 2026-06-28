# TKT-010 — Batch import symbols into a watchlist

**Priority:** P1  ·  **Milestone:** M3  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/workflow-teardown.md:28-34` — section "3. Batch import": the public pattern is to "paste/load a large symbol set into a watchlist at once instead of adding tickers one by one," and the Tyche translation is an original "paste-a-list importer (textarea / CSV) that validates symbols via `/api/search` and bulk-adds to a watchlist." Directly seeds this ticket.
- `docs/research/godel/competitive-feature-matrix.md:19` — "Batch import | QM batch import | ❌ | paste/CSV bulk add + validate | search | web | P1 | S | Low | textarea/CSV importer | M3" — the named gap, priority, milestone, and required capability.
- `docs/research/godel/competitive-feature-matrix.md:65-66` — "QM v2 / watchlist tabs / batch import (M3)" listed among the biggest credible-competitor gaps.
- `docs/research/godel/workflow-teardown.md:18-26` — section "2. Quote monitor": notes the upstream supports "batch-import up to 400 tickers," establishing the category benchmark (no UI/copy reproduced).
- Sources index: `docs/research/godel/sources.md` / `sources.csv` (category-benchmark T1 video/docs observation only).

## Problem
Today symbols can only be added to a watchlist one at a time: `WatchlistModule` (`apps/web/src/modules/WatchlistModule.tsx`) exposes a single text input + `+` button that calls `addSymbol()`, which uppercases one token and POSTs the whole list back via `api.saveWatchlist`. A solo operator migrating a portfolio or screen result (dozens to a few hundred tickers from a spreadsheet) has no way to paste a list, and nothing validates that pasted symbols actually resolve — a typo would silently persist a dead ticker that later renders no quote.

## User story
As a solo operator/analyst, I want to paste or upload a list of symbols (newline/comma/CSV) and have each one validated before it is added to my active watchlist, so that I can populate a watchlist in one step and trust that every symbol resolves to a real instrument.

## Technical design
Contracts-first; capability model preserved; reuse existing watchlist persistence and search.
1. **Importer UI (original).** Add a small `BatchImportPanel` affordance to `WatchlistModule.tsx` (e.g. a "import" toggle next to the existing `+` control) that reveals a `<textarea>` plus a hidden `<input type="file" accept=".csv,.txt">`. Both feed a single raw-text buffer.
2. **Parse + normalize.** Add a pure helper `parseSymbolList(raw: string): string[]` in a new `apps/web/src/modules/batchImport.ts`: split on newlines/commas/whitespace, trim, uppercase, strip surrounding quotes, drop empties, and de-dupe (preserving first-seen order). For CSV, take the first non-empty cell of each row (header row tolerated by validation, not by parsing). Cap input length defensively (e.g. 1000 tokens) to protect the validation pass.
3. **Validate via `/api/search`.** For each candidate, call `api.search(sym)` (`apps/web/src/providers/apiClient.ts` → `GET /api/search`, `routes/market.ts`, returns `SearchResult[]`). A candidate is valid if a returned `SearchResult.identifier.symbol` exactly matches (case-insensitive). Run with bounded concurrency (small pool, e.g. 6) and surface a per-symbol status: `valid` / `unknown` / `duplicate` (already in `watchlist.symbols`). No new endpoint needed.
4. **Bulk add.** Compute `next = unique([...symbols, ...validNewSymbols])` and POST once via the existing `api.saveWatchlist({ ...watchlist, symbols: next })`, then `watchlists.reload()`. Reuses the current single-write path — no new write endpoint, no contract change.
5. **No new capability surface.** Validation rides `/api/search` (already provider-backed via `lookupProvider`); quotes for the resulting rows ride the existing `quotes`/`batchQuotes` path the module already uses.

## Affected packages / apps
- `apps/web` — `modules/WatchlistModule.tsx` (importer toggle + wiring), new `modules/batchImport.ts` (`parseSymbolList`, `validateSymbols`). Reuses `providers/apiClient.ts` (`api.search`, `api.saveWatchlist`), `providers/useApiData.ts`, `modules/common.tsx` (`ModuleBody`), `@tyche/ui` states.
- `apps/api` — none. `GET /api/search` and `POST /api/watchlists` already exist (`routes/market.ts`, `routes/user.ts`).
- `packages/contracts` — none (see Data contracts).

## Data contracts
None changed. `Watchlist` (`packages/contracts/src/portfolio.ts`) already carries `symbols: string[]`; `SearchResult` / `InstrumentIdentifier` (`packages/contracts/src/instruments.ts`) already expose `identifier.symbol`. The per-symbol import status (`valid`/`unknown`/`duplicate`) is transient UI state and is not persisted, so no Zod type is added.

## Provider capabilities
Requires `quotes` (the `W` command's declared capability — `requiredCapabilities: ['quotes']` in `packages/terminal-kernel/src/commands.ts`). Symbol validation uses `/api/search`, which is provider-backed (`lookupProvider`) and satisfied by the deterministic `MockProvider` (returns search results), so mock mode works with no keys. BYO providers that implement `searchInstruments` validate against their own universe unchanged.

## UI / module behavior
- Watchlist panel gains an "import" toggle; opening it shows a textarea + file picker. Pasting/uploading runs parse → validate, then renders a compact result summary (e.g. "12 added · 2 already in list · 1 unknown"), with unknowns listed so the user can fix them. Original layout/copy.
- Empty textarea / no valid symbols → inline `EmptyState`-style message, no write performed.
- `/api/search` failure for a batch → `ErrorState` with retry for the import action; the existing watchlist table is unaffected.
- Capability gap (no `quotes` provider) → the panel's existing `ModuleBody` capability `EmptyState` already covers the quote table; importer disabled with a graceful note.
- Provenance: the watchlist itself is local (`localProvenance('watchlists')`); validation results carry no market-data provenance, so no `ProvenanceBadge` claim is made on the import summary (honest — it is a name-resolution check, not a priced quote).

## Testing plan
- Unit (`apps/web/src/modules/batchImport.test.ts`): `parseSymbolList` (newline/comma/whitespace/CSV split, trim, uppercase, quote-strip, de-dupe, order preservation, cap); `validateSymbols` classifies valid/unknown/duplicate against a mocked `api.search` with bounded concurrency.
- Component (`apps/web/src/modules/WatchlistModule.test.tsx`, RTL): paste → valid symbols appear in table; duplicates and unknowns reported and not added; a single `saveWatchlist` POST fires with the merged unique set; importer hidden/disabled on capability gap.
- API/contract: none new — relies on existing `/api/search` and `/api/watchlists` coverage in `apps/api/src/app.test.ts`.
- e2e (`apps/web` Playwright): open `W`, open import, paste a multi-line list, assert rows appear for valid symbols and an unknown is rejected; panel never crashes on a large paste.

## Acceptance criteria
- [ ] Watchlist panel exposes an original paste/CSV importer (textarea + file upload) alongside the existing single-add control.
- [ ] `parseSymbolList` splits newline/comma/whitespace/CSV input, trims, uppercases, de-dupes (order-preserving), and is unit-tested.
- [ ] Each candidate is validated via `/api/search`; only symbols whose `SearchResult.identifier.symbol` matches are added; duplicates and unknowns are reported, not silently added.
- [ ] Valid new symbols are merged and persisted in a single `api.saveWatchlist` POST; no new endpoint or Zod contract is introduced.
- [ ] Mock mode works with no keys; empty/error/capability-gap states render gracefully via existing `ModuleBody`/`@tyche/ui` states — never a crash.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`portfolio.ts`, `instruments.ts`), endpoints (`/api/search`, `/api/watchlists`), client (`apiClient.ts`), and the existing `WatchlistModule`. A paste/CSV bulk-import-with-validation flow is a standard category feature; the design (parse helper → `/api/search` resolution → single merged persist) is derived from Tyche's existing primitives, not from any competitor implementation. No Gödel Terminal UI, copy, code, layout, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Watchlist tabs / multiple named lists (separate M3 ticket — `tabbed watchlists`).
- A higher hard symbol ceiling, latency column, or column config (see `quote-monitor-v2`, TKT-008).
- Persisting per-symbol import metadata, sectors, or paste history.
- Server-side bulk-validate or new provider capabilities; pricing or quote fetch during import beyond what the table already does.
- Order placement, portfolio import with quantities/cost basis, alerts, or advice — out of scope by foundation constraint.
