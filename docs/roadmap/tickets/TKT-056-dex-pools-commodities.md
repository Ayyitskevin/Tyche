# TKT-056 — Batch 4: on-chain DEX pools (Dexscreener adapter) + commodities board

**Priority:** P1 (competitive)  ·  **Milestone:** Gödel/Midas parity pass  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- [2026 research refresh](../../research/godel/2026-update.md): on-chain DEX pool discovery is the
  last big Midas differentiator Tyche lacked (Midas is crypto-first; Gödel's crypto remains
  spot-only), and commodities (Gödel's GLCO category) was the remaining unserved board. Futures
  data is licensed, so commodities ship mock-first.

## Technical design
- **`dexPools`** — 24th typed capability: `DexPool` contract (pair address, chain, DEX, base/quote
  tokens, USD price, 24h change/volume, liquidity, FDV, buy/sell counts, source URL), provider
  method `getDexPools(query, limit)`, stub failure, conformance probe, `GET /api/dex?q=`.
- **DexscreenerProvider** — fifth real adapter, keyless: public search endpoint mapped to the
  contract with strict numeric coercion (string prices → numbers; absent metrics → `null`; non-https
  links dropped), sorted deepest-liquidity first, 60 s cache + politeness throttle, injectable
  fetch. Declares **only** `dexPools` — pool snapshots are a market-structure view, not a quote
  feed — so it can never intercept symbol-routed capabilities. Registry names: `dexscreener`/`dex`.
- **Mock pools** — deterministic per-token venue set (uniswap/aerodrome/camelot/raydium/
  pancakeswap across 5 chains) with seeded liquidity/volume; priced off the token's mock quote when
  one exists (`ETH` → the ETH-USD seed) with small per-venue dispersion, so DEX works keyless.
- **`DEX` command** (aliases `ONCHAIN`, `POOLS`, gated on `dexPools`) — query defaults to the
  active symbol's base token, retypeable in-panel; micro-price formatting keeps meme-token decimals
  readable without scientific notation (unit-tested); rows link out when the source provides a URL.
- **`COMM` command** (aliases `CMDTY`, `COMMODITIES`, `GLCO`, gated on `futures`) — grouped board
  (Energy/Metals/Agriculture) mirroring the WEI pattern: batch fetch + live stream merge, change/%/
  YTD, row click-through. Six commodity seeds (XAU/XAG/HG/WTI/NG/ZW vs USD, `assetClass:
  'commodity'`) and `futures: true` in the mock make it fully demoable keyless.

## Acceptance criteria
- [x] Dexscreener mapping fixture-proven: coercion, null handling, liquidity sort, cache behavior,
  limit on cached results, error paths, single-capability descriptor.
- [x] Mock pools deterministic + schema-valid; commodity seeds serve quotes/history; conformance
  suite passes with the two new capability declarations.
- [x] `/api/dex` route serves pools and 400s a missing query; e2e covers `ETH DEX` (+ in-panel
  re-search) and the grouped `COMM` board.
- [x] Full suite green: 523 unit + 35 e2e; 8/8 packages typecheck.

## Clean-room notes
Category-level parity only. Dexscreener data is public with attribution recorded in provenance on
every response; no proprietary futures data is bundled (commodities are synthetic demo seeds until
an operator brings a licensed source).

## Non-goals (later)
- Pool-level candles/trades (Dexscreener exposes more surface; DEX ships the discovery view first).
- Token profile/social metadata; new-pair discovery feeds.
- Real futures quotes (licensing territory — the `futures` capability is ready for an operator
  adapter or plugin).
