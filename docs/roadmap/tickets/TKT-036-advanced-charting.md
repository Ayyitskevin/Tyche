# TKT-036 — Advanced charting: candlesticks + indicator overlays (GP)

**Priority:** P3  ·  **Milestone:** M14  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md` — P3 "Later polish": *"Charting: candlesticks +
  SMA/EMA/RSI overlays + intraday (GIP-class)."*
- Candlesticks, moving averages, and RSI are standard, public-domain charting techniques; benchmarked
  only at the category level. No third-party charting product's code, copy, or visual design is reproduced.

## Problem
The `GP` chart rendered only a single close line with an area fill. The most common technical-analysis
reads — open/high/low/close structure and trend/momentum overlays — were not available, so deeper price
study required leaving the terminal.

## Technical design (M14 anchor)
Pure web-layer change; **no new contract, capability, route, or persistence**. Reuses the existing
`historicalPrices` capability and the already-tested `@tyche/analytics` indicator primitives
(`sma`, `ema`, `rsi`).
- `apps/web/src/modules/chartScale.ts` — pure helpers: `overlaySeries(closes, overlay)` (routes
  `sma`/`ema`) and `priceRange(candles, type, overlays)` (high/low extents in candle mode, closes in
  line mode, extended to cover finite overlay values so lines never clip). Unit-tested.
- `apps/web/src/modules/AdvancedChart.tsx` — dependency-free canvas renderer: line **or** OHLC
  candlesticks (up/down bodies + wicks), SMA/EMA overlays on the price scale, and an optional lower RSI
  study pane with 30/70 guide bands.
- `ChartModule` (`GP`) — control chips for **Line / Candles**, **SMA 20**, **EMA 50**, and **RSI**, each
  persisted in the panel's `state` so a saved workspace restores the exact chart configuration. Chip
  accent colors match the drawn indicator colors (shared `OVERLAY_COLORS`).

## Acceptance criteria
- [x] `GP` renders candlesticks (default) or a line, toggleable.
- [x] SMA 20 / EMA 50 overlays draw on the price scale; RSI renders in a separate 0–100 study pane.
- [x] Toggles persist on the panel state and survive a workspace save/reload.
- [x] Still gates on `historicalPrices`; no order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Built on Tyche's own `historicalPrices` capability, `@tyche/analytics` math, and an original canvas
renderer. Candlesticks/SMA/EMA/RSI are generic public techniques; no competitor artifact is reproduced.

## Non-goals (later)
- Configurable overlay periods; additional studies (MACD, Bollinger, volume bars).
- Intraday / hi-res (GIP-class) charting; drawing tools; crosshair readout.
