# Data providers

Tyche is **provider-agnostic**. Modules never talk to a provider directly — they declare the
*capabilities* they need, and a provider that supplies those capabilities is resolved at runtime.
Tyche ships the deterministic mock provider, eight real adapters — **SEC EDGAR**
(`filings`), **FRED** (`economicSeries`, `economicReleases`), **Binance** (crypto
quotes/candles/trades/order book/funding), **Frankfurter** (daily ECB FX reference rates),
**Dexscreener** (on-chain DEX pools), **GDELT** (global `news`), **Stooq** (EOD
equity/ETF/index prices), and **Finnhub** (real-time equity quotes, bring-your-own-key) — and
two disabled scaffolds (`yahoo`, `ccxt`). Seven are keyless-public; Finnhub is BYO-key.

> **Entitlements warning.** Live market data is almost always licensed. Enabling a real provider is
> **your responsibility**: confirm you have the appropriate market-data licenses/entitlements and
> comply with each source's terms of use and attribution requirements. Tyche bundles no proprietary
> data and makes no proprietary/private-API assumptions.

## The capability model

A provider declares a `ProviderDescriptor`:

```ts
{
  name: 'mock',
  mode: 'mock' | 'public' | 'paid' | 'enterprise' | 'user_supplied',
  capabilities: { quotes: true, batchQuotes: true, historicalPrices: true, /* …21 flags… */ },
  freshness: [{ capability: 'quotes', tier: 'delayed', delaySeconds: 900 }],
  attribution?: string,
  attributionRequired?: boolean,
  rateLimit?: { requestsPerMinute, requestsPerDay, burst },
  requiresConfiguration: boolean,
}
```

The 24 capabilities: `quotes`, `batchQuotes`, `historicalPrices`, `intradayPrices`, `trades`,
`orderBook`, `news`, `filings`, `fundamentals`, `estimates`, `analystRatings`, `ownership`,
`options`, `fx`, `crypto`, `futures`, `bonds`, `portfolio`, `screener`, `economicSeries`, `events`,
`fundingRates`, `membership`, `dexPools`.

**Symbol-aware routing:** a provider may implement the optional `servesSymbol(symbol)` hook to
confine itself to its own universe. The registry then routes per symbol: with
`TYCHE_PROVIDERS=binance,mock`, `BTC-USDT` quotes come from Binance while `AAPL` (and the
mock-seeded `BTC-USD`) keep coming from the mock — in the same watchlist, chart, or stream.

The `ProviderRegistry`:
- `forCapability(cap)` → the first enabled provider that declares `cap`.
- `aggregateCapabilities()` → the union across enabled providers (drives the web UI + capability gaps).
- The **mock provider is always registered as a fallback**, so the terminal is never dataless.

## Provenance & freshness

Every provider method returns `Envelope<T> = { data, provenance }`. `DataProvenance` records the
provider, mode, capability, `retrievedAt`, and a `DataFreshness` (`asOf`, `tier`, optional
`delaySeconds`/`ageMs`/`stale`). Freshness tiers: `live`, `delayed`, `eod`, `historical`, `mock`,
`unknown`. The UI renders this on every panel.

## The mock provider

`MockProvider` is deterministic and seeded — same reference date ⇒ same data. It models a demo
universe: **AAPL, MSFT, NVDA, TSLA, SPY, QQQ, BTC-USD, ETH-USD**, and **synthesizes** plausible data
for any other symbol so `DES`/`GP` never crash on an unknown ticker.

How it works: a seeded geometric random walk produces a master daily price path per symbol; quotes,
intraday bars, trades, order books, news, filings, financial statements, estimates, ratings,
ownership, and option chains are all derived from it. All values are **synthetic and clearly marked
as such in provenance** (`mode: 'mock'`, attribution: "Synthetic data — Tyche mock provider").

It supplies: `quotes`, `batchQuotes`, `historicalPrices`, `intradayPrices`, `trades`, `orderBook`,
`news`, `filings`, `fundamentals`, `estimates`, `analystRatings`, `ownership`, `options`, `crypto`,
`screener`, `economicSeries` (a small catalog of synthetic macro series — GDP, CPI, unemployment,
fed funds, 10Y — plus a synthetic fallback for any other id), and `events` (deterministic quarterly
earnings/dividend cycles + occasional splits per filer). Quotes carry a clock-derived `marketState`
(pre/regular/post/closed; crypto 24/7). It does **not** supply `fx`, `futures`,
`bonds`, or `portfolio` — so those modules demonstrate the graceful capability-gap state.

### Conformance

`checkProviderConformance(provider)` calls every method the provider declares and validates each
envelope against the contract schema. The mock provider passes the full suite (see
`MockProvider.test.ts`). Run the same check against your own provider to guarantee it honors its
declared capabilities.

## SEC EDGAR provider (implemented — `filings`)

`SecEdgarProvider` is a **real, public** adapter for the `filings` capability over the SEC EDGAR
HTTP API (no API key). The SEC fair-access policy requires a **descriptive User-Agent**, so the
provider refuses to construct without one and the registry only enables it when `SEC_EDGAR_USER_AGENT`
is set.

```bash
TYCHE_PROVIDERS=secedgar
SEC_EDGAR_USER_AGENT="Your Name your@email.com"
```

It resolves a ticker → CIK via `company_tickers.json` (cached 24h), fetches
`data.sec.gov/submissions/CIK…json` (cached 15m), maps the recent filings to the `Filing` contract
with direct EDGAR document URLs and `DataProvenance` (`provider: secedgar`, `mode: public`,
`tier: eod`, `sourceUrl`), and politely rate-limits requests. Unknown tickers resolve to an empty
list (never a crash). When `SEC_EDGAR_USER_AGENT` is unset, **mock serves `filings`**, so the app
keeps working with no keys. Only `filings` is implemented; other capabilities fall through to other
providers. It passes the conformance suite for `filings`.

## Frankfurter provider (implemented — FX reference rates)

`FrankfurterProvider` is a **real, public, keyless** adapter for ISO currency pairs (`EUR-USD`,
`USD-JPY`, `CHF-JPY`, …) over the Frankfurter API — daily **ECB reference rates** for ~30
currencies: `fx`, `quotes`/`batchQuotes` (latest fixing + change vs the prior one), and daily
`historicalPrices`.

```bash
TYCHE_PROVIDERS=frankfurter,mock   # `ecb` is an alias
```

- **One fixing per business day**: everything is EOD-tier and history candles are flat
  (o=h=l=c) — honest about what a reference rate is. Chart FX pairs in line mode.
- **Scoped by `servesSymbol`** to ECB currency pairs; the Binance adapter deliberately declines
  fiat/fiat pairs (e.g. `CHF-JPY`), so with both enabled crypto routes to the venue and FX to the
  ECB rates with no collisions.
- **Terms**: public ECB data via frankfurter.dev; attribution recorded in provenance.

## Binance provider (implemented — crypto market structure)

`BinanceProvider` is a **real, public, keyless** adapter for crypto pairs over Binance's public
REST endpoints: `quotes`/`batchQuotes` (24h tickers), `historicalPrices`/`intradayPrices`
(klines), `trades` (aggregated prints with aggressor side), `orderBook` (L2 depth), and
`fundingRates` (perpetual funding via the futures `premiumIndex` endpoint). No API key is used or
accepted — it reads only public market data.

```bash
TYCHE_PROVIDERS=binance,mock   # list binance before mock so pairs route to the venue
```

- **Symbols are pairs** in dash notation: `BTC-USDT`, `ETH-USDC`, `SOL-BTC`. There is deliberately
  no `USD` quote mapping — Binance spot quotes in stablecoins, and silently treating `USDT` as
  `USD` would misstate the instrument. The mock's synthetic `BTC-USD` stays with the mock.
- **Scoped by `servesSymbol`**: the adapter only ever sees pair-shaped symbols, so enabling it
  never hijacks equity routing, search, or streams.
- **Streaming**: the SSE hub polls real tickers/prints for pairs (no synthetic jitter is ever
  applied to live data) while mock symbols keep their demo walk.
- **Terms**: public data, but review Binance's terms of use before enabling — same operator
  responsibility as every live adapter. Attribution is recorded in provenance on every response.

## Dexscreener provider (implemented — on-chain DEX pools)

`DexscreenerProvider` is a **real, public, keyless** adapter for the `dexPools` capability over
Dexscreener's public search endpoint: where a token trades across decentralized venues — chain,
DEX, price, 24h volume and price change, **liquidity depth**, FDV, and buy/sell transaction counts,
sorted deepest-liquidity first.

```bash
TYCHE_PROVIDERS=dexscreener,mock   # `dex` is an alias
```

- **Query-shaped, not symbol-shaped**: `DEX ETH` searches pools for a token; the adapter declares
  *only* `dexPools`, so it never intercepts quote/chart/stream routing for anything else.
- **Live-tier snapshots**, cached for 60 s and politely throttled (the public search endpoint is
  rate-limited to ~300 req/min).
- **Terms**: public data via dexscreener.com; attribution recorded in provenance on every response.
  Pool rows link out to the source page when one is provided.

## GDELT news provider (implemented — `news`)

`GdeltNewsProvider` is a **real, public, keyless** adapter for the `news` capability over the
**GDELT DOC 2.0** API, so `N` / `TOP` show live global headlines instead of the mock generator.
A symbol query searches the ticker in a finance context (`("AAPL") (stocks OR shares OR earnings
OR market)`), a `keyword` passes through verbatim, and a bare query returns the global markets
feed; `since` / `until` map to GDELT's datetime window.

```bash
TYCHE_PROVIDERS=gdelt,mock   # `news` is an alias; list before mock so news routes to GDELT
```

- **Descriptive third-party news, not a data feed you resell** — public GDELT article metadata
  (headline, source domain, URL, publish time). GDELT carries no ticker tags, so `symbols` is
  echoed from the query rather than inferred.
- **~15-minute latency (delayed tier)**, cached for 5 min and politely throttled.
- **Degrades to an empty feed** on a blocked/rate-limited/failed request rather than an error —
  headlines are supplementary. In mock-only deployments the mock news generator still serves.
- **Terms**: public data via gdeltproject.org; attribution recorded in provenance on every response.

## Stooq provider (implemented — EOD equities/ETFs/indices)

`StooqProvider` is a **real, public, keyless** adapter for the `quotes`, `batchQuotes`, and
`historicalPrices` capabilities over Stooq's CSV endpoints — **end-of-day** OHLCV for equities,
ETFs and indices, so `GP` / `HP` / `QM` show real prices instead of the mock walk. Quotes are
derived from the two most recent daily closes.

```bash
TYCHE_PROVIDERS=stooq,binance,frankfurter,gdelt,mock   # `equities` is an alias
```

- **Scoped by `servesSymbol`** to equity-shaped tickers (`AAPL`, `SPY`, `^SPX`); crypto pairs
  (`BTC-USDT` → Binance) and FX pairs (`EUR-USD` → Frankfurter) keep routing to their venue
  adapters, and US tickers get Stooq's `.us` market suffix automatically.
- **EOD-tier** (one fixing per trading day), cached 30 min and politely throttled. Real-time
  equity quotes are a **bring-your-own-key** upgrade — the **Finnhub** adapter below — not this one.
- Company profile / fundamentals still come from their own sources (SEC EDGAR for statements);
  Stooq supplies prices only. Mock still serves equity prices when `stooq` isn't enabled.
- **Terms**: public EOD data via stooq.com — **review Stooq's terms before enabling for a
  commercial deployment** (same operator responsibility as Binance); attribution is recorded in
  provenance on every response.

## Finnhub provider (implemented — real-time equity quotes, bring-your-own-key)

`FinnhubProvider` is the **real-time** counterpart to Stooq: `quotes` + `batchQuotes` over the
Finnhub HTTP API, using **your own free API key**. Enabling it makes `Q` and watchlists show a live
last price instead of Stooq's end-of-day close. Because it needs a key, the provider refuses to
construct without one and the registry only enables it when `FINNHUB_API_KEY` is set.

```bash
TYCHE_PROVIDERS=finnhub,stooq,binance,frankfurter,dexscreener,gdelt,mock
FINNHUB_API_KEY="your-free-finnhub-key"   # https://finnhub.io/register
```

- **Registered before Stooq**, so a live quote wins over the EOD close for the same equity; history
  has **no** Finnhub capability (the free tier gates candles behind premium), so `GP`/`HP` honestly
  stay with the keyless EOD adapter. Without a key, `finnhub` is simply not registered and Stooq (or
  mock) serves quotes — nothing breaks.
- **`mode: user_supplied`, `tier: live`** — this is *your* licensed feed, never data Tyche bundles or
  resells. The key is sent **only** as the `token` request parameter and is never written into
  provenance or error messages (`sourceUrl` is the key-free `finnhub.io`).
- **Scoped by `servesSymbol`** to US equity tickers (`AAPL`, `SPY`, `BRK.B`); crypto pairs
  (`BTC-USDT` → Binance), FX pairs (`EUR-USD` → Frankfurter), and `^`-indices (→ Stooq/mock) keep
  routing elsewhere, so a key never forces those asset classes through Finnhub.
- Real-time snapshots cached ~10 s and throttled to the free tier's ~60 req/min; an all-zero
  response (unknown/never-printed symbol) is treated as no data, not a `0` price. It passes the
  conformance suite for `quotes`/`batchQuotes`.
- **Terms**: real-time US equity data on Finnhub's free tier — **review Finnhub's terms and your own
  entitlements before enabling**, especially for a commercial deployment; attribution is recorded in
  provenance on every response.

## FRED provider (implemented — `economicSeries`)

`FredProvider` is a **real, public** adapter for the `economicSeries` capability over the FRED
(Federal Reserve Economic Data) HTTP API. FRED requires a **free API key**, so the provider refuses
to construct without one and the registry only enables it when `FRED_API_KEY` is set.

```bash
TYCHE_PROVIDERS=fred
FRED_API_KEY="your-free-fred-api-key"
```

It fetches series metadata (cached 6h) and observations (cached 30m), maps them to the
`EconomicSeries` contract (FRED's `"."` missing-value marker → `null`), and politely rate-limits
requests. The **API key is sent only as a request parameter and is never written into provenance** —
`sourceUrl` points at the public, key-free `fred.stlouisfed.org/series/<id>` page. When `FRED_API_KEY`
is unset, **mock serves `economicSeries`**, so the app keeps working with no keys. Only
`economicSeries` is implemented; other capabilities fall through to other providers. It passes the
conformance suite for `economicSeries`.

## Optional provider scaffolds (disabled by default)

`Yahoo` and `Ccxt` ship as `StubProvider` subclasses. They declare **no live capabilities**
(so they never hijack a capability) and every method rejects with a clear "not implemented — see
DATA_PROVIDERS.md" error. Their descriptors document their *intended* capabilities:

| Scaffold    | Mode            | Intended capabilities                                   | Config                     |
| ----------- | --------------- | ------------------------------------------------------- | -------------------------- |
| `yahoo`     | `public`        | quotes, batchQuotes, historicalPrices, news             | verify terms of use        |
| `ccxt`      | `user_supplied` | crypto quotes, orderBook, trades, historicalPrices      | `CCXT_EXCHANGE` (+ keys)   |

Enable providers via `TYCHE_PROVIDERS` (comma-separated), e.g. `TYCHE_PROVIDERS=mock,secedgar`.
Until a scaffold is implemented it serves nothing, so capability resolution falls back to mock.

## Adding a provider

1. Implement `DataProvider` (or extend `StubProvider` and override the methods you support):

   ```ts
   export class MyProvider implements DataProvider {
     readonly descriptor: ProviderDescriptor = {
       name: 'myprovider',
       mode: 'paid',
       capabilities: { ...NO_CAPABILITIES, quotes: true, historicalPrices: true },
       freshness: [{ capability: 'quotes', tier: 'live', delaySeconds: 0 }],
       attribution: 'My Data Inc.',
       requiresConfiguration: true,
     };
     async getQuote(symbol: string): Promise<Envelope<Quote>> {
       const data = await fetchQuoteSomehow(symbol);
       return withProvenance(data, makeProvenance({
         provider: 'myprovider', providerMode: 'paid', capability: 'quotes', tier: 'live',
       }));
     }
     // …implement the rest of your declared capabilities…
   }
   ```

2. Register it in `instantiate()` in `packages/data-adapters/src/providerRegistry.ts`.
3. Validate it: `await checkProviderConformance(new MyProvider())` — fix any failed checks.
4. Enable it via `TYCHE_PROVIDERS`.

A provider that lacks a capability should **throw `CapabilityError`** rather than return empty data
silently — the API translates that into a graceful UI state.

## Caching

`CacheStore` is a small interface (`get`/`set`/`delete`/`clear` + `wrap`) with an in-memory
implementation. Swap in a Redis/file-backed store later without changing call sites.
