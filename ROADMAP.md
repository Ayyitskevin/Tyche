# Roadmap

Tyche is a **foundation**, not a finished terminal. The goal of this milestone was a clean, durable
architecture with a working vertical slice — favoring depth on the spine over many half-wired panels.

## Done (foundation)

- **Contracts** — full domain modeled with Zod (`market`, `instruments`, `fundamentals`, `filings`,
  `news`, `options`, `portfolio`, `workspace`, `alerts`, `ai`, `provider`, provenance) + a schema
  registry.
- **Terminal kernel** — tolerant parser, validated command registry, effect-producing executor,
  active context, shortcuts, help generation, and the canonical command surface.
- **Provider plane** — capability model, deterministic `MockProvider` (8 seed instruments + synthesis
  for any symbol), 4 disabled provider scaffolds, provider registry, cache interface, and a reusable
  conformance suite.
- **Module SDK** — manifest contract, validation, registry, capability-gap helpers, panel props.
- **API** — Fastify REST for all initial loads, SSE quote streaming hub, file persistence
  (versioned, atomic), optional auth, and an audit interface.
- **Web** — command bar, tiling workspace (drag/resize/min/max, link groups, undo-close,
  save/load, import/export JSON), and stable modules: DES, GP, HP, QM, W, N, CF, FA, SECF, HELP, AI,
  SETTINGS, plus functional NOTE.
- **Quality** — strict TypeScript with no errors, 90 unit/contract/API tests, and a Playwright e2e
  smoke test (open panels → save → reload → restore).

## Next milestones

### 1. Promote beta modules to data (high value, low risk)
The mock provider already serves the data; wire the views:
`EM` (estimates), `ERN` (earnings), `ANR` (ratings), `HDS` (holders), `OMON` (options chain),
`TAS` (time & sales), `WEI` (world indices), `COMP` (multi-security comparison). Use `analytics`
for `COMP` (normalized performance) and risk stats.

### 2. First real provider
Implement one public adapter end-to-end (SEC EDGAR for `filings`/`fundamentals` is a good first
target — no key, just a User-Agent). Run it through the conformance suite. This proves the capability
model under real data and real freshness.

### 3. Alerts + portfolio
Make `ALERT` evaluate rules against the quote stream and surface a notification; make `PORT`
read-only positions with live P&L (server-evaluated, no order placement).

### 4. Workspace depth
Workspace templates, multiple saved workspaces with a switcher, and richer panel linking (drive the
active symbol across a link group).

### 5. Persistence & multi-user
Add a SQLite adapter behind the existing `PersistenceStore` interface; introduce a real user/identity
model and wire the audit sink to a durable store for team use.

### 6. AI depth
Optional live-model adapter behind `AI_PROVIDER`/`AI_API_KEY`, still grounded and still no-advice;
richer context (selected rows, panel data) and inline citations linking back to panels.

### 7. Charting & analytics
Candlesticks, overlays (SMA/EMA/RSI from `@tyche/analytics`), and drawing — keeping the dependency
footprint small.

## Explicit non-goals (foundation)

- No order placement / brokerage integration.
- No personalized investment advice.
- No bundled proprietary/licensed market data.
