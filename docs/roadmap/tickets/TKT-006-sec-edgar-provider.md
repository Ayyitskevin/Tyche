# TKT-006 — Real SEC EDGAR provider (filings)

**Priority:** P1  ·  **Milestone:** M2  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/command-taxonomy.md:53` — "CF | fundamentals | ✓ | SEC filings via EDGAR (from inception, real-time, direct links): 10-K/Q, 8-K, S-1, proxies, 13F" (category-benchmark for a filings index command).
- `docs/research/godel/tyche-gap-analysis.md:34` — roadmap row "Real SEC EDGAR adapter (replace mock CF) … `data-adapters` (new SecEdgarProvider impl), `api` … filings (public, UA header) … M2 / `sec-edgar-provider`"; `:85` — "the real competitive unlock is one real adapter … SEC EDGAR (public, no key) … highest-leverage P1."
- https://godelterminal.com/docs/commands/fa — competitor's fundamentals/filings command (benchmark only; no copy reproduced).
- https://godeldiscount.com/data-coverage — competitor data-coverage page (benchmark only; informs that EDGAR is the public, key-free source).
- Sources index: `docs/research/godel/sources.md` / `sources.csv` (all category-benchmark, T1 video/docs observation).

## Problem
Filings (`CF` command, capability `filings`) are served only by the deterministic `MockProvider`. The real EDGAR adapter ships as a disabled scaffold (`packages/data-adapters/src/stubs/SecEdgarProvider.ts`, `capabilities: { ...NO_CAPABILITIES }`). A solo operator cannot pull a real issuer's actual filing history. SEC EDGAR is public and key-free (it only requires a descriptive `User-Agent` per the SEC fair-access policy), making it the highest-leverage first real adapter.

## User story
As a solo operator/analyst, I want `AAPL CF` to return Apple's real 10-K/10-Q/8-K/proxy history with direct EDGAR document links so that I can research an issuer's actual filings instead of synthetic placeholders — while mock mode still works with no configuration.

## Technical design
Contracts-first; capability-model preserved. The existing `Filing`/`FilingDocument` Zod contracts (`packages/contracts/src/filings.ts`) already fit EDGAR data, so no contract changes are expected.
1. Promote the scaffold to a concrete provider in `packages/data-adapters/src/stubs/SecEdgarProvider.ts` (keep path, or move to `src/SecEdgarProvider.ts`). Extend `StubProvider` so all non-filings methods still throw `ProviderError` (graceful capability gaps). Set `descriptor.capabilities = { ...NO_CAPABILITIES, filings: true }`, `mode: 'public'`, `name: 'secedgar'`, `requiresConfiguration: true`.
2. Constructor takes `{ userAgent: string; cache?: CacheStore; fetchImpl?: typeof fetch }`. `userAgent` is mandatory; if absent the registry must not enable the provider (so mock remains the filings source).
3. Implement `getFilings(symbol, limit = 20)`:
   - Resolve the ticker to a CIK via the EDGAR ticker map (`https://www.sec.gov/files/company_tickers.json`), cached in `MemoryCache` (long TTL, e.g. 24h). Zero-pad CIK to 10 digits.
   - Fetch `https://data.sec.gov/submissions/CIK{cik10}.json`; map the parallel-array `recent` block to `Filing[]` (form → `form`, filingDate → `filedAt` via `IsoDateTime`, reportDate → `periodOfReport`, accessionNumber → `accessionNumber`, primaryDocument → `documents[0].url` and `url`). Build the archive URL from accession + `primaryDocument`. Cache submissions response (TTL ~15m) keyed by CIK.
   - Sort by `filedAt` desc, slice to `limit`. Unknown ticker → resolve to empty `Filing[]` (graceful), not a throw.
4. Polite rate-limit: serialize EDGAR calls behind a small queue/min-interval (~10 req/s ceiling, conservative) and always send the `User-Agent` header. On non-2xx/429, throw `ProviderError` (route maps to a 502 graceful payload).
5. Wrap every envelope with `DataProvenance` via `withProvenance`: `provider: 'secedgar'`, `providerMode: 'public'`, `capability: 'filings'`, `freshness.tier: 'eod'`, `sourceUrl` set to the EDGAR submissions URL, `attribution: 'U.S. Securities and Exchange Commission — EDGAR'`, `cacheHit` reflecting the cache.
6. Registry wiring (`packages/data-adapters/src/providerRegistry.ts`): in `instantiate`, the `'sec'`/`'secedgar'` cases construct the real provider only when a user-agent is available (read from `ProviderRegistryConfig`, threaded from `apps/api/src/env.ts` `SEC_EDGAR_USER_AGENT`); otherwise return `null` so the always-present mock fallback serves filings. Because `forCapability` returns the first registrant, EDGAR must be registered before the mock fallback to win `filings`.
7. `apps/api/src/env.ts`: read `TYCHE_PROVIDERS` (already parsed) and `SEC_EDGAR_USER_AGENT`; pass both into `createProviderRegistry` in `apps/api/src/context.ts`.

## Affected packages / apps
- `packages/data-adapters` — real `SecEdgarProvider`, `providerRegistry.ts` wiring, uses existing `cache.ts`/`Provider.ts`/`conformance.ts`.
- `apps/api` — `env.ts` (`SEC_EDGAR_USER_AGENT`), `context.ts` (thread UA + providers into `createProviderRegistry`). No route changes (`routes/research.ts` `/api/filings/:symbol` already calls `serveCapability(..., 'filings', ...)`).
- `apps/web` — none; `filings` module renders whatever the API returns.
- Docs — `.env.example` / `DATA_PROVIDERS.md` note that `SEC_EDGAR_USER_AGENT` is now read (coordinate with TKT-004).

## Data contracts
None expected. `Filing`/`FilingDocument` (`packages/contracts/src/filings.ts`) already cover form, `filedAt`, `periodOfReport`, `accessionNumber`, `url`, and `documents[]`. If EDGAR exposes a field worth surfacing (e.g. `items` on 8-K), add it as an optional field on `FilingSchema` — additive only, never breaking.

## Provider capabilities
Requires only `filings`. BYO/public mode: no API key, but a descriptive `SEC_EDGAR_USER_AGENT` is mandatory (SEC fair-access). When unset/disabled, `MockProvider` continues to serve `filings` so mock-mode works with zero config.

## UI / module behavior
The `filings` module (`apps/web/src/modules/filings.tsx`, opened by `CF`/`FILINGS`/`FIL`) is unchanged. Empty list (unknown/no-filings issuer) → `EmptyState`; provider/network failure → `ErrorState` from the 502 payload; if no filings-capable provider is enabled → `capability_unavailable` graceful `EmptyState` (never crash). `ProvenanceBadge`/`FreshnessBadge` show `secedgar` / `public` / `eod` and link `sourceUrl` to EDGAR.

## Testing plan
- Unit (`packages/data-adapters/src/SecEdgarProvider.test.ts`): inject a fake `fetchImpl` returning fixture `company_tickers.json` + `submissions/CIK*.json`; assert ticker→CIK resolution, `Filing[]` mapping (forms, ISO dates, accession, archive URLs), `limit`, desc sort, provenance fields, and unknown-ticker → empty (no throw). Assert `User-Agent` header is always sent and calls are rate-limited/serialized. Assert cache hit sets `provenance.cacheHit`.
- Contract (`conformance.test.ts`): `checkProviderConformance(new SecEdgarProvider({ userAgent, fetchImpl: fixture }))` reports `ok: true` for `filings` (envelope validates `envelope(z.array(FilingSchema))` per `conformance.ts:60`).
- Registry (`providerRegistry.test.ts`): `providers: ['secedgar']` with UA registers the real provider ahead of mock and wins `forCapability('filings')`; without UA, mock serves filings.
- API (`apps/api/src/routes/research.test.ts`): `GET /api/filings/:symbol` with a stub EDGAR provider returns `{ data, provenance }`; with no UA returns mock-backed filings.
- e2e (`apps/web` Playwright): `AAPL CF` opens the filings panel and renders rows (against mock by default — no network in e2e).

## Acceptance criteria
- [ ] `SecEdgarProvider` declares `filings: true`, `mode: 'public'`, `name: 'secedgar'`; all other capabilities still throw `ProviderError`.
- [ ] `getFilings` returns real EDGAR-shaped `Filing[]` (validates `FilingSchema`) with provenance `provider: secedgar`, `providerMode: public`, `capability: filings`, `sourceUrl` set.
- [ ] Every EDGAR request sends `SEC_EDGAR_USER_AGENT`; requests are rate-limited/serialized and cached via `MemoryCache`.
- [ ] `checkProviderConformance` passes for `filings`.
- [ ] Enabled via `TYCHE_PROVIDERS=secedgar` + `SEC_EDGAR_USER_AGENT`; when unset/disabled, mock serves filings and the app works with no keys.
- [ ] Unknown ticker → empty list (graceful), provider/network error → 502 graceful payload; no crash.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation derived solely from Tyche's own contracts (`filings.ts`, `provenance.ts`), `Provider`/`StubProvider`, `providerRegistry`, `cache`, and `conformance`, plus the SEC's public EDGAR HTTP API. Competitive research is category-benchmark only (a filings-index command is a standard terminal feature); no Gödel Terminal UI, copy, code, or documentation is reproduced. Filing data and document links come directly from the public SEC EDGAR API.

## Non-goals
- No XBRL/company-facts parsing or `fundamentals` capability (separate ticket; this provider serves only `filings`).
- No filing full-text search or document rendering/viewer (see TKT roadmap `filing-viewer`, `apps/web` modules).
- No 13F holder extraction into `ownership` (separate adapter concern).
- No paid/real-time feeds; EDGAR public tier (`eod` freshness) only.
- No persistence of fetched filings beyond the in-memory cache.
