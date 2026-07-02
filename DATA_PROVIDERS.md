# Data providers

Tyche is **provider-agnostic**. Modules never talk to a provider directly — they declare the
*capabilities* they need, and a provider that supplies those capabilities is resolved at runtime.
Tyche ships the deterministic mock provider, three real public adapters — **SEC EDGAR**
(`filings`), **FRED** (`economicSeries`), and **Binance** (crypto quotes/candles/trades/order
book/funding) — and two disabled scaffolds (`yahoo`, `ccxt`).

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

The 23 capabilities: `quotes`, `batchQuotes`, `historicalPrices`, `intradayPrices`, `trades`,
`orderBook`, `news`, `filings`, `fundamentals`, `estimates`, `analystRatings`, `ownership`,
`options`, `fx`, `crypto`, `futures`, `bonds`, `portfolio`, `screener`, `economicSeries`, `events`,
`fundingRates`, `membership`.

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
