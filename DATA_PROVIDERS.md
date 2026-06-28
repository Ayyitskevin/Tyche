# Data providers

Tyche is **provider-agnostic**. Modules never talk to a provider directly — they declare the
*capabilities* they need, and a provider that supplies those capabilities is resolved at runtime.
The foundation ships one fully-working provider (mock) and four disabled scaffolds.

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
  capabilities: { quotes: true, batchQuotes: true, historicalPrices: true, /* …18 flags… */ },
  freshness: [{ capability: 'quotes', tier: 'delayed', delaySeconds: 900 }],
  attribution?: string,
  attributionRequired?: boolean,
  rateLimit?: { requestsPerMinute, requestsPerDay, burst },
  requiresConfiguration: boolean,
}
```

The 18 capabilities: `quotes`, `batchQuotes`, `historicalPrices`, `intradayPrices`, `trades`,
`orderBook`, `news`, `filings`, `fundamentals`, `estimates`, `analystRatings`, `ownership`,
`options`, `fx`, `crypto`, `futures`, `bonds`, `portfolio`.

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
`news`, `filings`, `fundamentals`, `estimates`, `analystRatings`, `ownership`, `options`, `crypto`.
It does **not** supply `fx`, `futures`, `bonds`, or `portfolio` — so those modules demonstrate the
graceful capability-gap state.

### Conformance

`checkProviderConformance(provider)` calls every method the provider declares and validates each
envelope against the contract schema. The mock provider passes the full suite (see
`MockProvider.test.ts`). Run the same check against your own provider to guarantee it honors its
declared capabilities.

## Optional provider scaffolds (disabled by default)

`Yahoo`, `SecEdgar`, `Fred`, and `Ccxt` ship as `StubProvider` subclasses. They declare **no live
capabilities** (so they never hijack a capability) and every method rejects with a clear "not
implemented — see DATA_PROVIDERS.md" error. Their descriptors document their *intended* capabilities:

| Stub        | Mode            | Intended capabilities                                   | Config                     |
| ----------- | --------------- | ------------------------------------------------------- | -------------------------- |
| `yahoo`     | `public`        | quotes, batchQuotes, historicalPrices, news             | verify terms of use        |
| `secedgar`  | `public`        | filings, fundamentals (XBRL company facts)              | `SEC_EDGAR_USER_AGENT`     |
| `fred`      | `public`        | macro/economic series                                   | `FRED_API_KEY`             |
| `ccxt`      | `user_supplied` | crypto quotes, orderBook, trades, historicalPrices      | `CCXT_EXCHANGE` (+ keys)   |

Enable providers via `TYCHE_PROVIDERS` (comma-separated), e.g. `TYCHE_PROVIDERS=mock,secedgar`.
Until a stub is implemented it serves nothing, so capability resolution falls back to mock.

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
