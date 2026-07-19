# Architecture

Tyche is a pnpm-workspace monorepo. The design goal is a **durable terminal foundation**: a clean
spine of typed contracts, a UI-agnostic kernel, a capability-typed provider plane, and an extensible
module SDK — with a working vertical slice on top.

## Dependency spine

```
                      ┌──────────────────┐
                      │  @tyche/contracts │  domain types + Zod (keystone)
                      └─────────┬────────┘
        ┌───────────────┬───────┼─────────────┬───────────────┐
        ▼               ▼       ▼             ▼               ▼
 terminal-kernel   data-adapters  module-sdk   analytics      ui
        │               │           │            │           │ (+ module-sdk)
        └──────┬────────┴─────┬─────┴────────────┴─────┬─────┘
               ▼              ▼                          ▼
          apps/api  (contracts + data-adapters)   apps/web (everything)
```

Everything depends on `contracts`. No package imports "sideways" in a way that creates a cycle.
The web app talks to the API only over HTTP/SSE — it never imports server packages.

### No build step (internal packages)

Each `@tyche/*` package points `main`/`types`/`exports` at its `src/index.ts`. There is **no
compile step** for libraries: Vite and `tsx` transform the TypeScript source directly, and
`tsc --noEmit` typechecks across the workspace via pnpm symlinks. This keeps iteration instant and
avoids stale `dist/` drift. Strict TypeScript (`strict`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, …) is enforced everywhere via `tsconfig.base.json`.

## Packages

### `@tyche/contracts`
The single source of truth. Zod schemas with `z.infer` types for the whole domain: instruments,
market data (quotes, candles, trades, order book), news, filings, fundamentals (statements,
estimates, ratings, ownership), options, portfolio, watchlists, alerts, workspace/panels,
preferences, the **provider capability model**, **provenance/freshness**, terminal commands +
parse results, the module manifest, and the AI context packet. A `Schemas` registry enumerates the
domain surface; `envelope()` wraps any payload with `DataProvenance`.

### `@tyche/terminal-kernel`
The UI-agnostic core:
- **parser** — tokenizes a command line into `{ instrument?, commandId, args, query, … }` using a
  tolerant grammar (see [`COMMANDS.md`](./COMMANDS.md)). It depends only on a small registry
  interface, so it is pure and fast (< 10ms for common commands; verified by test).
- **registry** — a validated `CommandRegistry`. Each command's metadata is checked against
  `CommandDescriptorSchema` on registration; duplicate ids and alias collisions are rejected.
- **executor** — turns a parse result + context into declarative **effects**
  (`open-panel`, `set-active-instrument`, `search`, `message`, `noop`). Capability gaps are computed
  here and attached to the panel effect — never thrown.
- **context / shortcuts / help / commands** — the active-instrument model, default keybindings, help
  generation, and `DEFAULT_COMMANDS` (the canonical command surface).

The kernel never touches the DOM, which is why the whole grammar is unit-tested headlessly.

### `@tyche/data-adapters`
The provider plane:
- **`DataProvider`** — one capability-typed method per data kind, each returning
  `Envelope<T> = { data, provenance }`.
- **`MockProvider`** — deterministic, seeded data for 8 demo instruments plus synthesized data for
  any other symbol. Generates a master daily price path per symbol (seeded geometric walk), derives
  quotes/intraday/trades/order-book/news/filings/financials/estimates/ratings/ownership/options from
  it, and stamps provenance with freshness tiers.
- **stubs** — `Yahoo`, `Ccxt` scaffolds that ship disabled (declare no live capabilities) and fail
  loudly if called, documenting their intended capabilities. (`SecEdgar` and `Fred` began as stubs
  and are now **real** adapters — enabled with a SEC User-Agent / FRED key respectively.)
- **`ProviderRegistry`** — answers "who can serve capability X?" and aggregates capabilities across
  enabled providers. The mock provider is always present as a fallback.
- **`CacheStore` / `MemoryCache`** — a small caching interface (swap for Redis/file later).
- **conformance** — `checkProviderConformance()` verifies that a provider honors every capability it
  declares, validating each envelope against the contract schema.

### `@tyche/module-sdk`
The module contract. A module is registered through one manifest (validated against
`ModuleManifestSchema`) plus a UI component (generic `C`, so the SDK stays UI-agnostic) and optional
data/lifecycle hooks. Provides `ModuleRegistry`, capability-gap helpers, and the `ModulePanelProps`
the host passes to each panel component.

### `@tyche/ui`
Presentational React components: `TerminalShell`, `CommandBar`, `PanelFrame`, a virtualized
`DataTable`, `LoadingState`/`EmptyState`/`ErrorState`, and `ProvenanceBadge`/`FreshnessBadge`.
Styled with Tailwind utility classes; the host supplies the theme.

### `@tyche/analytics`
Dependency-free helpers operating on contract types: returns, SMA/EMA/RSI indicators, volatility,
max drawdown, Sharpe, and historical VaR. Educational analytics only.

## apps/api (Fastify)

`buildApp()` assembles a Fastify instance with a provider registry, persistence, a quote stream hub,
and an audit sink, then registers route groups. Key design points:

- **REST for initial loads**, **SSE for streaming** (`/api/stream/quotes`). SSE keeps the
  foundation dependency-free vs. a WebSocket stack; the hub applies a small seeded random walk over
  the deterministic baseline so the demo "moves".
- **Graceful capability handling** — `serveCapability()` resolves a provider for the capability; if
  none exists or the provider throws `CapabilityError`, it returns a structured
  `capability_unavailable` payload (HTTP 200) instead of crashing.
- **Provenance on every response** — market routes return the provider envelope; user routes stamp
  a local provenance.
- **Persistence** — `PersistenceStore` interface with a JSON-file implementation (atomic writes,
  versioned, migration hook). Designed so SQLite/Postgres can be added without touching routes.
- **Security scaffold** — optional bearer-token guard for mutations (off by default), and an
  audit-event interface (`AuditSink`).

Routes: `/api/health`, `/api/providers`, `/api/search`, `/api/instruments/:id`, `/api/quote/:symbol`,
`/api/quotes`, `/api/history/:symbol`, `/api/trades/:symbol`, `/api/news`, `/api/filings/:symbol`,
`/api/financials/:symbol`, `/api/options/:symbol`, `/api/watchlists`, `/api/workspaces`,
`/api/preferences`, `/api/notes`, `/api/ai/chat`, `/api/stream/quotes`.

## apps/web (React + Vite)

```
src/
  app/         App shell (hydrate + keyboard), Header, StatusBar
  terminal/    command registry singleton, executeInput (effects → stores), CommandBarContainer
  workspace/   WorkspaceGrid (react-grid-layout), PanelHost, save/load/import/export
  modules/     module registry + every panel component (+ BetaPlaceholder)
  providers/   API client, useApiData, useQuoteStream, useElementSize
  state/        zustand stores: terminal, workspace, preferences
  styles/      Tailwind + dark terminal theme
```

**Data flow for a command:**

1. User types `AAPL DES`; `CommandBar` calls `executeInput()`.
2. The kernel parses + executes against the current context, producing effects.
3. `executeInput` applies effects: sets the active instrument and calls `workspaceStore.openPanel()`.
4. `WorkspaceGrid` renders the panel via `PanelHost`, which mounts the module component in a
   `PanelFrame` and computes the capability gap from the live capability set.
5. The module fetches via `useApiData` (provenance lifted to the frame footer) and/or subscribes to
   the SSE quote stream via `useQuoteStream`.

The module surface is **derived from the kernel's `DEFAULT_COMMANDS`** — a single source of truth.
Stable commands have full components; beta commands fall back to `BetaPlaceholder`, which explains
the scaffold and the capability it will need.

**Workspace persistence** — saving serializes the workspace to the API *and* mirrors it to
`localStorage`; on load it restores the mirror first, then the API. This is what the e2e test
exercises: open panels → save → reload → panels return.

## Testing strategy

- **Unit/contract** (Vitest, Node): parser grammar, registry validation, provider conformance,
  analytics, module-manifest validation, contract schema round-trips, workspace serialization, and a
  kernel→effects→stores integration test.
- **API smoke** (Vitest + `fastify.inject`): every route group, capability handling, persistence
  round-trip, and the no-advice AI guard.
- **E2E** (Playwright, Chromium): the acceptance scenario end-to-end in a real browser.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to run and extend each layer.

## Competitive research → architecture validation

A clean-room public research pass on a comparable browser-native terminal
([`docs/research/godel/`](./docs/research/godel/)) confirmed that the **capability model**
(ADR-0002) and **module SDK** (ADR-0003) are the right spine: every benchmarked feature maps to an
existing `ProviderCapability` + a `ModuleDefinition`, so reaching category parity is *additive*
(implement a capability in an adapter + add a module), not a structural change. The
[gap analysis](./docs/research/godel/tyche-gap-analysis.md) and
[competitive roadmap](./docs/research/godel/tyche-competitive-roadmap.md) translate that into an
original, milestone-sequenced plan. Tyche's deliberate architectural divergences — **provenance/
freshness on every datum**, **mock-by-default**, **self-hostable / BYO-data**, and an **open SDK** —
are the differentiators, not imitation.
