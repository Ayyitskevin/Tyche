# TKT-015 — Time & sales streaming tape

**Priority:** P1  ·  **Milestone:** M6  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/command-taxonomy.md:63` — "**TAS** | market-data | ✓ | Time & sales: live trade-by-trade prints | confirmed / high" — the category benchmark this ticket targets.
- `docs/research/godel/command-taxonomy.md:77` — "**Streaming:** QM, FOCUS, WEI, TAS, OMON, N are real-time. [T1/T4]" — basis for a streamed (not poll-only) tape.
- `docs/research/godel/command-taxonomy.md:86` — TAS listed among ids Tyche already category-matches (built as an original module, never copied).
- Sources index: `docs/research/godel/sources.md` / `sources.csv` — all category-benchmark, T1/T4 video/docs observation only; no Gödel UI/copy reproduced.

## Problem
The `TAS` command (`packages/terminal-kernel/src/commands.ts`, id `TAS`, alias `TIMESALES`, `moduleId: 'time-and-sales'`, `requiredCapabilities: ['trades']`, maturity `beta`) is wired but has **no component**: `apps/web/src/modules/registry.ts` already lists `time-and-sales` in `STREAMING_MODULES`, yet `moduleComponents` (`components.ts`) has no entry, so it falls back to `BetaPlaceholder`. There is a one-shot REST path (`GET /api/trades/:symbol` in `routes/market.ts` → `provider.getTrades`, delayed tier) and a `TradePrint` contract (`packages/contracts/src/market.ts`), but no streaming surface: `QuoteStreamHub` (`apps/api/src/stream/hub.ts`) and `GET /api/stream/quotes` (`routes/stream.ts`) only emit `Quote` batches. A solo operator running `AAPL TAS` gets a placeholder, not a live, newest-on-top print tape.

## User story
As a solo operator/analyst, I want a live, newest-on-top time & sales tape for a symbol so that I can watch trade-by-trade prints (price, size, side, venue) stream in and gauge tape activity without leaving the terminal.

## Technical design
Contracts-first; capability model and SSE-only transport preserved; reuse `getTrades` baseline + a seeded walk (mirrors the quote hub).
1. **Stream contract (no new Zod type).** Stream the existing `TradePrint` (`market.ts`). Define a `TradeTick { prints: TradePrint[] }` interface alongside `QuoteTick` in `apps/api/src/stream/hub.ts` (TS interface, not a contract — same as `QuoteTick`).
2. **Hub.** Add `subscribeTrades(symbol, onTick)` to `QuoteStreamHub` (or a sibling `TradeStreamHub` in `stream/hub.ts`): on an interval (reuse `intervalMs`), pull a `getTrades(symbol)` baseline via `registry.forCapability('trades')`, then synthesize 0–N fresh prints per tick using `seededRng`/`gaussian`/`round`/`intInRange`/`pick` (already used by `MockProvider.getTrades`) so the demo "moves" deterministically. Best-effort: swallow transient provider errors, same as `emit()` today.
3. **SSE route.** Add `GET /api/stream/trades?symbol=AAPL` in `routes/stream.ts` following the `quotes` route exactly: validate `symbol` (400 `bad_request` if empty), write `text/event-stream` headers + `event: ready`, emit `event: trade` frames via the hub, 15s `event: ping` heartbeat, `reply.hijack()`, cleanup on `close`/`error`.
4. **Web hook.** Add `useTradeStream(symbol)` in `apps/web/src/providers/useTradeStream.ts`, modeled on `useQuoteStream.ts`: open an `EventSource` to `/api/stream/trades`, listen for `trade`, and maintain a bounded ring buffer (newest first, cap ~500 prints) so the tape never grows unbounded.
5. **Module.** Create `apps/web/src/modules/TimeAndSalesModule.tsx`. Seed initial prints from `useApiData(/api/trades/:symbol)` (provenance for the frame), then prepend live prints from `useTradeStream`. Render via the virtualized `DataTable` (`@tyche/ui`), newest on top, columns `time/price/size/side/venue` with side-toned price using `@tyche/ui` `format.ts`. Use `ModuleBody` for the render ladder and `useReportProvenance` to lift provenance. Register it in `components.ts` under `'time-and-sales'`.

## Affected packages / apps
- `apps/api` — `stream/hub.ts` (trade subscription + seeded walk), `routes/stream.ts` (`/api/stream/trades`). No new persistence; `routes/market.ts` `/api/trades/:symbol` unchanged.
- `apps/web` — new `providers/useTradeStream.ts`, new `modules/TimeAndSalesModule.tsx`, `modules/components.ts` (register `time-and-sales`). Reuses `useApiData`, `useElementSize`, `modules/common.tsx`. `registry.ts` already marks it streaming — no change.
- `packages/contracts` — none. `packages/data-adapters` — none (`getTrades` + `trades` capability already exist on `MockProvider`).
- `packages/ui` — reuse `DataTable`/states/`format.ts`; no change expected.

## Data contracts
No new/changed Zod types. The streamed payload is the existing `TradePrint`/`TradeSide` (`packages/contracts/src/market.ts`). `TradeTick`/`TradeStreamHub` are internal TS interfaces in `apps/api/src/stream/hub.ts`, deliberately not contracts (consistent with `QuoteTick`).

## Provider capabilities
Requires only `trades`. Satisfied by the deterministic `MockProvider` (`getTrades`, `trades: true`), so mock mode works with **no keys**. BYO providers that declare `trades` stream unchanged; the conformance harness already covers `getTrades` (`conformance.ts`). When `trades` is absent, the hub yields nothing and the module shows the capability `EmptyState` — never a crash.

## UI / module behavior
- Panel renders a virtualized print tape, newest on top; row count bounded by the ring buffer; price toned by `side` (buy/sell/unknown).
- No symbol → `SymbolRequired` (from `common.tsx`). Capability gap → capability `EmptyState` via `ModuleBody`. Seed fetch error → `ErrorState` with retry. Empty tape → `EmptyState` ("No prints yet.").
- Provenance/freshness: seed envelope is `delayed` (delaySeconds 900) — `ProvenanceBadge`/`FreshnessBadge` in the panel frame reflect it via `useReportProvenance`; the tape never falsely claims real-time for the `mock` tier.

## Testing plan
- Unit (`apps/api/src/stream/hub.test.ts`): `subscribeTrades` emits `TradePrint`-shaped ticks, stops on unsubscribe, swallows provider errors; deterministic under a fixed clock.
- API (`apps/api/src/routes/stream.test.ts`): `/api/stream/trades` 400s on missing `symbol`, sets SSE headers, emits `ready` then `trade` frames, cleans up on close.
- Unit (`apps/web/src/providers/useTradeStream.test.ts`): ring buffer prepends newest-first and caps length; ignores malformed frames.
- Component (`apps/web/src/modules/TimeAndSalesModule.test.tsx`, RTL): seed + live prints render newest-on-top; capability-gap / empty / error states via `ModuleBody`; provenance lifted.
- e2e (`apps/web` Playwright): `AAPL TAS` opens the tape against mock; prints render newest-on-top and the panel survives a sustained stream without jank.

## Acceptance criteria
- [ ] `GET /api/stream/trades?symbol=…` streams `event: trade` frames of `TradePrint[]` (SSE, heartbeat, hijack, cleanup) and 400s on missing `symbol`.
- [ ] `QuoteStreamHub`/`TradeStreamHub` exposes a trades subscription that seeds from `getTrades` and applies a deterministic seeded walk; transient errors are swallowed.
- [ ] `TimeAndSalesModule` is registered in `components.ts` under `time-and-sales` (no more `BetaPlaceholder` for `TAS`) and renders a virtualized newest-on-top tape via `DataTable`.
- [ ] `useTradeStream` bounds the buffer (newest-first, capped) and ignores malformed frames; no unbounded growth.
- [ ] Capability gap / no-symbol / empty / error states render gracefully via `ModuleBody`; mock mode works with no keys; provenance shown, no false "live" on `mock`.
- [ ] No changes to `TradePrint`/`TradeSide` Zod contracts or to provider interfaces.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`TradePrint`/`TradeSide` in `market.ts`), the existing `QuoteStreamHub`/SSE pattern, `DataProvider.getTrades`/`MockProvider`, and Tyche components (`DataTable`, `EmptyState`/`ErrorState`, `ProvenanceBadge`/`FreshnessBadge`). A streaming time-&-sales tape is a standard market-data category feature; research is category-benchmark only. No Gödel Terminal UI, copy, code, column layout, or documentation is reproduced.

## Non-goals
- Order book / depth-of-market (`getOrderBook` exists but is a separate module).
- Real paid/consolidated trade feeds, per-venue routing, or sub-second tick fidelity (mock-mode seeded walk only).
- Tape filters (min size, side, venue), trade-condition codes, or VWAP/aggregation analytics (future ticket).
- WebSocket transport (SSE-only by foundation constraint); any change to `Quote` streaming.
- Order placement, alerts, or advice — out of scope by foundation constraint.
