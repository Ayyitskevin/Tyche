# Gödel Terminal — public workflow teardown (original abstraction)

Reconstructed from public docs/marketing/videos via `WebSearch`. **Original wording**; no UI, copy,
or layout is reproduced. Each workflow ends with a **Tyche translation** describing how Tyche reaches
the same *category* with its own design (and what it deliberately won't do).

## 1. Single-name analyst deep-dive

**Public pattern:** open the command bar (backtick) → `<TICKER> <ASSET> DES` for the overview →
chart with `G`/`GIP` → filings with `CF` (EDGAR) → statements with `FA` → news with `N` →
estimates/ratings/ownership with `EM`/`ANR`/`HDS`. The company-analysis command set (DES, EVT, ANR,
ERN, EM) is designed to be run in sequence on one name. [T1/T4 — docs, godelguide]

**Tyche translation:** Already supported end-to-end in mock mode: `AAPL DES → AAPL GP → AAPL CF →
AAPL FA → AAPL N`. Tyche opens each as a tiling panel with provenance/freshness on every panel —
something Gödel's public materials don't emphasize. Gap: `EVT` (events) and richer `EM` matrix.

## 2. Quote monitor / multi-watchlist

**Public pattern:** `QM` opens a customizable real-time board across equities/ETFs/indices/FX/futures
with columns (ticker, last, bid, ask, change %, volume, latency). Create multiple **named lists**
(`+`), **batch-import up to 400 tickers**, control the layout, and **pop out** the monitor. [T1/T4]

**Tyche translation:** Tyche ships a streaming `QM` (SSE) + virtualized table + watchlist. Gaps:
multiple **named watchlist tabs**, **batch import**, a latency column, and a higher symbol ceiling.
See tickets `quote-monitor-v2`, `watchlist-tabs`, `batch-import`.

## 3. Batch import

**Public pattern:** paste/load a large symbol set into a watchlist at once instead of adding
tickers one by one (a recent QM addition). [T1]

**Tyche translation:** Add a paste-a-list importer (textarea / CSV) that validates symbols via
`/api/search` and bulk-adds to a watchlist. Original UI. Ticket `batch-import`.

## 4. News filtering & speed

**Public pattern:** `N` shows real-time + historical news for a company or watchlist, **filterable by
source, language, ticker, keyword, and date**; `TOP` is a global headline feed (~60s refresh). News,
wires, documents, and press releases are aggregated in **under ~100ms** — marketed (in a Shkreli
demo) as "beating the market by ~30 seconds." [T1/T3]

**Tyche translation:** Tyche has a news module; gaps are **filters** (source/keyword/date),
**watchlist-scoped** feeds, a **global TOP** feed, and an **alert hook** on keywords. Speed is a
licensed-data problem Tyche won't claim — instead Tyche differentiates on **provenance/latency
transparency** (show each item's source + age). Tickets `news-filters`, `alert-rules`.

## 5. SEC filings

**Public pattern:** `CF` surfaces all SEC filings from company inception with **direct EDGAR links**,
real-time, filterable by company/watchlist/date, with documents rendered inside the workspace
(10-K/Q, 8-K, S-1, proxies, 13F). [T1]

**Tyche translation:** Tyche's `CF` lists filings (mock). The differentiated opportunity is a real
**SEC EDGAR adapter** (public, no key, just a User-Agent) + an in-panel **filing document viewer**.
Tickets `sec-edgar-provider`, `filing-viewer`.

## 6. Financial-statement export

**Public pattern:** `FA` toggles Income/Balance/Cash-Flow and Quarterly/Yearly, then **exports to
Excel or JSON** (Cash Flow also PDF) via a download icon; line items tie back to filings. [T1]

**Tyche translation:** Tyche's `FA` renders statements (mock). Gap: **Excel/CSV/JSON export** and a
"line-item → source filing" link. Tyche already stamps provenance; exports should embed it. Ticket
`financials-export`.

## 7. Options chain & pricer

**Public pattern:** `OMON` shows the live chain (every strike/expiry; bid/ask/last/volume/IV/Greeks);
`OVME` is a Black-Scholes pricer to value a single contract (embeddable in `CHAT`). [T1]

**Tyche translation:** Tyche's `OMON` is a beta scaffold; the mock provider already returns chains
with Greeks. Build the chain grid + an original `OVME`-class pricer using `@tyche/analytics`. Tickets
`options-chain-mock-contract`, (later) option pricer.

## 8. Time & sales

**Public pattern:** `TAS` streams trade-by-trade prints (time/size/price), newest on top. [T1/T4]

**Tyche translation:** Tyche has `TAS` (beta) + a mock `trades` capability + SSE hub. Define a
**time-and-sales stream contract** and render a virtualized print tape. Ticket `tas-stream-contract`.

## 9. Historical multi-security comparison

**Public pattern:** `HMS` overlays multiple securities over a date range on one chart with indicator
support and per-ticker color assignment. [T1 doc]

**Tyche translation:** Tyche has `COMP` (beta) + `@tyche/analytics` (normalized returns). Build a
normalized overlay chart with color-coded series. Ticket `multi-security-comparison`.

## 10. Settings & defaults

**Public pattern:** users set primary/positive/negative/background **colors**, **theme**, and **pinned
commands**; window sizes/counts are customizable; watchlists persist across layouts. [T4]

**Tyche translation:** Tyche has a SETTINGS module + preferences persistence. Gaps: a **default
command** for bare symbols (already a pref), **pinned commands**, and theme tokens. Ticket
`user-preferences-defaults`.

## 11. Keyboard & window management

**Public pattern:** backtick opens the command bar; up to **6 movable/resizable panels**; **Tab**
cycles panels; **window linking by color** syncs the active ticker across linked windows. [T4]

**Tyche translation:** Tyche has a tiling workspace, link groups (color), undo-close, and shortcuts.
Gap: **active-ticker propagation across a link group** (Gödel's color-sync) and panel-focus cycling.
Tickets `window-manager-improvements`, `keyboard-shortcut-parity`.

## 12. AI / chat / community

**Public pattern:** `CHAT` provides in-terminal group and per-symbol chat (can embed components like
`OVME`); an **"AI Analyst"** is described as on the roadmap in a Shkreli video. [T1/T3]

**Tyche translation:** Tyche already ships a **grounded, no-advice AI** copilot (mock). Differentiate
by grounding in the user's **own workspace + notes + provenance**, with citations — a privacy-first,
local-first angle Gödel's hosted community chat doesn't offer. Ticket `ai-context-packet-v2`.

## 13. Press-release / news-speed workflow (demo-sourced)

**Public pattern:** a Shkreli demo frames Gödel delivering press releases ~30s ahead, as a trading
edge. [T3 — video Jsg43FSsQyA]

**Tyche translation:** Tyche will **not** make latency-edge claims (it's licensed-data dependent and
borders on advice framing). Instead, expose **freshness/age** on every news item so users judge
timeliness themselves. (Compliance + honesty differentiator.)

## 14. Expert network / contacts (marketing-sourced)

**Public pattern:** a database of **20,000+ verified high-value contacts** (allocators/industry) for
outreach. [T1 marketing / T4]

**Tyche translation:** **Out of scope** for Tyche's foundation (it's a proprietary data asset + an
outreach product, not a research-terminal core). Recorded as a non-goal.
