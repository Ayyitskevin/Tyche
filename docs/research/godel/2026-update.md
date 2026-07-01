# Gödel Terminal — mid-2026 research refresh (clean-room)

A follow-up sweep to the 2025 dossier, run via parallel WebSearch agents (direct fetch of
godelterminal.com/docs still 403s; findings triangulated from the official changelog surfaced in
search snippets plus third-party reviews). Same clean-room rules: **category-level abstraction
only** — no copied docs, copy, or UI. Also incorporates a public catalog of the operator's own
**Midas** repository (github.com/Ayyitskevin/Midas) to position Tyche as its multi-tenant premium
edition.

## What changed at Gödel since the dossier

| Item | Status | Tyche response |
| --- | --- | --- |
| `SECF` universal finder (v4.3.0) | new | Tyche has had `SECF` search since the foundation; aggregated multi-provider search shipped with the crypto pack |
| `ENT` in-app entitlements / paid add-ons | new | category parity via Tyche's billing layer (trial/Pro, Stripe) |
| `IMAP` intraday market map | new | candidate: heatmap/treemap module over the existing screener capability (backlog) |
| `GLCO` commodities monitor, `FX` function | new | `fx`/`futures` capabilities exist in the contract; adapters are backlog |
| Corporate **bonds** asset class (v4.3.0) | new | `bond` asset class exists in contracts; no adapter (backlog, licensing-dependent) |
| `AL` price alerts | new | Tyche `ALERT` predates it (price/%/volume rules on the live stream) |
| `EQS` screener **disabled for maintenance** | regression | Tyche's `EQS` works — talking point |
| Pricing: ~$80/mo (2025) → **$118/mo or $996/yr** (2026), pro surcharge, paid add-ons | change | widens Tyche's price undercut at $29–59/mo |
| $5M seed (Jan 2026, ~$7M total) | context | competitor is funded; speed + honesty remain the moats |
| Still: no public API, no native mobile, no AI analysis | unchanged | Tyche ships a REST API self-hosters can build on + a grounded AI copilot |

**Gödel's crypto is shallow** (their own positioning: equities-first, crypto/FX as complements):
spot prices and volume for majors only — no public evidence of crypto order books, funding rates,
perp analytics, or on-chain data. **This is the opening.**

## Midas (public repo catalog)

Self-hosted, MIT, crypto-first Gödel-style terminal by the same operator: `SYMBOL FUNCTION`
grammar over pairs (`BTC/USDT GP`), ~200 commands, CCXT (115+ exchanges) + Dexscreener +
GeckoTerminal + Yahoo, L2 books (`BOOK`)/depth heatmaps/order-flow, a full perp funding suite
(`FUND`/`FUNDR`/`FRH`/`CARRY`/`PREM`), liquidations with source honesty, screeners/heatmaps,
~115 indicator boards, risk/portfolio math, read-only exchange accounts, and heavily-gated
opt-in trading. Planned hosted tier ~$20/mo.

## Positioning: Tyche = multi-tenant premium Midas, Gödel-equivalent

- **vs Gödel**: category parity on the confirmed command surface (see the taxonomy mapping), a
  working screener, a hosted SaaS layer with billing, an AI copilot, and now **deeper crypto than
  Gödel ships** — at a quarter of the price.
- **vs Midas**: same honest, self-hostable, keyboard-first DNA, plus what Midas lacks: multi-tenant
  accounts with hard isolation, recurring billing, onboarding, founder metrics, TLS deploy — the
  productized business layer. Tyche stays **research-only** (no order tickets, no account keys):
  the no-orders posture is a deliberate difference from Midas's gated execution.

## Shipped from this refresh (TKT-053)

Real keyless **Binance adapter** (quotes/candles/trades/L2 books/funding for `BTC-USDT`-style
pairs), **symbol-aware provider routing**, **`BOOK`** depth ladder, **`FUND`** funding board, and
the **`fundingRates`** capability (22nd). Remaining candidates filed in the backlog: market
treemap (`HEAT`/IMAP-class), `MEMB` index membership, chart zoom/pan/log, commodities/FX boards,
Dexscreener-class on-chain pools.

*Sources: see the workflow transcript (godelterminal.com changelog via search snippets;
godelguide.com; godeldiscount.com; findmymoat.com; tradingtoolshub.com; thestockdork.com;
github.com/Ayyitskevin/Midas). Retrieved 2026-07-01.*
