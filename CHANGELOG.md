# Changelog

All notable changes to Tyche. Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions are milestones, not npm releases (the workspace is private).

## Unreleased

### Analytics depth — Phase 1 (Bloomberg-gap roadmap)

Kicking off the gap-analysis roadmap with the highest-leverage, zero-new-data win:

- **Portfolio risk analytics core** (`@tyche/analytics`) — a new `portfolioRisk`
  module adds the multi-asset / benchmark-relative layer on top of the existing
  single-series risk math: covariance, Pearson correlation + correlation matrix,
  beta, downside deviation, Sortino, Calmar, annualized (geometric) return,
  tracking error, information ratio, weighted portfolio-return aggregation, and a
  `portfolioRiskStats` headline bundle. Pure functions over aligned return series,
  all NaN/zero-variance/short-history safe; educational analytics only.
- **`PORT` risk panel** — a **Risk** toggle in the portfolio panel computes and
  shows annualized return/volatility, Sharpe, Sortino, Calmar, max drawdown,
  95% VaR, and benchmark-relative beta / tracking error / information ratio for
  the whole book. Backed by a new `GET /api/portfolios/:id/risk?benchmark=SPY`
  that fetches each holding's daily history + the benchmark, aligns by date,
  market-value-weights the positions, and computes the bundle — provenance-
  stamped, graceful when a symbol lacks history (coverage is reported), and works
  keyless in mock mode. Read-only analytics; still no orders, ever.

### Security & correctness hardening (adversarial review)

A multi-agent adversarial code review (find → 3-vote refutation) surfaced these
confirmed defects; all are fixed with regression tests:

- **Cross-tenant audit-log leak (hosted) — `GET /api/audit` is now admin-only.**
  The audit ring is one global trail (every account's emails + activity); any
  signed-in tenant could read it. It now requires an admin in hosted mode (the
  self-host bearer guard is unchanged).
- **Stored-XSS via note links.** Markdown link hrefs are allow-listed to
  `http(s)`/`mailto`; an imported note body with `[x](javascript:…)` now renders
  as inert text instead of a clickable script vector.
- **Cross-account workspace leak on a shared browser.** The `localStorage`
  workspace mirror is namespaced by user id in hosted mode, so one account can no
  longer load (or re-save) another's layout. A failed save now surfaces an error
  and rolls the optimistic mirror back instead of showing a false "saved".
- **`/api/quotes` broke equity watchlists when a venue adapter was enabled.**
  The batch endpoint now groups symbols per serving provider (like the SSE hub),
  so `AAPL` routes to a general provider while `BTC-USDT` routes to the venue.
- **Provider plugins could never serve data.** A conformant plugin is registered
  *before* the always-appended mock fallback, so its capabilities actually route
  to it instead of losing to mock.
- **Registration TOCTOU.** Concurrent signups for the same email can no longer
  create duplicate accounts (the email is reserved synchronously before hashing).
- **Rate-limit store (multi-node).** Under lock contention the SQLite backend now
  fails **closed** (denies) instead of 500-ing the auth request, with a shorter
  `busy_timeout`; SECURITY.md scopes the "shared file" claim to a local
  filesystem (WAL doesn't work over NFS).
- **Ops:** the container runs the API via `tsx` directly (pnpm-as-PID-1 swallowed
  SIGTERM, skipping graceful shutdown); `.dockerignore`/`.gitignore` now exclude
  `.env*` and `backups/` (secrets/customer data were baked into images); the
  root `.env` is actually loaded by the API (`--env-file-if-exists`) and Vite
  (`envDir`), which the docs already promised.

### Terminal, data & onboarding polish
- **Argument-level command-bar autocomplete** — after a completed command + space, the bar
  suggests that command's argument vocabulary (e.g. `ECO ` → GDP/UNRATE/CPIAUCSL), sourced from
  each command's own command-first examples so it never drifts from `HELP`.
- **CSV/JSON export parity across table modules** — a shared `TableExport` control (provenance
  header + a JSON option) is wired into every tabular board, so any table exports the same way.
  The last two holdouts now export too: **`EM`** estimates (transposed board → a Metric column plus
  one per fiscal period) and **`OMON`** option chains (flattened to one row per strike with the
  call-side, strike, and put-side columns).
- **`ERN` earnings board** — reported-vs-estimated per metric/period (consensus, low–high range,
  analyst count, actual, surprise %); the last `beta` command promoted to `stable`.
- **`CFV` filing viewer promoted to `stable`** — no `beta`/`stub` commands remain; every command
  now renders a real component (guarded by `assertModuleCoverage()`).
- **`CHANGELOG` command** — in-app release history rendered from this file (bundled at build time,
  so it works offline and in the read-only demo).
- **`TOUR` command** — replays the 30-second keyboard tour on demand in any mode; shares its
  content with the first-login onboarding screen so the two never drift.

### SaaS retention & billing

- **Trial-lifecycle emails (hosted)** — a day-11 "trial ending" nudge and a day-2 "welcome back"
  re-engagement mail run on a background tick, each sent at most once per account (persisted
  markers, so a restart never double-sends) and audited. Gated on a real email sender: under the
  keyless console sink the campaign is disabled with a one-time warning, never a crash.
- **Annual plan (second Stripe price)** — an optional `STRIPE_PRICE_ID_ANNUAL` adds a yearly plan
  selectable at checkout; `ACCOUNT` offers Monthly and Annual ("2 months free") for trialers and
  shows the current interval once subscribed. When the annual price is unset, an annual checkout
  transparently falls back to monthly. The mock driver supports both, so the flow is demoable
  keyless.
- **Team / seat mode (hosted, closed signups)** — provision seats by invite: `ADMIN` shows
  `Seats: used / limit` and a Team panel to invite or revoke; the invitee gets an emailed single-use
  link that creates their (pre-verified) account and drops them into onboarding. A seat is an
  account **or** an outstanding invite, so a capped instance (`TYCHE_SEATS`) can't be
  oversubscribed. Seats gate access only — billing stays per-account.

### Real data breadth

- **Real fundamentals from SEC EDGAR (US issuers)** — `SecEdgarProvider` now serves the
  `fundamentals` capability from the XBRL company-facts API, so with `SEC_EDGAR_USER_AGENT` set,
  `AAPL FA` returns real income / balance / cash-flow statements (`mode: public`) instead of the
  mock. us-gaap concepts map onto the same rows the mock used; periods are selected from SEC's
  calendar frames (annual + quarterly) with restatement dedupe; a data gap falls back to an empty
  panel, and the whole thing stays keyless with mock fallback when no User-Agent is configured.

### Terminal UX

- **Layout quick-switch chords** — `⌘/Ctrl + 1…9` jump straight to your 1st–9th saved layout (in
  creation order, so the number is stable). Every chord is rebindable in `SETTINGS` and persisted,
  and the `LAYOUT` panel shows each layout's `⌘N` badge.

### Operability

- **Broader e2e coverage + a flake fix** — Playwright journeys now cover `FX`, `HEAT`, `BOOK`, and
  `FUND` alongside the existing set, and the long-standing `LAYOUT` test is fixed (it now uses a
  run-unique layout name, so the persisted-workspace store can't accumulate collisions). The full
  browser suite runs green.
- **External-SIEM audit sink** — set `TYCHE_AUDIT_SINK=http` + `TYCHE_AUDIT_WEBHOOK_URL` (optional
  bearer token) to stream every audit event off-box to a SIEM / HTTP collector. Delivery is
  fire-and-forget with a timeout and is flushed on shutdown; a failing endpoint is logged but never
  breaks the action it records, and an unconfigured URL degrades to the console sink with a warning.
- **Pluggable rate-limit store (multi-node)** — the credential rate limiter now sits behind a
  `RateLimitStore` interface: `memory` (default, node-local) or `sqlite` (`TYCHE_RATE_LIMIT_STORE=sqlite`),
  a shared `rate_hits` DB so every API node pointing at one file enforces a single credential budget
  instead of `limit × nodes`. SQLite failures fall back to memory with a boot warning. The interface
  is the seam for a Redis-backed store. `SECURITY.md` now documents the shared backend **and** the
  multi-node session-revocation boundary (the `tokenEpoch` lever is instant across nodes only when
  the user registry is shared; the file registry caches in memory, so pin sticky sessions or run one
  node — a shared read-through registry is the tracked follow-up).

### Launch hygiene (Week-1 pass)
- **CI gates every PR on the 35-test Playwright e2e suite** (Chromium installed and cached per
  Playwright version; report artifact on failure). The config falls back from the dev container's
  provided browser to Playwright's own.
- **Tag-triggered release workflow** — `git push origin vX.Y.Z` re-verifies the commit, creates a
  GitHub Release with the matching CHANGELOG section as notes, and publishes the self-host image
  to `ghcr.io/<owner>/tyche` (`:vX.Y.Z` + `:latest`).
- **Web bundle code-split** — one 522 KB chunk → 225 KB entry + a long-cacheable vendor chunk +
  52 on-demand module chunks (~12 KB max); first-paint JS down to 111.5 KB gzipped.
- **README + landing refreshed to launch reality** — 41 stable commands, 24 capabilities, five
  real adapters; fresh in-repo screenshots (research desk, sector treemap, DEX pools) and a real
  1200×630 og-image; GHCR pull is now the fastest demo path.

## 0.3.0 — 2026-07-02 · "The parity release"

Four competitive batches in one release, closing the research-backed Gödel/Midas parity backlog:
crypto market structure (Binance adapter, `BOOK`, `FUND`), market visualization (`HEAT`, `MEMB`,
chart zoom/pan/log), the FX pack (Frankfurter adapter, `FX`, keyboard charting), and the on-chain
pack (Dexscreener adapter, `DEX`, `COMM`). Tyche now ships 40 commands, 24 typed capabilities, and
five real keyless-or-free adapters — and CI gates every PR on the full 35-test browser suite.

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
