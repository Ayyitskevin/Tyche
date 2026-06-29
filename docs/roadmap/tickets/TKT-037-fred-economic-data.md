# TKT-037 — Real FRED economic-data adapter + `ECO` command

**Priority:** P3  ·  **Milestone:** M15  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md`, cross-cutting note #4: *"The real competitive unlock is
  one real adapter."* SEC EDGAR was the first; FRED is the second.
- Economic/macro series (`ECO`-class) is a generic public-data category; benchmarked only at the
  category level. FRED is a free, public, no-login U.S. government data source.

## Problem
Until now the only **real** provider was SEC EDGAR (`filings`); everything else ran on the synthetic
mock. A second real adapter proves the bring-your-own-provider model end-to-end against a genuinely
free source, and exercises the key-gated entitlement path (FRED needs a free API key).

## Technical design
A new `economicSeries` capability threaded through the whole stack, plus a real FRED adapter:
- **Contract** (`packages/contracts/src/economics.ts`): `EconomicSeries` (id, title, units, frequency,
  observations…), `EconomicObservation` (date, nullable value), `EconomicSeriesQuery` (start/end/limit).
  `economicSeries` added to `PROVIDER_CAPABILITY_KEYS` + `ProviderCapabilitiesSchema`; registered in
  `Schemas`.
- **Provider plane**: `DataProvider.getEconomicSeries(seriesId, query)` + `StubProvider` default;
  conformance probe (`getEconomicSeries('GDP')` → `EconomicSeries`); `MockProvider` gains
  `economicSeries: true` with a small synthetic catalog (GDP/CPI/UNRATE/FEDFUNDS/DGS10) + a synthetic
  fallback for any id.
- **Real `FredProvider`** (replaces the scaffold): fetches FRED `series` (metadata) + `series/observations`,
  maps `"."` → `null`, caches + politely throttles, refuses to construct without `FRED_API_KEY`, and
  **never writes the API key into provenance** (`sourceUrl` is the public key-free series page). Registry
  gates it on `FRED_API_KEY` (mirrors the SEC `SEC_EDGAR_USER_AGENT` gate); falls back to mock otherwise.
- **API**: `GET /api/economics/:seriesId?start&end&limit` (validates the query, `serveCapability`).
- **Web**: `apiClient.getEconomicSeries`; `ECO` command (aliases `ECON`/`MACRO`, `moduleId: economics`,
  `requiredCapabilities: ['economicSeries']`, stable); `EconomicsModule` — preset chips + free-form
  series-id input + range (5y/10y/max), a line chart (reuses the M14 `AdvancedChart`) and a recent-values
  table, all persisted on panel state.

## Acceptance criteria
- [x] `economicSeries` capability flows through contracts → provider → mock → conformance → registry → route → client → command → module.
- [x] Real FRED adapter maps series + observations, gates on `FRED_API_KEY`, and never leaks the key in provenance.
- [x] `ECO GDP` / `ECON UNRATE` open a chart + table; the panel degrades to the capability-gap state without a provider.
- [x] No order/advice surface. typecheck / test / build / e2e green; passes conformance.

## Clean-room notes
FRED is a free, public, no-login U.S. government API; only documented public endpoints are used. The
adapter, contract, and module are original. No competitor UI/copy/private API is reproduced, and no
licensed/proprietary data is bundled (FRED data is public domain; attribution is carried in provenance).

## Non-goals (later)
- FRED series **search** (a second capability); release/category browsing; multi-series overlay.
- Vintage/ALFRED revisions; configurable transforms (YoY %, index rebasing) beyond the raw series.
