# TKT-046 — Corporate events calendar (EVT) + mock market-session realism

**Priority:** P2 (revamp)  ·  **Milestone:** Revamp Cycle 4  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md` / `command-taxonomy.md`: `EVT` (corporate events) was
  the last research-backed command category with no Tyche surface.
- Revamp review: the mock's `marketState` was always `'regular'` — quotes never reflected a session.

## Problem
"When does this company report?" had no answer inside the terminal, and the mock world had no clock.

## Technical design
The proven capability pattern, end to end:
- **Contract** (`contracts/events.ts`): `CorporateEvent` (earnings/dividend/split; date, status
  confirmed/estimated, epsEstimate/amount/ratio) + `EventsQuery` (symbol?, days ≤ 365). `events`
  added to `PROVIDER_CAPABILITY_KEYS` + `ProviderCapabilitiesSchema` (bidirectional sync test covers).
- **Provider plane**: `DataProvider.getEvents` + `StubProvider` default + conformance probe.
- **Mock**: deterministic per-symbol quarterly earnings cycle (91-day anchor from the seeded RNG, so
  any asOf date yields a stable calendar), ~60% of filers pay quarterly dividends, occasional
  historical splits; window = past 30d → next `days`. Crypto publishes nothing. Plus **market-session
  realism**: `marketState` derived from the UTC clock (weekends closed, 13:30–20:00 regular,
  pre/post around it; crypto 24/7).
- **API**: `GET /api/events?symbol&days` (validated, `serveCapability`). `apiClient.getEvents`.
- **Web**: `EVT` command (aliases `EVENTS`/`CAL`, gated on `events`, symbol optional) +
  `EventsModule`: 7/30/90-day window chips (persisted), typed badges (EPS/DIV/SPLIT), symbol
  click-through, past events dimmed, confirmed/estimated status. Facts only — no advice surface.

## Acceptance criteria
- [x] `AAPL EVT` lists that symbol's calendar; bare `EVT` covers the universe; window chips re-query.
- [x] Deterministic, schema-valid mock events; crypto yields none; degrades gracefully without a provider.
- [x] Quotes carry a clock-derived `marketState` (post at 20:00 UTC weekday; closed Sunday; crypto regular).
- [x] typecheck/test/build/e2e green.

## Clean-room notes
An events calendar is a generic category feature; the generator, contract, and module are original.

## Non-goals (later)
- Real events adapter (e.g. from EDGAR 8-K parsing); guidance/conference-call fields; watchlist scoping.
