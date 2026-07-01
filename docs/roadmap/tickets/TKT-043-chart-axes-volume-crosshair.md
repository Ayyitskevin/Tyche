# TKT-043 — Chart realism: axes, volume pane, crosshair, last-price marker

**Priority:** P2 (revamp)  ·  **Milestone:** Revamp Cycle 1  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- Revamp-loop codebase review: `AdvancedChart` drew price/RSI with **no price labels, no time labels,
  no gridlines, no volume display, no crosshair, no last-price marker** — the single largest realism
  gap vs. any professional charting surface (category-level benchmark only).

## Problem
A chart you can't read values off of is a sparkline. Power users need to know *what price* a level
is at, *when* a bar printed, how much volume traded, and where the last price sits — without leaving
the keyboard-first flow.

## Technical design
Pure web-layer change to the original canvas renderer — no contract/route/provider changes.
- `chartScale.ts`: `niceTicks(min,max,target)` ("nice numbers" 1/2/2.5/5/10 steps, strictly inside
  range, float-drift snapped) + `tickDecimals(ticks)`. Unit-tested.
- `AdvancedChart.tsx`:
  - **Price axis** (right gutter): tick labels + horizontal gridlines.
  - **Time axis** (bottom): evenly spaced labels (HH:MM intraday, `MMM d` daily, `MMM yy` >400d)
    + soft vertical gridlines.
  - **Volume pane** (between price and RSI): up/down-colored histogram, max-volume label; auto-hidden
    when the series carries no volume or the panel is too short.
  - **Last-price marker**: dashed level + colored axis pill.
  - **Crosshair**: separate absolutely-positioned overlay canvas driven by imperative mouse handlers —
    pointer moves never redraw the chart. Snapped vertical line, cursor-price horizontal line, axis
    tags, and an OHLCV + change% readout box.
- `TechnicalChart.tsx`: `Vol` toggle chip (persisted `state.volume`, default ON) → `showVolume` prop.
  GP, GIP, and (auto-hidden, no volume data) ECO inherit everything.

## Acceptance criteria
- [x] GP/GIP render price + time axes with gridlines, a volume pane, and a last-price marker.
- [x] Hovering shows a snapped crosshair + OHLCV readout without chart redraw.
- [x] `Vol` chip persists on panel state; volume auto-hides for series without volume (ECO).
- [x] No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Axes/volume/crosshair are generic public charting concepts; the renderer remains an original canvas
implementation. No third-party charting product's code or design is reproduced.

## Non-goals (later)
- Drawing tools; log scale; pane resizing; zoom/pan; session shading.
