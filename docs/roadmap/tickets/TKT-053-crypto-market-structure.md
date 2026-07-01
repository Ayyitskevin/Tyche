# TKT-053 — Crypto market-structure pack: Binance adapter, BOOK, FUND

**Priority:** P1 (competitive)  ·  **Milestone:** Gödel/Midas parity pass  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- Mid-2026 research refresh ([2026-update.md](../../research/godel/2026-update.md)): Gödel's
  crypto is spot-prices-only and self-described as a complement to equities; Midas's whole
  identity is crypto market-structure depth (L2 books, funding suite, order flow) via CCXT.
- Tyche had the plumbing waiting: a `crypto` asset class + capability, an `OrderBook` contract
  with a mock implementation and **no route or module**, and a disabled `ccxt` scaffold.

## Problem
"Premium Midas, Gödel-equivalent" needs live crypto pairs flowing through the whole terminal plus
the two market-structure surfaces Gödel lacks — without a heavyweight exchange SDK, without
touching account keys, and without breaking the single-provider equity routing.

## Technical design
- **`fundingRates`** — 22nd typed capability: `FundingRate` contract (rate, interval, annualized
  carry, mark/index, next funding), `getFundingRates(symbols?)` on `DataProvider`, conformance
  probe, deterministic mock board off the crypto seeds.
- **`BinanceProvider`** (real, keyless, dependency-free fetch): 24h tickers → `Quote`, klines →
  daily/intraday `HistoricalSeries`, aggTrades → `TradePrint` (maker flag → aggressor side),
  depth → `OrderBook` (venue-limit snapping), futures `premiumIndex` → `FundingRate[]`. Cached
  (exchangeInfo 1h, quotes 5s, klines 60s, funding 30s) + politeness throttle, injectable fetch
  for tests. Pairs use dash notation (`BTC-USDT`); **no silent USD→USDT mapping** — the mock's
  synthetic `BTC-USD` stays mock, honestly.
- **Symbol-aware routing**: optional `DataProvider.servesSymbol(symbol)`;
  `ProviderRegistry.forCapability(capability, symbol?)` filters by it. Binance confines itself to
  known-quote-asset pairs, so enabling it never hijacks equities. `/api/search` now merges results
  across all quote-capable providers; symbol-scoped routes pass the symbol through
  `serveCapability`.
- **Streaming honesty**: the SSE hub groups a subscription's symbols per provider; mock-mode
  quotes keep the demo jitter walk, real providers are passed through untouched, and real trade
  tapes poll actual prints behind a timestamp watermark.
- **`BOOK`** (aliases `DOM`, `DEPTH`) → order-book module: ask/bid ladder with cumulative depth
  bars, spread/mid row, bid-share imbalance, depth presets (10/20/50), 2.5s polling. Pure
  `buildBookView` helper (sorting, cumulation, spread/mid/imbalance) unit-tested.
- **`FUND`** (aliases `FUNDING`, `FUNDR`) → funding-board module: rate, annualized carry, mark,
  next-funding countdown; narrows to the active symbol; rows retarget linked panels. Pure
  formatting helpers unit-tested.

## Acceptance criteria
- [x] Mock mode: `BTC-USD BOOK` renders a ladder and `FUND` a two-row board, keyless (route
  tests over HTTP).
- [x] Binance mapping unit-tested against fixtures: quote/klines/depth/trades/funding + search
  caching + pair validation + servesSymbol scoping (incl. `BTC-USD` → mock).
- [x] Registry routes `BTC-USDT`→binance, `AAPL`/`BTC-USD`→mock with both registered; aggregate
  capabilities include `fundingRates`.
- [x] Full suite green: 488 unit + 33 e2e; every package typechecks.

## Clean-room notes
Category-level parity with publicly documented feature classes; all UI/code original. Binance
public data enabled explicitly by the operator (terms responsibility documented).

## Non-goals (follow-ups filed)
- Market treemap (`HEAT`, Gödel `IMAP`-class) over the screener capability; `MEMB` membership.
- WebSocket streaming (polling is honest and sufficient at this stage), multi-venue `ALLQ`/`ARB`.
- On-chain/DEX pools, liquidations, open interest history; commodities (`GLCO`) and FX boards.
- Anything involving account keys or order flow — Tyche remains research-only by design.
