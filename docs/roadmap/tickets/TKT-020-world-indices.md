# TKT-020 — World indices board (WEI)

**Priority:** P2  ·  **Milestone:** M8  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/command-taxonomy.md:49` — "**WEI** | market-data | | World indices: Americas/EMEA/Asia-Pacific, change/%/YTD, ranked | confirmed / med" — the regioned change/%/YTD board this ticket implements.
- `docs/research/godel/command-taxonomy.md:26` — WEI listed under "Market data / quotes" category (capability anchor = `quotes`).
- `docs/research/godel/command-taxonomy.md:77` — "Streaming: QM, FOCUS, **WEI**, TAS, OMON, N are real-time" — supports optional SSE refresh via the existing `quotes` stream.
- `docs/research/godel/command-taxonomy.md:86` — Tyche already category-matches `WEI`; this ticket promotes the existing beta scaffold to a real module.
- Sources index: `docs/research/godel/sources.md` / `sources.csv` (category-benchmark, T1 video/docs observation only; no Gödel UI/copy reproduced).

## Problem
The `WEI` command exists in `DEFAULT_COMMANDS` (`packages/terminal-kernel/src/commands.ts`, id `WEI`, aliases `INDICES`/`WORLD`, `moduleId: 'world-indices'`, `requiredCapabilities: ['quotes']`, `maturity: 'beta'`) but has no real component — `world-indices` is absent from `moduleComponents` (`apps/web/src/modules/components.ts`), so it renders `BetaPlaceholder`. A solo operator who types `WEI` gets a stub, not a regioned market overview. The pieces exist (`WORLD_INDEX_SYMBOLS` in `apps/web/src/constants.ts`, `api.getQuotes`, the deterministic `MockProvider`), but nothing groups index-ETF proxies by region or shows change/%/YTD.

## User story
As a solo operator/analyst, I want a regioned board of major world index proxies showing each one's change, % change, and year-to-date move so that I can read the global market tape at a glance when I open my workspace, without wiring it up myself.

## Technical design
Contracts-first; capability model preserved; reuses the quotes pipeline.
1. **Region universe.** Replace the flat `WORLD_INDEX_SYMBOLS` in `apps/web/src/constants.ts` with a `WORLD_INDEX_REGIONS` map keyed `Americas` / `EMEA` / `APAC`, each `Array<{ symbol, label }>` of liquid index-ETF proxies (e.g. Americas: `SPY`,`QQQ`,`DIA`,`IWM`,`EWZ`; EMEA: `VGK`,`EWU`,`EWG`,`EZU`; APAC: `EWJ`,`MCHI`,`EWY`,`EWA`). All are synthesizable by `MockProvider` (seed has `SPY`/`QQQ`; the rest hit `synthesize()` deterministically), so mock mode works with zero keys. Keep a derived flat `WORLD_INDEX_SYMBOLS` for the batch fetch.
2. **YTD source.** `Quote` (`packages/contracts/src/market.ts`) exposes `change`/`changePercent`/`prevClose`/`open` but **no YTD**. Add one optional field `ytdPercent?: number` to the `Quote` Zod schema (additive, backward-compatible) and populate it in `MockProvider.getQuotes`/`getQuote` from a deterministic seeded value; absent/older providers simply omit it and the column renders "—".
3. **Module.** Add `apps/web/src/modules/WorldIndicesModule.tsx` and register `'world-indices': WorldIndicesModule` in `apps/web/src/modules/components.ts` (this alone replaces `BetaPlaceholder`). Fetch via `useApiData(() => api.getQuotes(WORLD_INDEX_SYMBOLS))`, report provenance with `useReportProvenance`, and optionally merge a live overlay via `useQuoteStream(WORLD_INDEX_SYMBOLS)` (mirroring `QuoteMonitorModule.tsx`). Group rows by region; within each region rank descending by `changePercent`.
4. **Columns.** Reuse the `quotesCommon.tsx` pattern: render one virtualized `DataTable` per region section (or a single table with region header rows) with columns `Index / Last / Chg / % / YTD`. Row click runs `executeInput(`${symbol} DES`)`. Format with `@tyche/ui` `format.ts` (signed pct, tone class for +/-).
5. **No new route.** `GET /api/quotes` (`apps/api/src/routes/market.ts`, capability `batchQuotes`) and the SSE `quotes` stream already serve everything; the new optional field flows through the existing `Envelope` unchanged.

## Affected packages / apps
- `packages/contracts` — `market.ts`: add optional `ytdPercent` to `Quote`.
- `packages/data-adapters` — `MockProvider.ts`: populate `ytdPercent` deterministically in `getQuote`/`getQuotes`.
- `apps/web` — new `modules/WorldIndicesModule.tsx`; register in `modules/components.ts`; `constants.ts` region map. Reuses `providers/{apiClient,useApiData,useQuoteStream,useElementSize}.ts`, `modules/{common.tsx,quotesCommon.tsx}`, `terminal/execute.ts`.
- No change to `packages/terminal-kernel` (the `WEI` command already exists and targets `world-indices`).

## Data contracts
- `packages/contracts/src/market.ts` — `Quote` gains `ytdPercent: z.number().optional()` (additive; existing payloads/tests stay valid; `z.infer` consumers unaffected). No other contract changes; region grouping is a web-side concern, not a contract.

## Provider capabilities
Requires `quotes` (declared on the `WEI` command and the only key needed). The initial board uses `batchQuotes` (`getQuotes`) and the optional live overlay uses the `quotes` SSE stream — both satisfied by the deterministic `MockProvider`, so mock-mode works with no keys. BYO providers that declare `quotes`/`batchQuotes` work unchanged; those omitting `ytdPercent` show "—". When neither capability is present, `missingCapabilities` drives a capability `EmptyState` via `ModuleBody` — never a crash.

## UI / module behavior
- Three labeled region sections (Americas / EMEA / APAC), each a virtualized `DataTable` ranked by `% change` desc; columns `Index / Last / Chg / % / YTD` with +/- tone coloring and signed formatting.
- Row click runs `${symbol} DES`.
- Loading → `LoadingState`; capability gap → capability `EmptyState`; fetch error → `ErrorState` with retry; a region with no resolvable quotes → inline `EmptyState` for that section only (never crash). All via the existing `ModuleBody` ladder.
- `ProvenanceBadge`/`FreshnessBadge` in the panel frame reflect provenance lifted via `useReportProvenance` (mock tier renders `delayed`, no false "live").

## Testing plan
- Contract (`packages/contracts/src/market.test.ts`): `Quote` accepts and round-trips optional `ytdPercent`; omission still parses.
- Adapter (`packages/data-adapters/src/MockProvider.test.ts`): `getQuotes(WORLD_INDEX_SYMBOLS)` returns a quote per symbol with deterministic `ytdPercent`, `change`, `changePercent`; provenance tier `delayed`.
- Component (`apps/web/src/modules/WorldIndicesModule.test.tsx`, RTL): renders three region sections; rows ranked by `% desc`; YTD column shows value or "—"; row click dispatches `DES`; capability-gap and error states render via `ModuleBody`.
- Registry (`apps/web/src/modules/registry.test.ts` or equivalent): `WEI` resolves to `WorldIndicesModule`, no longer `BetaPlaceholder`.
- e2e (`apps/web` Playwright): typing `WEI` opens the board against mock; assert region headers and at least one ranked row render; panel survives.

## Acceptance criteria
- [ ] `WEI` (and aliases `INDICES`/`WORLD`) opens a real `WorldIndicesModule` with Americas / EMEA / APAC sections — no `BetaPlaceholder`.
- [ ] Each region shows index-ETF proxies with `Last / Chg / % / YTD`, ranked by `% change` descending.
- [ ] `Quote.ytdPercent` is added as an optional field; `MockProvider` populates it deterministically; providers omitting it render "—".
- [ ] Board fetches via `api.getQuotes` (`batchQuotes`) with optional `useQuoteStream` overlay; provenance surfaces via `useReportProvenance`; mock tier never shows a false "live".
- [ ] Capability gap / error / empty-region states render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] Reuses `quotesCommon`/`DataTable`/`useApiData`; no new API route; only additive contract change.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`market.ts`, `provenance.ts`), the existing `WEI` command, `MockProvider`, and shared components/hooks (`DataTable`, `EmptyState`/`ErrorState`, `ProvenanceBadge`/`FreshnessBadge`, `useApiData`, `useQuoteStream`, `quotesCommon`). A regioned world-index overview is a standard market-data category feature; region grouping (Americas/EMEA/APAC) and the change/%/YTD columns are benchmarked at the category level only. No Gödel Terminal UI, copy, code, layout, color scheme, or documentation is reproduced.

## Non-goals
- Real exchange index values or live cash-index licensing — ETF proxies in mock mode only; real index feeds are a BYO/provider concern.
- A configurable/editable region universe or per-user index lists (fixed regions here; see watchlist tickets for editable sets).
- Intraday sparklines, heatmaps, or futures/fair-value bands (separate tickets).
- Sorting/column configuration beyond the fixed `% desc` rank (see TKT-008 QM v2 for configurable columns).
- Any order placement, alerts, or personalized advice — out of scope by foundation constraint.
