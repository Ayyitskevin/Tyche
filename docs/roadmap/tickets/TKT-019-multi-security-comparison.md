# TKT-019 — Multi-security comparison (COMP/HMS-class)

**Priority:** P2  ·  **Milestone:** M8  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- https://godelterminal.com/docs/commands/hms — category benchmark for "Historical Multiple Security": several securities overlaid on one chart over a date range, with per-series color assignment. Used only to confirm the feature category, not for UI/copy.
- `docs/research/godel/command-taxonomy.md:46` — "HMS | analytics | … compare several securities over a date range on one chart | confirmed (doc) / high" — column/series intent benchmark.
- `docs/research/godel/workflow-teardown.md:83-89` — "Historical multi-security comparison … Tyche has `COMP` (beta) + `@tyche/analytics` (normalized returns). Build a normalized overlay chart with color-coded series. Ticket `multi-security-comparison`." — direct translation note this ticket implements.
- `docs/research/godel/tyche-gap-analysis.md:52` and `competitive-feature-matrix.md:22` — frames this as P2 / M8, `apps/web` + `analytics`, "normalized overlay + colors", required capability `historicalPrices`.

## Problem
`COMP` already exists in `DEFAULT_COMMANDS` (`packages/terminal-kernel/src/commands.ts:322`, aliases `HMS`/`COMPARE`, `moduleId: 'compare'`, `requiresInstrument: true`, `requiredCapabilities: ['historicalPrices']`, `maturity: 'beta'`). But `compare` is **not** in `moduleComponents` (`apps/web/src/modules/components.ts`), so `registry.ts:32` falls it back to `BetaPlaceholder`. Running `AAPL COMP` shows a placeholder, not an overlay. The data path already exists end to end — `GET /api/history/:symbol` (`apps/api/src/routes/market.ts:52`, serves `historicalPrices` via `serveCapability`), `api.getHistory` (`apps/web/src/providers/apiClient.ts:102`), and `normalizeToBase(values, base=100)` (`packages/analytics/src/returns.ts:38`) — so this is a UI/wiring ticket, not a contracts ticket.

## User story
As a solo operator/analyst, I want `AAPL COMP` to open a normalized overlay where I can add a few more tickers (e.g. MSFT, NVDA) and see all of them rebased to 100 on one color-coded chart over a chosen range, so that I can compare relative performance at a glance without a spreadsheet or a Bloomberg seat.

## Technical design
Contracts-first; capability model preserved; reuse the `ChartModule` + `ModuleBody` + canvas patterns.
1. **Overlay chart (new, original).** Add `apps/web/src/modules/ComparisonChart.tsx`: a dependency-free canvas component modeled on `PriceChart.tsx` but multi-series. Props: `series: Array<{ symbol: string; values: number[]; color: string }>` (values already rebased), plus `fill`. Autoscale Y across all series' min/max; draw a baseline at the base value (100); stroke each series in its assigned color; reuse the existing `ResizeObserver` + devicePixelRatio sizing from `PriceChart`. No third-party charting lib.
2. **Module component (new).** Add `apps/web/src/modules/ComparisonModule.tsx` modeled on `ChartModule.tsx`:
   - Primary `symbol` (from `requiresInstrument`) seeds the list; keep extra symbols in panel `state` (`state.symbols: string[]`, via `setState`) — same persistence path the Watchlist/Chart panels use.
   - Range selector buttons (`1mo`/`3mo`/`6mo`/`1y`/`5y`) like `ChartModule`, stored in `state.range`.
   - Fetch each symbol's history with `useApiData(() => api.getHistory(sym, { range, interval: '1d' }), …)`; compute `closes(candles)` then `normalizeToBase(closes)` from `@tyche/analytics`.
   - Assign deterministic colors from a small fixed palette (index-keyed, original constant in the module — not copied).
   - An "add symbol" input + chips with remove buttons (mirror `WatchlistModule.tsx:29-44` add/remove), each chip tinted with its series color; a small legend with normalized end-of-range % per name.
   - Gate on `symbol` with `SymbolRequired`; render the chart region through `ModuleBody` (capability → loading → error → empty ladder, `modules/common.tsx`); lift the primary series provenance via `useReportProvenance`.
3. **Register.** Add `ComparisonModule` to `moduleComponents` under key `'compare'` so `registry.ts` stops returning `BetaPlaceholder`. Optionally flip `COMP` `maturity` `beta`→`stable` in `commands.ts` once shipped (kernel-only metadata).

## Affected packages / apps
- `apps/web` — new `modules/ComparisonModule.tsx` and `modules/ComparisonChart.tsx`; edit `modules/components.ts` (register `'compare'`). Reuses `useApiData`, `apiClient.getHistory`, `modules/common.tsx`, `@tyche/analytics` (`closes`, `normalizeToBase`), `@tyche/ui` state/format helpers.
- `packages/terminal-kernel` — optional `maturity` flip for `COMP` (no behavior change).
- No changes to `apps/api`, `packages/contracts`, or `packages/data-adapters` — history route, capability, and mock candles already exist.

## Data contracts
None. `HistoricalSeries`/`Candle` (`packages/contracts/src/market.ts:70`) and `historicalPrices` capability already exist; `normalizeToBase` already exists in `@tyche/analytics`. No new or changed Zod types. The extra-symbols list lives in panel `state` (free-form panel state in `workspace.ts`), not a new contract.

## Provider capabilities
Requires `historicalPrices` (`ProviderCapabilities`, `packages/contracts/src/provider.ts`). Satisfied by `MockProvider.getHistory` (deterministic candles), so **mock mode works with no keys**. BYO providers declaring `historicalPrices` work unchanged. When the capability is absent, `serveCapability` returns `capability_unavailable` and `ModuleBody` renders the capability-gap `EmptyState` — never a crash. Per-symbol fetch failures degrade gracefully (that series is dropped from the overlay with an inline note); the panel does not error out wholesale.

## UI / module behavior
- Panel: range buttons + add-symbol input + color-coded chips (top), normalized overlay canvas (fill), legend with end-of-range normalized % per name.
- No symbol → `SymbolRequired`. Empty candles for the primary symbol → `EmptyState` ("No history for {symbol}."). Loader error on the primary → `ErrorState` with retry. Capability gap → capability `EmptyState`. All via `ModuleBody`.
- A secondary symbol that 404s / has no data is skipped with a muted "no data" chip state; the rest still render (capability-gap-graceful, never crash).
- `ProvenanceBadge`/`FreshnessBadge` in the frame reflect the primary series provenance (mock freshness `eod`) lifted via `useReportProvenance` — surfaced honestly, no fake "live".

## Testing plan
- Unit — analytics (`packages/analytics/src/analytics.test.ts` area): extend `normalizeToBase` coverage for the multi-series base-100 invariant (first point == 100, ratios preserved, empty/zero-first guarded — already partly covered).
- Unit — chart (`apps/web/src/modules/ComparisonChart.test.tsx`, RTL): renders one `<canvas>`; tolerates `<2` points per series without throwing; assigns distinct colors per series.
- Unit — module (`apps/web/src/modules/ComparisonModule.test.tsx`, RTL + mocked `apiClient`): seeds the primary symbol; add/remove a second symbol updates `state.symbols` and refetches; legend shows normalized % per name; no symbol → `SymbolRequired`; primary empty → `EmptyState`; primary error → `ErrorState`; capability gap → capability `EmptyState`; a failing secondary symbol is dropped, others remain.
- e2e (`apps/web` Playwright): `AAPL COMP` opens the comparison panel against mock; add `MSFT`; assert ≥2 color-coded legend entries and a rendered canvas; switch range and assert refetch.

## Acceptance criteria
- [ ] `AAPL COMP` (and alias `HMS`) renders a normalized overlay panel, not `BetaPlaceholder`.
- [ ] Series are rebased via `@tyche/analytics` `normalizeToBase` (first point == base 100) and color-coded from an original palette.
- [ ] Users can add/remove additional symbols; the list persists in panel `state` and survives workspace save/restore.
- [ ] Range selector (`1mo`…`5y`) refetches and re-normalizes all series.
- [ ] No-symbol / empty / error / capability-gap / failing-secondary states all render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] Provenance (`historicalPrices`, mock `eod`) is surfaced via panel badges; no false "live".
- [ ] `'compare'` is registered in `moduleComponents`.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own pieces: the existing `/api/history` route + `serveCapability`, `apiClient.getHistory`, `@tyche/analytics` `closes`/`normalizeToBase`, the `ModuleBody`/`SymbolRequired` ladder, and a new canvas (`ComparisonChart`) derived from Tyche's own `PriceChart` (no external charting lib). A normalized multi-name overlay with color-coded series is a standard category feature; the behavior is benchmarked from public command docs (`hms`) and Tyche's dossier, not copied. No Gödel Terminal UI, copy, code, color palette, layout, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Candlestick/OHLC overlay, indicator overlays (SMA/EMA/RSI), or intraday — that is the chart-v2 track (`GP`/`GIP`), separate M8 tickets.
- Drawing tools, crosshair tooltips, log-scale, or correlation/beta tables — future enhancements.
- A new provider capability or any change to `HistoricalSeries`/`Candle` Zod contracts.
- Saving named comparison sets server-side — extra symbols live in panel state only.
- Personalized advice or buy/sell signals — display normalized performance only, no recommendation synthesis (foundation constraint).
