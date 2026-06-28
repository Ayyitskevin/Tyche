# TKT-013 — Alert rules evaluated on the quote stream

**Priority:** P1  ·  **Milestone:** M5  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md:41` — P1 row "**Alert rules** (rule eval on stream) | alerts-adjacent | `contracts/alerts`, `api/stream`, `apps/web` | quotes/news | M | M5 / `alert-rules`" — the named gap for this ticket.
- `docs/research/godel/competitive-feature-matrix.md:30` — "Alerts | (BROK-adjacent) | 🟡 stub | rule eval vs stream | quotes/news | stream | P2 | M | Low | rules engine on SSE | M5".
- `docs/research/godel/competitive-feature-matrix.md:66` — "news filters + alerts (M5)" listed among the biggest credible-competitor gaps.
- Sources index: `docs/research/godel/sources.md` / `sources.csv` — alerts is a category-benchmark (rule-on-stream) feature; all observation is T1/T3 category-level, no Gödel UI/copy reproduced.

## Problem
`AlertRuleSchema` already exists in `packages/contracts/src/alerts.ts` (`symbol/field/operator/threshold/active/oneShot/note/lastTriggeredAt`), and `PersistedState.alerts: AlertRule[]` is declared in `apps/api/src/persistence/types.ts`, but nothing evaluates rules: the `PersistenceStore` interface has no alert CRUD methods, `FilePersistence` only seeds `alerts: []`, the `QuoteStreamHub` (`apps/api/src/stream/hub.ts`) emits jittered ticks with zero rule logic, and the `ALERT` command (`moduleId: 'alerts'`, `packages/terminal-kernel/src/commands.ts:309`) renders `BetaPlaceholder`. A solo operator cannot set "tell me when AAPL crosses 200" and be notified — the single most-expected monitoring primitive is a stub.

## User story
As a solo operator/analyst, I want to define price/change/volume alert rules and have them evaluated server-side against the live quote stream so that I am notified the moment a rule fires — without watching every panel and without any order being placed.

## Technical design
Contracts-first; capability model preserved; SSE reuse intact; no advice, no execution.
1. **Persistence CRUD.** Extend `PersistenceStore` (`apps/api/src/persistence/types.ts`) with `listAlerts()/saveAlert(rule)/deleteAlert(id)` and implement in `FilePersistence.ts` (parse-validate via `AlertRuleSchema` on read, same pattern as notes/watchlists). `PersistedState.alerts` already exists — no shape change.
2. **REST routes.** In `apps/api/src/routes/user.ts` add `GET /api/alerts`, `POST /api/alerts` (validate body with `AlertRuleSchema`, server-assigns `id`/`createdAt`), `DELETE /api/alerts/:id`, mirroring the existing notes endpoints. Wrap reads in `localProvenance` (`routes/helpers.ts`) so every response is an `Envelope {data, provenance}`.
3. **Rule engine.** Add `apps/api/src/stream/alertEngine.ts` exporting a pure `evaluateRule(rule, quote, prev?) → boolean` over `AlertField`/`AlertOperator`. `gt/gte/lt/lte` compare the selected field (`price`→`quote.price`, `changePercent`→`quote.changePercent`, `volume`→`quote.volume`) to `threshold`; `crosses_above/crosses_below` require the previous tick's value (engine keeps a `Map<ruleId, number>` of last-seen field values per subscription). Pure + table-driven so it is unit-testable with no I/O.
4. **Wire into the hub.** Give `QuoteStreamHub.subscribe` an optional alert callback, or add a sibling `subscribeAlerts(symbols, rules, onFire)` that reuses the same poll loop in `hub.ts`: on each tick, for each active rule whose `symbol` is in the batch, call `evaluateRule`; on a fire emit `{ rule, quote, firedAt }`, set `lastTriggeredAt`, and if `oneShot` flip `active=false` (persist via `saveAlert`). Best-effort error handling matches the existing `try/catch` in `hub.ts`.
5. **SSE delivery.** In `apps/api/src/routes/stream.ts` add an `event: alert` frame on the existing `/api/stream/quotes` connection (rules loaded from `ctx.persistence.listAlerts()` for the subscribed symbols), so no new socket is opened. News-field alerts are out of scope for v1 wiring but the engine + contract stay news-extensible (see Provider capabilities).
6. **Web module + notifications.** Replace the `alerts` `BetaPlaceholder` with `apps/web/src/modules/AlertsModule.tsx`: list/add/toggle/delete rules via `apiClient`, capability-gated through `ModuleBody`. A new `providers/useAlertStream.ts` consumes `event: alert` from the SSE connection and calls `terminalStore.pushMessage('warn', …)` so fires surface in the existing `StatusBar` notifications channel (and a small in-panel "recent fires" list). Row-add for the active instrument from `AAPL ALERT`.

## Affected packages / apps
- `apps/api` — `persistence/types.ts` + `FilePersistence.ts` (alert CRUD), `routes/user.ts` (`/api/alerts`), new `stream/alertEngine.ts`, `stream/hub.ts` (rule eval on tick), `routes/stream.ts` (`event: alert`).
- `apps/web` — new `modules/AlertsModule.tsx`, `modules/components.ts` (register `alerts`), new `providers/useAlertStream.ts`; reuses `state/terminalStore.ts` (`pushMessage`) and `app/StatusBar.tsx` (no change needed; it already renders the latest message).
- `packages/contracts` — none (reuses `alerts.ts`).

## Data contracts
No new types required. Reuses `AlertRule`/`AlertField`/`AlertOperator` (`packages/contracts/src/alerts.ts`) and `Envelope`/`DataProvenance` (`provenance.ts`). If a typed SSE fire payload is wanted later, add an additive `AlertEventSchema {rule, quote, firedAt}` to `alerts.ts` and register it in `schemas.ts` — kept out of scope here to stay minimal; v1 validates the frame shape inline.

## Provider capabilities
Requires `quotes` (stream + evaluation). The `news` capability is listed required for the news-field alert path; v1 ships the `quotes` engine and leaves a news hook stubbed behind a `news` capability check (graceful `EmptyState` when absent). The deterministic `MockProvider` already returns quotes (and news), so alerts fire end-to-end in mock mode with no keys. BYO providers declaring `quotes`/`news` work unchanged.

## UI / module behavior
- Panel lists rules (symbol · field · operator · threshold · active · last fired) with add/toggle/delete; row click on a fired alert runs `${symbol} DES`.
- Capability gap (`quotes` absent) → capability `EmptyState` via `ModuleBody`, never a crash; news-field rows show a `news`-gap hint.
- Empty rule set → `EmptyState` ("No alert rules yet."); load error → `ErrorState` with retry.
- Fires surface as a `warn` message in `StatusBar` and in an in-panel "recent fires" list; `ProvenanceBadge`/`FreshnessBadge` reflect the alerts envelope provenance.
- Copy is strictly observational ("AAPL crossed 200.00") — no buy/sell/hold suggestion.

## Testing plan
- Unit (`apps/api/src/stream/alertEngine.test.ts`): every `AlertOperator` × `AlertField`; `crosses_above/below` prev-state transitions; `oneShot` deactivation; inactive rules skipped.
- Persistence (`apps/api/src/persistence/FilePersistence.test.ts`): alert CRUD round-trip + `AlertRuleSchema` validation rejects malformed input.
- API (`apps/api` route tests): `GET/POST/DELETE /api/alerts` return enveloped data; bad bodies → 400; provenance present.
- Hub (`apps/api/src/stream/hub.test.ts`): a tick crossing a threshold emits exactly one fire; `oneShot` does not re-fire.
- Web (`apps/web/src/modules/AlertsModule.test.tsx`, RTL): add/toggle/delete; capability-gap + empty + error states via `ModuleBody`; an injected `event: alert` calls `pushMessage` and appears in recent fires.
- e2e (`apps/web` Playwright): `AAPL ALERT` adds a rule against mock; a stream tick crossing threshold raises a status-bar notification.

## Acceptance criteria
- [ ] `PersistenceStore`/`FilePersistence` expose `listAlerts/saveAlert/deleteAlert`; `AlertRule` round-trips and is `AlertRuleSchema`-validated.
- [ ] `GET/POST/DELETE /api/alerts` return `Envelope {data, provenance}`; invalid bodies rejected with 400.
- [ ] Pure `evaluateRule` covers all `AlertField`×`AlertOperator` cases incl. cross-above/below prev-state; `oneShot` deactivates after first fire.
- [ ] `QuoteStreamHub` evaluates active rules per tick and delivers `event: alert` on the existing `/api/stream/quotes` SSE — no new socket.
- [ ] `AlertsModule` replaces the `alerts` `BetaPlaceholder`; fires surface in `StatusBar` via `pushMessage` and an in-panel list.
- [ ] Capability-gap (`quotes`/`news` absent) / empty / error states render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] No order placement and no personalized advice anywhere in the path; copy is observational only.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`alerts.ts`, `provenance.ts`), persistence (`PersistenceStore`/`FilePersistence`), stream hub, routes, and web `ModuleBody`/`terminalStore`/`StatusBar`. Rule-evaluation-on-a-quote-stream is a standard category primitive; the design is grounded in Tyche's existing `AlertRule` schema and SSE hub, not in any competitor's engine, payloads, or UI. No Gödel Terminal UI, copy, code, alert schema, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Order placement, brokerage, or any execution side-effect of a fire (foundation constraint).
- Personalized advice or buy/sell/hold signals; alerts are observational thresholds only.
- Email/SMS/push/webhook delivery channels (in-app status bar + panel only here).
- News-content alerts (headline keyword matching) beyond the stubbed `news`-gated hook — separate M5 `news-filters` work.
- Technical-indicator/cross-asset/compound rules, or any change to `AlertRule`'s Zod shape.
- Multi-user alert ownership/auth scoping (single-operator local persistence in this milestone).
