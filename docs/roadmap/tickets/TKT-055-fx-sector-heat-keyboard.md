# TKT-055 — Batch 3: FX pack (Frankfurter adapter + FX board), sector-nested HEAT, keyboard chart navigation

**Priority:** P1 (competitive)  ·  **Milestone:** Gödel/Midas parity pass  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- [2026 research refresh](../../research/godel/2026-update.md): Gödel added a dedicated `FX`
  function; Midas nests its treemap; keyboard crosshair was the remaining Week-1 charting item.
  FX was a declared-but-unserved capability (`fx` existed in the enum with no provider or module).

## Technical design
- **FrankfurterProvider** — fourth real adapter, keyless: daily **ECB reference rates** (~30
  currencies) via the public Frankfurter API. Capabilities `fx`/`quotes`/`batchQuotes`/daily
  `historicalPrices` for ISO pairs (`EUR-USD`, `CHF-JPY`). One fixing per business day ⇒ EOD-tier
  provenance and **flat candles** (o=h=l=c) — honest about the source. `servesSymbol` confines it
  to ECB pairs; enabled via `TYCHE_PROVIDERS=frankfurter` (alias `ecb`). Cached (30 min), throttled,
  injectable fetch.
- **Routing boundary hardened**: Binance now declines **fiat/fiat** pairs (`CHF-JPY`, `EUR-GBP`)
  — those are FX, not a crypto venue's market — so `binance,frankfurter,mock` routes crypto to the
  venue, FX to the ECB rates, and everything else to mock with zero collisions (test-proven).
- **`FX` command** (aliases `FXC`, `CURRENCY`, gated on `fx`) — majors board (rate with
  pair-appropriate precision, daily change, prev fixing; a pair-shaped active symbol joins the
  board) + an **amount converter** that quotes direct or inverse pairs on demand. Three FX seed
  pairs (EUR-USD, USD-JPY, GBP-USD) + `fx: true` in the mock make it demoable keyless (mock FX is
  deliberately coarse; real precision comes from the ECB rates).
- **Sector-grouped HEAT** — `squarifyGrouped()`: groups squarified by summed weight, labeled
  header strips, members squarified inside each group (unit-tested: group-area proportionality +
  tile containment). A `Sectors` toggle on the HEAT panel, persisted in panel state.
- **Keyboard chart navigation** — the chart container is focusable (`tabIndex`, `role`,
  `aria-label`): ←/→ step the crosshair one candle (Shift = ×10), Home/End jump to the ends,
  +/− zoom around the center, 0 resets the window, Esc clears. The crosshair renderer was
  refactored so mouse and keyboard drive one `drawAt(index, y|null)` path; keyboard mode skips
  the cursor-price tag (no y), and mouse movement retakes control.

## Acceptance criteria
- [x] Frankfurter mapping unit-proven against fixtures: EOD quote with change vs prior fixing,
  flat sorted candles, series caching, best-effort batches, ECB-pair scoping.
- [x] Binance/FX boundary test-proven: `CHF-JPY`/`EUR-GBP` declined by binance, `EUR-USDT`/
  `BTC-EUR` kept.
- [x] `squarifyGrouped` unit-proven (proportionality, containment, membership).
- [x] Full suite green: 507 unit + 33 e2e; 8/8 packages typecheck.

## Clean-room notes
Category-level parity; ECB reference rates are public data with attribution recorded in
provenance on every response.

## Non-goals (later)
- Intraday FX (reference rates are daily by nature; a live FX feed is licensing territory).
- Cross-rate triangulation in the converter beyond direct/inverse pairs.
- On-chain DEX pools, commodities board — next batch candidates.
