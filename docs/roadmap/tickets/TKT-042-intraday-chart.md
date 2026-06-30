# TKT-042 — Hi-res intraday chart (GIP)

**Priority:** P3  ·  **Milestone:** M18  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md` P3 list: *"intraday (GIP-class)"* charting.
- Intraday OHLC charting is a generic, category-level capability; no third-party artifact reproduced.

## Problem
`GP` charts daily/EOD history (`historicalPrices`). There was no intraday (1m–1h) chart, even though
the mock already generates intraday bars and the `intradayPrices` capability exists.

## Technical design
Reuses the M14 charting engine; the only new server surface is one capability-gated route.
- **`TechnicalChart`** (extracted from `ChartModule`): the shared Line/Candles + SMA/EMA/RSI control
  row, price header, and `AdvancedChart`, with a `leadingControls` slot for the time-axis selector.
  `GP` now renders it with daily-range chips; `GIP` renders it with interval + intraday-range chips —
  eliminating duplication.
- **`GET /api/intraday/:symbol?interval&range`** — same provider method as history (`getHistory`) but
  gated on the distinct `intradayPrices` capability (a provider may supply EOD but not intraday).
  Validates interval/range; defaults `5m`/`1d`.
- **Mock**: `getHistory` now stamps provenance `intradayPrices` (not `historicalPrices`) when serving
  an intraday interval, so the freshness/attribution is accurate.
- **`GIP` command** (aliases `INTRADAY`/`INTRA`, `moduleId: intraday-chart`, `requiredCapabilities:
  ['intradayPrices']`, stable) + `IntradayChartModule` (interval `1m–1h` + range `1d`/`5d` selectors,
  persisted on panel state) + `apiClient.getIntraday`.

## Acceptance criteria
- [x] `GIP` opens an intraday chart; switching interval/range re-queries; candlestick/overlay/RSI toggles work.
- [x] Gates on `intradayPrices` (degrades gracefully without it); `GP` is unchanged for the user.
- [x] No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Built on Tyche's own `intradayPrices` capability and the original `AdvancedChart`. No competitor
artifact reproduced; no bundled licensed data (intraday is bring-your-own behind the capability flag).

## Non-goals (later)
- Streaming/live intraday updates; session boundaries / pre-post-market shading; tick charts; 4h bars.
