# Tyche — solo-operator competitive strategy

How Tyche competes with a Gödel-class product **without a company, a sales team, or a data budget**.
Grounded in the research (`product-positioning.md`, `competitive-feature-matrix.md`) and Tyche's
actual architecture.

## The core insight

Gödel competes with Bloomberg on **price + browser delivery + Bloomberg muscle memory**, funded by
~$7M and **licensed real-time data** (Nasdaq TotalView, global feeds). [T1/T2] A solo operator cannot
match licensed-data breadth or real-time speed. **So Tyche must not try to win on data.** It wins on
**delivery model and trust**: self-hostable, local-first, mock-by-default, provider-transparent, and
extensible — the things a hosted, closed SaaS structurally *can't* offer.

> Tyche's wedge is **"the terminal you own and can inspect,"** not "the cheapest data feed."

## Q: How can Tyche compete without a company or data budget?

1. **Be the open, self-hosted substrate.** Tyche runs locally with zero credentials and an open
   module/provider SDK. That's a category Gödel doesn't occupy.
2. **Bring-your-own-data.** Transparent provider adapters let a user plug in *their own* entitlements
   (their Nasdaq/Polygon/IEX/CCXT keys) instead of paying Tyche for data. Tyche never resells data.
3. **Free public data first.** SEC EDGAR (filings/fundamentals), FRED (macro), Yahoo-style public
   quotes, and CCXT crypto are free/public — enough for a genuinely useful research terminal.
4. **Mock-by-default demo mode.** A new user gets a fully working terminal in seconds with no signup,
   no key — the lowest-friction onboarding in the category.

## Q: Which Gödel-class workflows can be approximated with public/mock/self-supplied data?

| Workflow | Public/self data path | Confidence |
| --- | --- | --- |
| Filings (`CF`) + viewer | **SEC EDGAR** (public, UA header) | high — fully doable free |
| Fundamentals (`FA`, `EM`, `ERN`) | EDGAR XBRL company-facts | high |
| Macro / indices context | **FRED** (free key) | high |
| Crypto quotes/chart/TAS | **CCXT** public endpoints | high |
| Equity quotes/history | user-supplied (Polygon/IEX/Alpaca/Tiingo) or delayed public | medium |
| Options chain/Greeks | user-supplied; `@tyche/analytics` computes Greeks locally | medium |
| News (`N`/`TOP`) | RSS/public wires + user-supplied premium | medium |
| Holders/13F (`HDS`) | EDGAR 13F filings | high |
| Screener (`EQS`) | local screen over cached fundamentals/quotes | medium |

## Q: Which workflows require licensed data (and should stay BYO)?

- **Real-time Level-2 / depth-of-book** (Gödel's Nasdaq TotalView) — licensed; expose as a
  user-supplied capability, never bundled.
- **Real-time consolidated equity quotes** and **sub-100ms news wires** — licensed; BYO adapter.
- **Premium estimates/ratings vendors** — BYO; mock + EDGAR-derived approximations otherwise.

## Q: Which features should be local-first tooling instead of paid SaaS?

- **Workspaces, watchlists, notes, alerts, portfolios** → local file / SQLite (already the design).
- **Research journal & notes** → local-first, exportable, AI-groundable — a *Tyche-original* feature.
- **AI copilot** → grounded in the user's *local* workspace + notes + provenance; works in mock mode;
  optional BYO model key. No data leaves the machine by default.
- **Provider capability dashboard** → shows exactly what each configured adapter can/can't do.

## Q: How should Tyche differentiate from Gödel (not copy it)?

| Axis | Gödel (public) | Tyche's original position |
| --- | --- | --- |
| Delivery | hosted SaaS | **self-hostable + hosted-optional** |
| Data | bundled licensed feeds | **provider-agnostic, BYO, transparent** |
| Onboarding | free trial (signup) | **mock-by-default, zero-signup demo** |
| Trust | speed claims | **provenance/freshness on every datum** |
| Extensibility | closed | **open module + provider SDK** |
| AI | "AI Analyst" (roadmap) | **grounded, no-advice, cited, local-context** |
| Privacy | community chat (shared) | **local-first; nothing leaves by default** |
| Compliance | per-seat, FINRA surcharge | **no advice, no orders, entitlement-honest** |

## Q: What should Tyche do *better* for a solo operator?

1. **Inspectability** — every panel shows where its data came from and how fresh it is.
2. **Ownership** — your workspaces/notes/journal are local files you can grep, back up, and version.
3. **Scriptability** — command macros + an extensible registry so power users automate their flow.
4. **Honest gaps** — when a capability/provider is missing, say so clearly (already implemented).
5. **Reproducibility** — deterministic mock mode for demos, screenshots, and tests.

## Q: What should Tyche avoid?

- **No order placement / brokerage** (Gödel ships `BROK`; Tyche won't).
- **No personalized advice** (the AI declines; keep it that way).
- **No reselling licensed data** or scraping behind logins / paywalls.
- **No latency-edge marketing** ("beat the market") — it's data-dependent and advice-adjacent.
- **No copying** Gödel's UI, copy, command docs, or trade dress — category benchmarking only.
- **No feature sprawl** — promote the data-ready beta modules before inventing new ones.

## The 90-day solo wedge (what to actually build first)

1. **M1 hardening + CI** (credibility).
2. **M2 SEC EDGAR + filing viewer** — the single highest-leverage move: turns Tyche from demo into a
   genuinely useful, free, filings-research terminal.
3. **M3 QM v2 + watchlist tabs + batch import** — the daily-driver surface.
4. **M5 news filters + alerts** — the "stay informed" loop.

After that, the data-ready beta modules (options/TAS/estimates/ratings/holders) are cheap wins
because `MockProvider` already produces their data — they just need UIs.
