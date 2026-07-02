# TKT-054 — Parity batch 2: HEAT market treemap, MEMB membership, chart zoom/pan/log

**Priority:** P1 (competitive)  ·  **Milestone:** Gödel/Midas parity pass  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- [2026 research refresh](../../research/godel/2026-update.md): Gödel added `IMAP` (intraday
  market map) in v4.5.1; Midas ships a `HEAT` treemap; `MEMB` was the last confirmed-category
  command Tyche lacked; chart zoom/pan/log were the standing Week-1 roadmap items.

## Technical design
- **`HEAT`** (aliases `MAP`, `TREEMAP`) — squarified treemap (Bruls) over the existing `screener`
  capability, no new API. Pure `squarify()` layout (largest-first rows along the shorter side,
  aspect-ratio finalization) + `divergingFill()` — a red↔gray↔green diverging ramp whose poles
  (`#dc2626`/`#059669`) **pass the dataviz validator** on the zinc-950 surface (lightness band,
  chroma, CVD ΔE 23, ≥3:1 contrast); the neutral midpoint is intentionally low-chroma. Direction
  is never color-alone: every tile ≥ threshold shows its signed % as text, tiles have 2px surface
  gaps, native tooltips, a −3%/0/+3% legend, and click-to-retarget. Size-by toggle (mkt cap /
  volume), 15s polling.
- **`MEMB`** (aliases `MEMBERS`, `CONSTITUENTS`) — `membership` becomes the **23rd capability**:
  `IndexMembership`/`Constituent` contracts, `getMembership()` on `DataProvider` + stub +
  conformance probe (SPY), synthetic mock boards (SPX/NDX/DJI/SPY/QQQ; weights = market-cap
  shares summing to 100), `GET /api/membership/:symbol` (symbol-aware), module with weight/sector
  table and row retargeting. Unknown benchmarks answer an empty, explained membership. Real
  constituent data is licensing-encumbered — mock-first by design, like options/estimates.
- **Chart depth** on the shared `GP`/`GIP` surface:
  - Pure helpers in `chartScale.ts`: `zoomWindow` (anchor-stationary, 10-bar minimum, null = full
    view), `panWindow` (clamped shift), `priceMapper` (linear/log with geometric-mean midpoint and
    linear fallback for ranges ≤ 0).
  - `AdvancedChart`: wheel zoom anchored at the cursor (non-passive listener), drag-to-pan in
    whole candles with fractional carry, double-click reset, crosshair suppressed while dragging
    and log-aware for the cursor-price tag; `logScale` prop maps prices in log space (round-number
    ticks at correct geometric spacing).
  - `TechnicalChartBody`: session-local view window (resets on symbol/range/interval change),
    slices the series for the chart, floating "N bars · reset" pill; `Log` toggle chip persists in
    panel state. Indicators recompute over the visible slice (documented trade-off).

## Acceptance criteria
- [x] `squarify` unit-proven: full-area coverage, value-proportional areas, no overlap, bounds,
  non-positive-weight filtering. `divergingFill` poles/clamping/neutral proven.
- [x] Treemap palette validated with the dataviz validator (poles pass all six checks on the dark
  surface); signed-% text + gaps + tooltips as secondary encoding.
- [x] `/api/membership/SPY` weights sum to ~100 over HTTP; unknown symbol → empty + explanation;
  conformance probes the new capability.
- [x] `zoomWindow`/`panWindow`/`priceMapper` unit-proven (anchoring, clamps, min-span, log
  round-trip, linear fallback).
- [x] Full suite green: 501 unit + 33 e2e; all 8 packages typecheck.

## Clean-room notes
Category-level parity (market-map, membership, chart ergonomics are generic terminal categories);
all layout math and UI original.

## Non-goals (later)
- Sector-grouped treemap nesting; a crypto-universe HEAT (needs a screener over live pairs).
- Real membership adapter (index constituent data is licensed).
- Keyboard crosshair + zoom chords; volume-bar alignment polish in line mode (remaining Week-1 item).
