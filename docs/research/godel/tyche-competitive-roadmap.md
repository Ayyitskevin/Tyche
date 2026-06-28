# Tyche competitive roadmap (research-derived)

Twelve milestones translating the Gödel research into an **original** build plan. Each is sized for a
solo operator and grounded in Tyche's existing architecture (the capability model + module SDK).
Clean-room throughout: category benchmarking, original implementation. Tickets:
[`../../roadmap/tickets/`](../../roadmap/tickets/).

---

## Milestone 1 — Foundation hardening / CI / release hygiene
- **Objective:** make the merged v0.1 foundation provably reliable and self-host-honest.
- **User value:** trustworthy base; accurate docs; no silent regressions.
- **Commands/modules:** none new.
- **Data/providers:** none (mock).
- **Code areas:** repo root (`.github/workflows`), `apps/web/src/state/workspaceStore.ts`,
  `apps/web/src/workspace/persistence.ts`, `apps/api/src/{app,env}.ts`, `packages/contracts`, docs.
- **Tests:** CI runs typecheck+test+build; tests for `createdAt` preservation and workspace-JSON
  validation; contract numeric-constraint tests.
- **Docs:** fix README env table, `WEB_ORIGIN`/CORS note, `.env.example` ↔ `env.ts` parity.
- **Risks:** low.
- **DoD:** CI green on PRs; review findings (createdAt, unsafe cast, env/doc drift) resolved; no
  typecheck/test regressions.

## Milestone 2 — SEC filings (real EDGAR) + filing viewer
- **Objective:** Tyche's first **real** data adapter; in-panel filing viewer.
- **User value:** genuinely useful, free filings research (10-K/Q, 8-K, S-1, proxies, 13F).
- **Commands/modules:** `CF` (now live), new filing-viewer panel.
- **Data/providers:** **SEC EDGAR** (public; descriptive `SEC_EDGAR_USER_AGENT`; rate-limited).
- **Code areas:** `data-adapters/src/stubs/SecEdgarProvider.ts` → full impl, `api/routes/research.ts`,
  `apps/web/src/modules/FilingsModule.tsx` + viewer, `contracts/filings.ts`.
- **Tests:** provider conformance for `filings`; route smoke; viewer render test; live-call mocked.
- **Docs:** `DATA_PROVIDERS.md` EDGAR section; entitlement/attribution note.
- **Risks:** SEC fair-access policy (UA + rate limits) — handle politely; cache.
- **DoD:** `AAPL CF` shows real EDGAR filings with links; opening one renders in a viewer panel;
  conformance passes; gracefully degrades to mock if disabled.

## Milestone 3 — Quote monitor v2 + watchlist tabs + batch import
- **Objective:** make the daily-driver quote surface competitive.
- **User value:** many named lists, bulk symbol load, denser board, FOCUS panel.
- **Commands/modules:** `QM` v2, `W` (tabbed), new `FOCUS` panel; window-link ticker propagation.
- **Data/providers:** quotes/batchQuotes (mock + BYO).
- **Code areas:** `apps/web/src/modules/{QuoteMonitorModule,WatchlistModule}.tsx`,
  `state/workspaceStore.ts`, `contracts/portfolio.ts` (watchlist tabs), `api/persistence`.
- **Tests:** watchlist-tabs serialization; batch-import validation; link-propagation store test.
- **Docs:** `COMMANDS.md` QM/W updates.
- **Risks:** render perf at scale — keep virtualization.
- **DoD:** multiple named watchlists persist; paste/CSV import validates + adds; linked panels sync
  the active ticker; FOCUS shows a single live quote.

## Milestone 4 — Financials v2 + export
- **Objective:** standardized statements with export + provenance.
- **User value:** analyst-grade financials with Excel/CSV/JSON export.
- **Commands/modules:** `FA` v2.
- **Data/providers:** fundamentals (EDGAR XBRL where available; mock otherwise).
- **Code areas:** `apps/web/src/modules/FinancialsModule.tsx`, `ui` export util, `contracts/fundamentals.ts`.
- **Tests:** export round-trip (CSV/JSON) incl. provenance header; standardization-tag test.
- **Docs:** `COMMANDS.md` FA export note.
- **Risks:** statement standardization variance — tag line items with stable keys (already modeled).
- **DoD:** `AAPL FA` toggles IS/BS/CF + Q/Y and exports CSV/JSON with provenance.

## Milestone 5 — News v2 + filters + alert hooks
- **Objective:** filterable news + a global feed + alerting.
- **User value:** watchlist-scoped news, keyword/source/date filters, price/keyword alerts.
- **Commands/modules:** `N` v2, new global `TOP`, `ALERT` (functional).
- **Data/providers:** news (RSS/public + BYO); quotes for price alerts.
- **Code areas:** `contracts/news.ts` (filters), `api/routes/research.ts`, `api/stream`,
  `apps/web/src/modules/{NewsModule,AlertsModule}.tsx`, `contracts/alerts.ts`.
- **Tests:** news-filter contract; alert-rule evaluation on a simulated stream.
- **Docs:** `COMMANDS.md` N/TOP/ALERT.
- **Risks:** none significant; avoid latency-edge claims.
- **DoD:** news filters by source/keyword/date/watchlist; `TOP` global feed; an alert fires on a
  threshold/keyword and surfaces in the status bar.

## Milestone 6 — Options chain + time & sales (mock/live adapter layer)
- **Objective:** ship the data-ready derivatives modules.
- **User value:** options chain (Greeks/IV) and a live trade tape.
- **Commands/modules:** `OMON`, `TAS` (functional).
- **Data/providers:** options/trades (mock ready; BYO live).
- **Code areas:** `apps/web/src/modules/{OptionsMonitor,TimeAndSales}.tsx`, `api/stream`,
  `contracts/{options,market}.ts`.
- **Tests:** chain render + Greeks columns; TAS stream contract + virtualized tape.
- **Docs:** `COMMANDS.md` OMON/TAS.
- **Risks:** stream perf — reuse SSE + virtualization.
- **DoD:** `AAPL OMON` renders a chain with Greeks; `AAPL TAS` streams prints.

## Milestone 7 — Estimates, ratings, holders
- **Objective:** company-analysis command set parity.
- **User value:** estimates matrix, analyst ratings, institutional holders.
- **Commands/modules:** `EM`, `ERN`, `ANR`, `HDS` (functional); add `EVT` (events).
- **Data/providers:** estimates/analystRatings/ownership (mock ready; EDGAR 13F for holders; BYO).
- **Code areas:** `apps/web/src/modules/*`, `contracts/fundamentals.ts`.
- **Tests:** module render + contract validation per type.
- **Docs:** `COMMANDS.md` EM/ERN/ANR/HDS/EVT.
- **Risks:** vendor variance — keep contracts provider-agnostic.
- **DoD:** all four render real-ish data (mock or EDGAR-13F) with provenance.

## Milestone 8 — Multi-security comparison + world indices + charting
- **Objective:** comparative analytics + charting depth.
- **User value:** normalized multi-name overlay, global index board, candlesticks/indicators.
- **Commands/modules:** `COMP`/HMS-class, `WEI`, chart v2 (`GP`/`GIP`).
- **Data/providers:** historicalPrices/intraday (mock + BYO).
- **Code areas:** `apps/web/src/modules/{Compare,WorldIndices,Chart}.tsx`, `@tyche/analytics`.
- **Tests:** normalization math (analytics), overlay render, index board.
- **Docs:** `COMMANDS.md` COMP/WEI/GP.
- **Risks:** charting scope creep — keep dependency-free canvas.
- **DoD:** overlay compares ≥3 names normalized; WEI shows regioned indices; chart supports
  candlesticks + SMA/EMA/RSI.

## Milestone 9 — AI research copilot v2 (citations + workspace context)
- **Objective:** make the grounded copilot genuinely useful, still no-advice.
- **User value:** ask questions grounded in open panels + notes + provenance, with citations.
- **Commands/modules:** `AI` v2.
- **Data/providers:** optional BYO model key; mock fallback (already shipped).
- **Code areas:** `contracts/ai.ts` (context packet v2), `api/ai/copilot.ts`, `apps/web/src/modules/AiModule.tsx`.
- **Tests:** context-packet assembly; no-advice guard (existing) extended; citation presence.
- **Docs:** `SECURITY.md` AI section; `ARCHITECTURE.md` AI grounding.
- **Risks:** advice leakage — keep the refusal guard + grounding tests.
- **DoD:** copilot answers reference specific open panels/notes with provenance citations; declines
  personalized advice; works in mock mode.

## Milestone 10 — Solo-operator: notes/research journal + portfolio analytics
- **Objective:** local-first research workflow Gödel doesn't offer.
- **User value:** a versioned research journal and read-only portfolio P&L (no broker).
- **Commands/modules:** `NOTE` v2 (journal), `PORT` (read-only).
- **Data/providers:** quotes for P&L; portfolio is user-entered/imported.
- **Code areas:** `contracts/portfolio.ts`, `api/persistence`, `apps/web/src/modules/{Notes,Portfolio}.tsx`.
- **Tests:** journal persistence/export; P&L computation (analytics).
- **Docs:** `COMMANDS.md` NOTE/PORT; reinforce **no order placement**.
- **Risks:** scope — keep portfolio strictly read-only.
- **DoD:** notes are local, exportable, AI-groundable; portfolio shows positions + live P&L with no
  execution path.

## Milestone 11 — Deployment / self-hosting hardening + transparency
- **Objective:** make self-hosting first-class.
- **User value:** Docker/devcontainer, SQLite persistence, provider/entitlement dashboard, audit sink.
- **Commands/modules:** `SETTINGS` v2 (provider dashboard).
- **Data/providers:** none new.
- **Code areas:** `apps/api/src/persistence` (SQLite adapter), `data-adapters`, `apps/web`, Dockerfile.
- **Tests:** SQLite adapter parity with file store; capability-dashboard render.
- **Docs:** deployment guide; `DATA_PROVIDERS.md` entitlements.
- **Risks:** native deps (better-sqlite3) — keep file store as default fallback.
- **DoD:** `docker compose up` runs the stack; SQLite optional; settings shows each provider's
  capabilities + entitlement warnings + the public REST API docs.

## Milestone 12 — Provider marketplace / plugin SDK
- **Objective:** open the platform to third-party providers/modules.
- **User value:** install community adapters/modules; bring any data source.
- **Commands/modules:** plugin loader; `SETTINGS` plugin manager.
- **Data/providers:** third-party adapters via the existing `DataProvider` interface.
- **Code areas:** `module-sdk`, `data-adapters` (dynamic registration), `apps/{api,web}`.
- **Tests:** plugin manifest validation; sandboxed load; conformance gate for community providers.
- **Docs:** `MODULE_SDK.md` + provider-plugin guide.
- **Risks:** security of third-party code — sandbox + conformance + capability gating.
- **DoD:** a community provider/module can be registered via manifest, passes conformance, and appears
  in the capability dashboard.

---

### Sequencing rationale

M1 (trust) → M2 (the one real adapter that changes everything) → M3/M4/M5 (daily-driver surface) →
M6/M7/M8 (promote data-ready beta modules) → M9 (AI depth) → M10 (solo-operator moat) → M11/M12
(self-host + ecosystem). Each milestone is independently shippable and keeps the foundation green.
