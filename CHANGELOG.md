# Changelog

All notable changes to Tyche. Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions are milestones, not npm releases (the workspace is private).

## Unreleased

### On-chain DEX pools + commodities board (batch 4)
- **Dexscreener adapter** — fifth real adapter, keyless: on-chain DEX pool search across chains
  and venues (price, 24h volume/change, **liquidity depth**, FDV, buy/sell counts), sorted
  deepest-liquidity first, cached + throttled, enabled via `TYCHE_PROVIDERS=dexscreener` (alias
  `dex`). Declares *only* `dexPools`, so it never intercepts quote/chart/stream routing.
- **`DEX`** (aliases `ONCHAIN`, `POOLS`) — on-chain pools panel: query defaults to the active
  symbol's base token, retypeable in-panel; rows link out to the source pool page. `dexPools`
  becomes the **24th typed capability** (contract, conformance probe, deterministic mock pools,
  `GET /api/dex?q=`).
- **`COMM`** (aliases `CMDTY`, `COMMODITIES`, `GLCO`) — commodities board grouped
  Energy/Metals/Agriculture with change/%/YTD; six commodity seeds (gold, silver, copper, WTI,
  natural gas, wheat) make it fully demoable keyless, and the mock now declares `futures`.

### Crypto market-structure pack (Gödel-parity+, the "premium Midas" axis)
- **Binance adapter** — real, keyless public crypto data: quotes, candles (daily + intraday),
  aggregated trades with aggressor side, L2 order books, and perp **funding rates**. Pairs use
  dash notation (`BTC-USDT`); no silent USD→USDT mapping.
- **Symbol-aware provider routing** — providers can scope themselves to their own universe
  (`servesSymbol`), so one watchlist streams `AAPL` from one provider and `BTC-USDT` from another;
  live data is never jittered by the demo walk.
- **`BOOK`** (aliases `DOM`, `DEPTH`) — Level-2 depth ladder with cumulative size bars, spread/mid
  row, and bid-share imbalance. Works keyless in mock mode for any symbol.
- **`FUND`** (aliases `FUNDING`, `FUNDR`) — perpetual funding board: per-interval rate, annualized
  carry, mark price, next-funding countdown; narrows to the active symbol.
- **`fundingRates`** becomes the 22nd typed capability (contract, conformance probe, mock
  implementation, capability dashboard).
- Aggregated `/api/search` merges results across every quote-capable provider.

### Market visualization & charting depth (parity batch 2)
- **`HEAT`** (aliases `MAP`, `TREEMAP`) — squarified market treemap over the screener universe:
  tile area by market cap or volume, a **validated diverging red↔gray↔green fill** on % change
  (signed % always shown as text — never color-alone), click-to-retarget, live polling.
- **`MEMB`** (aliases `MEMBERS`, `CONSTITUENTS`) — index/ETF constituents and weights;
  `membership` becomes the 23rd typed capability (contract, conformance probe, synthetic mock
  boards for SPX/NDX/DJI/SPY/QQQ, `GET /api/membership/:symbol`).
- **Charting depth** — wheel zoom anchored at the cursor, drag-to-pan, double-click/one-click
  reset, and a **log price scale** (round-number ticks at correct geometric spacing) on the shared
  chart surface used by `GP` and `GIP`.

### FX pack + accessibility depth (batch 3)
- **Frankfurter adapter** — fourth real adapter, keyless: daily ECB reference rates for ~30
  currencies (`fx`, quotes, daily history for pairs like `EUR-USD`). Flat EOD candles — honest
  about a one-fixing-per-day source. Binance now declines fiat/fiat pairs so FX and crypto route
  cleanly side by side.
- **`FX`** (aliases `FXC`, `CURRENCY`) — majors board with daily change + an amount converter
  (direct or inverse rate); rows retarget linked panels; FX seed pairs make it demoable keyless.
- **Sector-grouped HEAT** — two-level squarified treemap (sectors sized by summed weight, labeled
  strips, members nested inside).
- **Keyboard chart navigation** — the chart is focusable: ←/→ step the crosshair (Shift ×10),
  Home/End jump, +/− zoom, 0 resets, Esc clears — fully keyboard-driven chart reading.

## 0.2.0 — 2026-07-01 · "The SaaS release"

Tyche becomes a launch-ready product: the same keyboard-first terminal, now runnable as a hosted,
billable service — strictly opt-in, with the self-host experience unchanged.

### Hosted mode (`TYCHE_MODE=hosted`)
- **Accounts** — email/password sign-up (scrypt-hashed, per-user salts), stateless HMAC cookie
  sessions (30-day, survive restarts), sign-up control (`TYCHE_SIGNUPS`, `TYCHE_ADMIN_EMAIL`).
- **Hard per-user data isolation** — every account gets its own persistence store
  (`data/users/<id>`), bound per-request via `AsyncLocalStorage`; zero route churn.
- **Auth hardening** — per-IP rate limiting on credential endpoints (429), password change with
  session invalidation (`tokenEpoch`), audit events for every auth outcome.

### Billing
- 14-day free trial (no card) seeded at registration; expired trials hit a **402 paywall** that
  keeps auth/billing reachable and deletes nothing. Admins are never paywalled.
- **Driver interface**: `mock` (instant local loop for dev/tests) and `stripe` (Checkout, customer
  Portal, signature-verified webhooks over plain REST). Boot refuses misconfigured Stripe.
- `ACCOUNT` command: plan/status, upgrade, manage billing, change password, **export my data**
  (full-account JSON), sign out. Header trial countdown chip.

### Onboarding & operator
- First-login **role presets** (trader / equity researcher / macro / blank) seed a working
  workspace through the real command path; 30-second keyboard tour; shown exactly once.
- `ADMIN` founder dashboard: accounts, trial funnel, **MRR**, active today/this week, 14-day
  signups timeline, latest accounts.

### Launch kit
- `scripts/deploy.sh` — one-command production deploy (compose + Caddy automatic HTTPS, generated
  secrets, fail-loud misconfig). `marketing/landing.html` — self-contained landing page with
  honest data-posture positioning. `docs/BILLING.md`, `docs/LAUNCH.md` (7-day checklist + 30-day
  roadmap), beta-invite email and X launch-thread templates.

### Terminal (from the revamp cycles)
- Charting realism: labelled axes, gridlines, volume pane, crosshair OHLCV readout, last-price
  marker — daily (`GP`) and intraday (`GIP`).
- Command palette v2: ranked autocomplete (prefix → alias → fuzzy → title) + live symbol search.
- Named workspace layouts (`LAYOUT`), corporate events calendar (`EVT`) with market sessions,
  Docker one-command demo, first-run demo workspace.

## 0.1.0 — foundation

Clean-room terminal foundation: contracts (Zod), terminal kernel (parser/registry/executor),
provider capability model with deterministic mock + real SEC EDGAR and FRED adapters, module SDK,
Fastify API with SSE streaming, React tiling workspace with 30+ modules, plugin host with
conformance gating, SQLite/file persistence, audit log, optional bearer auth.
