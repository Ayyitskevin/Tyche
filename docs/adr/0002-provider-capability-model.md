# 0002 — Provider capability model

- Status: Accepted
- Date: 2026-06-28

## Context

Tyche must be **data-provider agnostic**: mock by default, with optional public/paid/enterprise/
user-supplied adapters. Different providers cover different data kinds (one has quotes + history,
another has filings, another crypto order books). Modules need data without knowing *which* provider
supplies it, and the product must degrade gracefully when a needed data kind isn't available —
never crash.

## Decision

Introduce an explicit **capability model**:

- A fixed set of 18 capabilities (`quotes`, `batchQuotes`, `historicalPrices`, `intradayPrices`,
  `trades`, `orderBook`, `news`, `filings`, `fundamentals`, `estimates`, `analystRatings`,
  `ownership`, `options`, `fx`, `crypto`, `futures`, `bonds`, `portfolio`).
- Each provider publishes a `ProviderDescriptor` declaring its `mode`, the capabilities it supports,
  known freshness guarantees, attribution requirements, and rate limits.
- Each module/command declares `requiredCapabilities`.
- A `ProviderRegistry` resolves a capability to a provider (`forCapability`) and aggregates the union
  of capabilities across enabled providers. The mock provider is always registered as a fallback.
- Every provider method returns `Envelope<T> = { data, provenance }`; provenance includes a freshness
  tier (`live`/`delayed`/`eod`/`historical`/`mock`/`unknown`). The API and UI surface it everywhere.
- Capability gaps are computed (not thrown): the kernel attaches `missingCapabilities` to the
  open-panel effect, the API returns a structured `capability_unavailable` payload, and the UI shows
  an `EmptyState` naming the missing capability.
- A reusable **conformance suite** validates that a provider honors every capability it declares,
  checking each envelope against the contract schema.

## Consequences

- Adding a provider is mechanical and verifiable: implement `DataProvider`, declare capabilities,
  pass conformance.
- The UI can explain itself ("needs `options`") instead of failing, which is essential when many
  providers are partial.
- Provenance/freshness is a first-class, non-optional part of the data path — important for a
  research tool and for honest labeling of synthetic vs. licensed data.
- We pay the cost of a broad, sometimes-unused capability enum and an envelope wrapper on every call;
  worth it for the gating and inspectability it buys.
