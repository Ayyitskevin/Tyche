# TKT-012 — News filters + global TOP feed

**Priority:** P1  ·  **Milestone:** M5  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Dossier: `docs/research/godel/workflow-teardown.md` §4 "News filtering & speed" — public pattern says `N` is "filterable by source, language, ticker, keyword, and date" and `TOP` is "a global headline feed". The Tyche translation names the exact gaps ("**filters** (source/keyword/date), **watchlist-scoped** feeds, a **global TOP** feed") and the ticket id `news-filters` (this ticket). Category-benchmark only; no UI/copy reproduced.
- Dossier: `docs/research/godel/workflow-teardown.md` §13 "Press-release / news-speed workflow" — Tyche deliberately will **not** make latency-edge claims; instead it exposes **freshness/age** per item. This ticket follows that by surfacing per-item source + relative age (provenance), not a speed claim.
- Sources: `docs/research/godel/sources.md` — T1 official command docs hub and the X changelog entry "news watchlist filtering" frame filtering as a feature *class* only; the filter UI, query shape, and `TOP` module here are Tyche-original.

## Problem
`NewsModule` (`apps/web/src/modules/NewsModule.tsx`) only takes an optional `symbol` and renders a flat list — no way to narrow by source, keyword, date, or to scope to a watchlist, and no global headline feed for a no-symbol board. The plumbing already half-exists: `NewsQuery` (`packages/data-adapters/src/Provider.ts`) has only `{ symbol, query, limit }`, `/api/news` (`apps/api/src/routes/research.ts`) only reads `symbol` and `q`, and `MockProvider.getNews` already produces multi-symbol, sourced, timestamped items it could filter against. A solo operator can't say "show me only Reuters items mentioning 'guidance' in the last 24h across my watchlist," nor open a single always-on TOP tape.

## User story
As a solo operator, I want to filter news by source, keyword, and date range, scope it to a watchlist, and open a global TOP feed with no symbol, so that I can triage the tape for what matters without one symbol at a time.

## Technical design
Contracts-first, capability-respecting. The `news` capability already gates everything; this widens the query and adds one module + one command.
1. Extend the news query contract in `packages/contracts/src/news.ts`: add `NewsQuerySchema = z.object({ symbol, symbols, source, keyword, since, until, watchlistId, limit })` — all optional, `since`/`until` as `IsoDateTime`, `symbols` as `z.array(z.string())`. Export `NewsQuery = z.infer<...>`. This becomes the single source of truth.
2. Widen the adapter `NewsQuery` interface (`packages/data-adapters/src/Provider.ts`) to match the new fields. Update `MockProvider.getNews` (`packages/data-adapters/src/MockProvider.ts`) to: expand `symbols` (or all `SEED_SYMBOLS` when none given → that is the global TOP feed), then post-filter the generated items by `source` (case-insensitive equals), `keyword` (substring over headline+summary), and `since`/`until` against `publishedAt`. Keep deterministic ordering + `slice(limit)`. `StubProvider.getNews` keeps returning `[]`.
3. `apps/api/src/routes/research.ts` `/api/news`: parse `symbol, q, source, keyword, since, until, watchlistId, limit` from query, validate with `NewsQuerySchema.safeParse`, and when `watchlistId` is present resolve it to `symbols` via `ctx.persistence` watchlists before calling `p.getNews(...)` through the existing `serveCapability('news', ...)` path (provenance preserved).
4. `apps/web/src/providers/apiClient.ts`: extend `getNews` opts to carry the new params through `qs(...)` (currently only `symbol`/`q`).
5. Add a `TOP` command in `packages/terminal-kernel/src/commands.ts` (`moduleId: 'top-news'`, `requiredCapabilities: ['news']`, `maturity: 'stable'`, examples `['TOP']`, no symbol). Modules derive from `DEFAULT_COMMANDS` via `apps/web/src/modules/registry.ts`, so registering the component in `apps/web/src/modules/components.ts` (`'top-news': TopNewsModule`) wires it automatically.
6. `NewsModule` gains a filter bar (source `<select>` from item sources, keyword input, date-range, watchlist `<select>` from `api.getWatchlists()`); `TopNewsModule` is a thin no-symbol wrapper that always queries the global feed with the same filter bar. Both reuse the existing list rendering and `useReportProvenance`.

## Affected packages / apps
- `packages/contracts` — `src/news.ts` (new `NewsQuerySchema`/`NewsQuery`).
- `packages/data-adapters` — `src/Provider.ts` (widen `NewsQuery`), `src/MockProvider.ts` (`getNews` filtering + global feed).
- `apps/api` — `src/routes/research.ts` (`/api/news` parse/validate + watchlist→symbols resolution).
- `apps/web` — `src/providers/apiClient.ts` (`getNews` params), `src/modules/NewsModule.tsx` (filter bar), new `src/modules/TopNewsModule.tsx`, `src/modules/components.ts` (register `top-news`).
- `packages/terminal-kernel` — `src/commands.ts` (new `TOP` command).

## Data contracts
New: `NewsQuerySchema` in `packages/contracts/src/news.ts` with optional `symbol`, `symbols: z.array(z.string()).optional()`, `source`, `keyword`, `since: IsoDateTime.optional()`, `until: IsoDateTime.optional()`, `watchlistId`, `limit: z.number().int().positive().optional()`; `NewsQuery = z.infer`. `NewsItemSchema` is unchanged. The adapter `NewsQuery` interface is widened to mirror these fields (keeping `query`/`q` alias for backward compatibility).

## Provider capabilities
Required: `news` (already gates `N`; `MockProvider` returns news). The new `TOP` command and `TopNewsModule` also require only `news`. No new capability key is added. Works in **mock mode with no keys** (global feed = all `SEED_SYMBOLS`); BYO providers may ignore unsupported filter fields and still satisfy the contract.

## UI / module behavior
- Filter bar (original Tyche chrome): source dropdown (populated from returned items + "All"), keyword text input (debounced), since/until date inputs, and a watchlist dropdown (from `api.getWatchlists()`). Changing any control re-queries via `useApiData` deps.
- `TOP` opens `TopNewsModule` with no symbol → global feed; `N` keeps symbol scope when launched as `AAPL N`, or behaves as the general tape when launched bare (`N`).
- Empty/error/capability-gap: filters that match nothing → existing `EmptyState` ("No headlines."); `news` capability missing → existing `missingCapabilities` gap state (never crashes); a deleted/empty `watchlistId` → empty result, no crash.
- Provenance: each item already shows `source` + `formatRelativeTime(publishedAt)`; `useReportProvenance(reportProvenance, news.provenance)` continues to report the `news` envelope provenance to the panel frame — no latency/speed claims made.

## Testing plan
- Contract (`packages/contracts/src/news.test.ts`): `NewsQuerySchema` parses full + empty payloads; rejects bad `since`/`until`; `symbols` array round-trips.
- Unit (`packages/data-adapters/src/MockProvider.test.ts`): `getNews` filters by `source`, `keyword`, and date window; no-symbol query returns multi-symbol global feed; `limit` honored; deterministic order stable.
- API (`apps/api` research route tests): `/api/news` honors `source`/`keyword`/`since`/`until`; `watchlistId` resolves to that list's symbols; response keeps its provenance envelope; capability-gap path returns the graceful gap shape.
- Unit (`apps/web/src/modules/NewsModule.test.tsx`, `TopNewsModule.test.tsx`): filter changes re-query; `TopNewsModule` queries with no symbol; empty/gap states render.
- e2e (`apps/web` Playwright, news flow): `TOP` opens a global feed; apply a source + keyword filter; scope to a watchlist; assert list narrows and no crash.

## Acceptance criteria
- [ ] `NewsQuerySchema`/`NewsQuery` added to `packages/contracts/src/news.ts`; adapter `NewsQuery` widened to match; `NewsItemSchema` unchanged.
- [ ] `MockProvider.getNews` filters by source/keyword/date and returns a multi-symbol global feed when no symbol is given.
- [ ] `/api/news` parses + validates the new params and resolves `watchlistId` to symbols, all behind `serveCapability('news', ...)` with provenance intact.
- [ ] New `TOP` command (`moduleId: 'top-news'`, requires `news`) renders `TopNewsModule`; `NewsModule` gains a working filter bar; both show graceful empty/gap states.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are all green.

## Clean-room notes
Original implementation built solely from Tyche's own `news.ts`, `Provider.ts`, `MockProvider.ts`, `research.ts`, `NewsModule.tsx`, `apiClient.ts`, and `commands.ts`. "News filtering" and a "global TOP feed" are treated as feature *categories* benchmarked from public descriptions only; no Gödel Terminal UI, layout, filter design, copy, or command-doc text is reproduced. Per dossier §13, Tyche makes no latency/speed-edge claims; it surfaces per-item source + age (provenance) instead.

## Non-goals
- No language filter and no real-time push for news (the SSE hub stays quotes/trades); refresh stays request-driven.
- No latency/"beat the market by N seconds" framing or claim (deliberate compliance + honesty stance).
- No keyword alerting here (that is the separate `alert-rules` ticket) and no new provider capability key.
- No order placement and no personalized advice; the feed is read-only headlines.
