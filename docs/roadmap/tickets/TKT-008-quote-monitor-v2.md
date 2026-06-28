# TKT-008 — Quote monitor v2 (columns, latency, scale)

**Priority:** P1  ·  **Milestone:** M3  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/competitive-feature-matrix.md:17` — "Quote monitor | QM (≤400, latency) | ✅ streaming | tabs, batch, **latency col, scale** | quotes/batch | SSE | P0 | M | Low | virtualized + SSE (done), **extend**" — the named gap for this ticket.
- `docs/research/godel/competitive-feature-matrix.md:66` — "QM v2 / watchlist tabs / batch import (M3)" listed among the biggest credible-competitor gaps.
- `docs/research/godel/competitive-feature-matrix.md:50` — "Source provenance … ✅ (Tyche-ahead) … provenance on every panel" — basis for surfacing the latency/age column *from provenance* rather than copying a competitor metric.
- Sources index: `docs/research/godel/sources.md` / `sources.csv` (all category-benchmark, T1 video/docs observation; no Gödel UI/copy reproduced).

## Problem
`QuoteMonitorModule` (`apps/web/src/modules/QuoteMonitorModule.tsx`) renders a fixed 5-column virtualized `DataTable` (`Symbol/Last/Chg/%/Vol` from `quoteColumns` in `quotesCommon.tsx`) with no sorting, no column selection, and no visibility into how fresh each quote is. A solo operator monitoring a large symbol set cannot reorder by movers, hide noise, surface bid/ask/day range, or tell at a glance whether a row is live vs. delayed/stale — even though the data (`Quote.bid/ask/dayHigh/dayLow/open/prevClose/timestamp`) and the provenance freshness (`DataFreshness.ageMs/asOf/delaySeconds/tier/stale`) are already available.

## User story
As a solo operator/analyst, I want to choose and sort the columns in the quote monitor and see a latency/age indicator per quote so that I can scan a large watchlist for movers and trust how fresh each price is — without the panel ever stuttering or crashing.

## Technical design
Contracts-first; capability model preserved; virtualization and SSE reuse intact.
1. **Latency/age column (from provenance + quote).** Add an `age`/`latency` column to `quotesCommon.tsx`. Derive freshness per row from the panel's `DataProvenance` (`initial.provenance.freshness`: `ageMs`, `asOf`, `delaySeconds`, `tier`, `stale`) reported via `useReportProvenance`, falling back to `now - Date.parse(quote.timestamp)` for streamed rows updated by `useQuoteStream`. Format with `@tyche/ui` helpers (relative age + a stale/delayed tone class); `mock` tier renders a neutral label. No network change — the SSE frame already carries `Quote.timestamp`.
2. **Configurable columns.** Define a `QUOTE_COLUMN_CATALOG` in `quotesCommon.tsx` keyed by column id (extend beyond the current `symbol/price/change/pct/vol` to include `bid/ask/dayHigh/dayLow/open/prevClose/age`), each an entry of `{ id, column: Column<Quote>, sortValue?: (q) => number|string }`. A selector builds the active `Array<Column<Quote>>` from an ordered id list; unknown ids are ignored (forward-compatible).
3. **Sort.** Add a small `useQuoteSort` helper that sorts the merged `rows` by `{ columnId, dir }` using each column's `sortValue` (numeric for price/change/vol/age, lexical for symbol), stable, with symbol order as the tiebreak. Clicking a `DataTable` header toggles asc/desc/none. Sorting happens in the module over the already-merged array (no `DataTable` API change required; header click is wired through the module via an optional `onHeaderClick`/column metadata — keep `DataTable` generic and additive).
4. **Persist per-panel.** Store `{ columns: string[], sort: { columnId, dir } | null }` in the panel's persisted `state` via the existing `ModulePanelProps.state` / `setState` (host writes to `panel.state`, a `z.record(z.unknown())` per `PanelSchema` in `packages/contracts/src/workspace.ts`) — **no contract change**. Default to the current 5 columns + `age` when `state` is empty.
5. **Scale.** Keep the `DataTable` `height`-driven virtualization (already only renders the visible slice). Sorting/column derivation must be `useMemo`-gated on `rows`/config so a 400-symbol set re-sorts without re-fetching; `useQuoteStream` continues to update the symbol→quote map in place.

## Affected packages / apps
- `apps/web` — `modules/QuoteMonitorModule.tsx` (wire config + sort + persisted state), `modules/quotesCommon.tsx` (column catalog, age column, sort helper). Reuses `providers/useQuoteStream.ts`, `providers/useElementSize.ts`, `modules/common.tsx` (`ModuleBody`, `useReportProvenance`).
- `packages/ui` — `DataTable.tsx`: optional additive header-click affordance + per-column `sortable`/active-sort indicator (backward-compatible defaults; no behavior change for existing callers). `format.ts` may gain a relative-age formatter if one is not already present.
- No `apps/api` changes — `GET /api/quotes` (`routes/market.ts`, capability `batchQuotes`) and `GET /api/stream/quotes` (`stream/hub.ts`, capability `quotes`) already return the needed fields + provenance.

## Data contracts
None. `Quote`/`QuoteBatch` (`packages/contracts/src/market.ts`) already expose `bid/ask/bidSize/askSize/open/dayHigh/dayLow/prevClose/change/changePercent/volume/timestamp`; `DataFreshness` (`packages/contracts/src/provenance.ts`) already exposes `ageMs/asOf/delaySeconds/tier/stale`. Column/sort config persists in the untyped `Panel.state` bag (`workspace.ts`), so no Zod change is required. If a typed shape is ever wanted, add it additively under a `quoteMonitor` key — out of scope here.

## Provider capabilities
Requires `quotes` (SSE stream) and `batchQuotes` (initial snapshot). Both are satisfied by the deterministic `MockProvider` (already returns quotes), so mock mode works with no keys. When neither is available, `missingCapabilities`/`unavailable` drive a graceful `EmptyState` via `ModuleBody` — never a crash. BYO providers that declare `quotes`/`batchQuotes` work unchanged.

## UI / module behavior
- Panel renders the virtualized `DataTable` with the active, sorted, configurable columns; row click still runs `${symbol} DES`.
- Header click cycles sort asc → desc → none on sortable columns, with an active-sort indicator.
- Age/latency column shows relative age with a tone for `stale`/`delayed`; `mock` tier shows a neutral label (no fake "live").
- Empty symbol set → `EmptyState` ("No symbols to monitor."); capability gap → capability `EmptyState`; loader error → `ErrorState` with retry. All via the existing `ModuleBody` ladder.
- `ProvenanceBadge`/`FreshnessBadge` in the panel frame continue to reflect provenance lifted by `useReportProvenance`.

## Testing plan
- Unit (`apps/web/src/modules/quotesCommon.test.ts`): `QUOTE_COLUMN_CATALOG` selection (ordered ids → columns, unknown ids dropped), `mergeQuotes` unchanged, sort helper (numeric vs lexical, asc/desc/none, stable, symbol tiebreak), age formatter (`ageMs` vs `timestamp` fallback, stale/delayed tone, `mock` neutral).
- Component (`apps/web/src/modules/QuoteMonitorModule.test.tsx`, RTL): default columns include `age`; header click toggles sort and reorders rows; column config + sort round-trips through `state`/`setState`; capability-gap and empty states render via `ModuleBody`.
- UI (`packages/ui/src/DataTable.test.tsx`): existing callers unaffected (no header click ⇒ identical render); header click fires `onHeaderClick` only for sortable columns; large-row virtualization still renders only the visible slice.
- e2e (`apps/web` Playwright): `QM` (and `AAPL MSFT NVDA QM`) opens the monitor against mock; assert rows render, an age column is present, a header click reorders, and the panel survives a large symbol list.

## Acceptance criteria
- [ ] Quote monitor shows a per-row latency/age column derived from `DataProvenance.freshness` (with `Quote.timestamp` fallback); `mock` tier renders neutral, never a false "live".
- [ ] Columns are configurable from a catalog (`symbol/price/change/pct/vol/bid/ask/dayHigh/dayLow/open/prevClose/age`); selection + order persist in `Panel.state` via `setState` with no contract change.
- [ ] Header click sorts asc/desc/none (stable, symbol tiebreak) over the merged rows; sort persists per panel.
- [ ] Virtualization preserved: a 400-symbol set scrolls and re-sorts without re-fetching or jank; `useQuoteStream` updates in place.
- [ ] Reuses `useQuoteStream` + `DataTable`; `DataTable` changes are additive and backward-compatible for all existing callers.
- [ ] Capability gap / empty / error states render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`market.ts`, `provenance.ts`, `workspace.ts`), components (`DataTable`, `EmptyState`/`ErrorState`, `ProvenanceBadge`/`FreshnessBadge`), hooks (`useQuoteStream`, `useApiData`, `useElementSize`), and the existing `QuoteMonitorModule`/`quotesCommon`. A sortable, column-configurable, latency-aware quote board is a standard category feature; the latency/age column is grounded in Tyche's provenance model (a Tyche-ahead differentiator), not a competitor metric. No Gödel Terminal UI, copy, code, column set, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Watchlist tabs / multiple named lists, batch/CSV import (separate M3 tickets — `tabbed watchlists`, `batch import`).
- Column resizing/drag-reorder by mouse or a settings dialog UI (config via state/command args only here).
- New provider capabilities, real-time paid feeds, or per-venue/composite quotes (see `All quotes`/`ALLQ`, M6).
- Any change to `Quote`/`QuoteBatch`/provenance Zod contracts or to the SSE/REST payload shape.
- Order placement, alerts, or advice — out of scope by foundation constraint.
