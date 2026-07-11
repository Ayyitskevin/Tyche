# The Tyche Build Manual

> The canonical engineering handbook for building, extending, and operating Tyche.
> Written so that any engineer — human or AI, regardless of capability tier — can pick up
> a task and execute it correctly without re-deriving context. When this manual and the
> code disagree, the code is truth: fix the manual in the same PR that changes the code.

## 0. Vision — what Tyche is, and what it must never become

Tyche is a **keyboard-first financial research terminal** that runs in the browser:
⌘K, type a command (`AAPL GP`, `EQS`, `ETH DEX`, `ECO GDP`), Enter, and a panel opens.
Panels tile into named workspaces; quotes stream; alerts fire; every datum knows where it
came from. It is open-core (Apache-2.0), self-hostable in one command, with an optional
hosted SaaS mode that sells **software and hosting — never data**.

**The five product invariants.** These are the identity of the product. Any change that
violates one is wrong, no matter how useful it looks:

1. **Research-only.** No buy/sell/hold advice, no order placement, no order routing.
   The AI copilot declines personalized advice; the portfolio is read-only tracking.
2. **Never bundle or resell market data.** Live sources connect under the OPERATOR'S
   licenses — keyless public sources (Binance, ECB/Frankfurter, Dexscreener) or the
   operator's own free credentials (SEC EDGAR User-Agent, FRED key). No paid feed is
   ever shipped, marked up, or proxied.
3. **Provenance on everything.** Every provider response is an `Envelope<T> =
   { data, provenance }`; provenance renders in panel footers and rides into CSV exports
   as comment headers. A number without provenance is a bug.
4. **Mock mode always works.** A fresh clone with zero keys must run the ENTIRE terminal
   on the deterministic mock provider. Every new capability ships with a mock
   implementation in the same PR.
5. **Clean-room.** Benchmark against publicly documented market-terminal feature
   *categories* only. Never copy any proprietary product's UI, data, naming, or docs.

## 1. How to use this manual

- **Building a feature?** Read §2 (topology) once, then the chapter for the layer you're
  touching, then follow the relevant recipe verbatim. Recipes exist for: adding a
  capability + schema (§3), adding a real data adapter (§4), adding a command + panel
  module (§5), and adding an API route or SaaS behavior (§6).
- **Unsure about a convention?** §7 is the rulebook — response shapes, error kinds,
  sink patterns, strict-TS idioms, the security bar, and the Definition of Done.
- **Choosing what to build next?** §8 is a dependency-ordered backlog with acceptance
  criteria. Take the topmost unblocked task; do not reorder without cause.
- **The operating loop** (how work ships here — follow it every time):
  1. Sync: `git fetch origin main && git merge --ff-only origin/main`.
  2. Scope ONE small slice (one concern, one PR). Write/adjust tests with the change.
  3. Full gate locally: `pnpm -r typecheck` (expect 8/8), `npx vitest run` (root),
     `pnpm -r build`, and the Playwright e2e suite when UI changed.
  4. Adversarially review your own diff before pushing: enumerate the claims your code
     makes (security, contracts, docs) and try to refute each against the real files.
  5. Commit with a descriptive message, push, open a draft PR, let CI confirm.
  6. After merge: sync again, update docs that your change made stale (this file included).

The seven chapters that follow were each verified against the repository file-by-file.


---

<!-- Chapter 2: Monorepo Topology & Toolchain -->

## Monorepo Topology & Toolchain

Tyche is a **pnpm workspace** monorepo (single `pnpm-lock.yaml` at the root). Everything is **ESM** (`"type": "module"` in every manifest) and **TypeScript**, with **no build step for internal libraries** — the six `packages/*` publish their raw `./src/index.ts` as `main`/`types` and are consumed as source by the two `apps/*`. Only the web app is ever "built" (bundled by Vite); the API runs straight from TypeScript via `tsx`.

Product framing (carry it, do not soften it): Tyche is a keyboard-first financial **research** terminal — research-only (no buy/sell/hold advice, no order placement), it never bundles or resells market data (BYO-key or keyless public sources, plus a deterministic mock provider so the app runs with zero keys), it stamps provenance on every response and export, it is clean-room (benchmarked only against publicly documented feature categories), and it is open-core Apache-2.0 with a software+hosting SaaS mode. This chapter is the physical/build layer beneath all of that.

### Workspace layout

`pnpm-workspace.yaml` (the entire file):
```yaml
packages:
  - "packages/*"
  - "apps/*"
```
So the workspace is exactly **6 packages + 2 apps = 8 members**. Root `package.json` is `name: "tyche"`, `version: 0.3.0`, `private: true`, `packageManager: "pnpm@10.33.0"`, `engines.node: ">=20.10.0"`.

```
Tyche/
├── packages/
│   ├── contracts/        @tyche/contracts        (SSOT — depends on nothing internal)
│   ├── analytics/        @tyche/analytics
│   ├── data-adapters/    @tyche/data-adapters
│   ├── module-sdk/       @tyche/module-sdk
│   ├── terminal-kernel/  @tyche/terminal-kernel
│   └── ui/               @tyche/ui
└── apps/
    ├── api/              @tyche/api   (Fastify server, tsx runtime)
    └── web/              @tyche/web   (React + Vite SPA)
```

### Per-member responsibility + dependency edges (verified from each `package.json`)

| Member | Package name | Responsibility (from source barrels/READMEs) | Internal deps (`workspace:*`) | Notable external deps |
|---|---|---|---|---|
| `packages/contracts` | `@tyche/contracts` | **Root SSOT.** Shared domain types + Zod schemas. `src/index.ts` re-exports ~26 modules (common, provenance, instruments, market, news, filings, fundamentals, options, portfolio, notes, alerts, workspace, provider, screener, economics, audit, events, funding, membership, dexpool, plugin, terminal, module, ai, schemas). | **none** | `zod ^3.24.1` |
| `packages/analytics` | `@tyche/analytics` | Pure financial math: indicators, `technicals` (MACD/Bollinger/ATR/Stochastic/Williams %R/CCI/OBV/VWAP/ADX/ROC/momentum/Ichimoku), returns, risk (+ multi-asset/benchmark-relative `portfolioRisk`), options pricing (+ `optionsAnalytics`: implied vol, payoff/breakevens, max pain, IV skew), portfolio, TVM, screen evaluation, `fundamentals` (margins/returns/leverage + growth from statement line items). No I/O. | `contracts` | — |
| `packages/data-adapters` | `@tyche/data-adapters` | Provider abstraction + registry + provenance/cache/conformance. Real providers (Binance, Dexscreener, Frankfurter, FRED, SEC EDGAR), the deterministic `MockProvider`, and `stubs/` (Ccxt, Fred, SecEdgar, Yahoo). | `contracts`, `analytics` | `zod ^3.24.1` |
| `packages/module-sdk` | `@tyche/module-sdk` | Contract for terminal panel "modules": `ModuleDefinition`, `ModuleRuntime`, `PanelState`, `capabilities`. | `contracts` | — |
| `packages/terminal-kernel` | `@tyche/terminal-kernel` | Headless command engine: parser, registry, executor, aliases, shortcuts, help, capabilities, context. | `contracts` | — |
| `packages/ui` | `@tyche/ui` | Framework React component kit: `CommandBar`, `DataTable`, `PanelFrame`, `TerminalShell`, `ProvenanceBadge`, `FreshnessBadge`, `states`, `entitlement`, `format`. | `contracts`, `module-sdk` | **peer** `react ^18.3.1`, `react-dom ^18.3.1` |
| `apps/api` | `@tyche/api` | Fastify backend. Routes (auth, market, research, ai, stream, admin, billing, user, health), persistence (File + SQLite), plugin host, SaaS/multi-user, security (auth/audit/rateLimit), SSE stream hub + alert engine, AI copilot. | `contracts`, `data-adapters` | `fastify ^5.2.0`, `@fastify/cookie`, `@fastify/cors`, `@fastify/static`, `zod` |
| `apps/web` | `@tyche/web` | React 18 + Vite 6 SPA: terminal shell, ~50 lazy-loaded modules under `src/modules/`, Zustand state, react-grid-layout workspace. | `contracts`, `analytics`, `module-sdk`, `terminal-kernel`, `ui` | `react`, `react-dom`, `react-grid-layout ^1.5.0`, `react-resizable ^3.0.5`, `zustand ^5.0.2` |

**Dependency graph (all edges are `workspace:*`; `contracts` is the sink everything points at):**
```
              contracts  ◄────────────────────────────────┐  ◄──────┐  ◄──────┐
                 ▲                                         │         │         │
      ┌──────────┼───────────┬─────────────┬──────────────┤         │         │
   analytics  module-sdk  terminal-kernel  │              │         │         │
      ▲           ▲                         │              │         │         │
      │           └────── ui ───────────────┘              │         │         │
      │                    ▲                               │         │         │
   data-adapters           │                               │         │         │
      ▲   (analytics,contracts)                            │         │         │
      │                    │                               │         │         │
   apps/api ───────────────┼── (contracts, data-adapters) ─┘         │         │
                           │                                         │         │
   apps/web ── (contracts, analytics, module-sdk, terminal-kernel, ui)─────────┘
```
Key facts a builder must not violate: **`web` never depends on `data-adapters`** (it reaches data only through the API over HTTP/SSE), and **`api` never depends on `ui`, `terminal-kernel`, `module-sdk`, or `analytics` directly** (it pulls analytics transitively via `data-adapters`). `contracts` has zero internal dependencies and must stay that way — it is the shared language.

### TypeScript toolchain

One base config `tsconfig.base.json`; every member `extends` it and only sets `rootDir: "src"` (+ `include: ["src"]`, + DOM/JSX libs for `ui` and `web`, + `types: ["node"]` for `api`). Base compiler options (verbatim, load-bearing):
- **Module system:** `target: ES2022`, `lib: [ES2022]`, `module: ESNext`, `moduleResolution: "Bundler"`, `moduleDetection: "force"`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `esModuleInterop: true`, `resolveJsonModule: true`. `verbatimModuleSyntax` means **type-only imports must be written `import type { … }`** or the build/typecheck breaks — this is the most common trap for a new contributor.
- **Strictness:** `strict: true`, `noUncheckedIndexedAccess: true` (indexed access yields `T | undefined` — array/record reads must be guarded), `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. `exactOptionalPropertyTypes: false` (the one strict flag deliberately left off). `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`.
- **Emit:** `declaration`, `declarationMap`, `sourceMap` all `true` but **`noEmit: true`** — `tsc` is used purely as a type checker; it never produces JS. Internal packages ship `.ts` source directly (`main`/`types` → `./src/index.ts`), so there is nothing to compile for them.

Per-package `typecheck` script is always `tsc --noEmit`. `web` and `ui` add `jsx: "react-jsx"` + `DOM` libs; `web` also adds `vite/client` types.

### Runtime / ESM specifics

- `apps/api`: run with **`tsx`** (`dev` = `tsx watch src/index.ts`, `start` = `tsx src/index.ts`). No transpile-to-dist; tsx executes TS on the fly. `Dockerfile` `CMD` is `pnpm --filter @tyche/api start`.
- `apps/web`: **Vite 6** (`apps/web/vite.config.ts`). Because internal packages are raw TS, the config sets `optimizeDeps.exclude` for `@tyche/contracts`, `@tyche/terminal-kernel`, `@tyche/module-sdk`, `@tyche/ui` and `server.fs.allow: ['../..']` so Vite transforms sibling source. `manualChunks.vendor = ['react','react-dom']`; `resolve.dedupe: ['react','react-dom']`. Styling is Tailwind 3.4 + PostCSS + autoprefixer (`apps/web/tailwind.config.js`, `apps/web/postcss.config.js`).
- `.npmrc`: `auto-install-peers=true`, `strict-peer-dependencies=false`, `link-workspace-packages=true`, `prefer-workspace-packages=true` — workspace packages are symlinked and preferred over registry copies.
- Root `pnpm.onlyBuiltDependencies: ["esbuild"]` — pnpm 10 blocks lifecycle/postinstall scripts by default; **only esbuild is allowed to run its install script**. Adding a dep that needs a native build step requires adding it here.

### The exact commands (root `package.json` scripts)

- **Typecheck (all members):** `pnpm typecheck` → `pnpm -r run typecheck` (recursive; runs `tsc --noEmit` in each package/app).
- **Unit / contract tests:** `pnpm test` → `vitest run` (root `vitest.config.ts`: `environment: 'node'`, `globals: true`, includes `packages/**/src|test/**/*.test.ts` and `apps/**/src|test/**/*.test.ts`, excludes `node_modules`, `dist`, `e2e`, `*.e2e.ts`). ~**66 `*.test.ts`** files across packages + api. Watch mode: `pnpm test:watch`.
- **Build:** `pnpm build` → `pnpm --filter @tyche/web build` → `vite build` (outputs `apps/web/dist/`). **Only the web app builds**; libraries and the API have no build.
- **E2E:** `pnpm test:e2e` → `playwright test` (root `playwright.config.ts`: `testDir: './tests/e2e'`, one spec `tests/e2e/smoke.spec.ts`, Chromium only, `workers: 1`, `fullyParallel: false`). Its `webServer` boots the API in mock mode (`pnpm --filter @tyche/api start`, `API_PORT=4010`, `TYCHE_DATA_DIR=./.tyche-e2e`, health-gated on `/api/health`) and the web dev server (`--port 5173 --strictPort`) before running. Chromium binary comes from `TYCHE_CHROMIUM` / `/opt/pw-browsers/chromium` if present, else Playwright-managed (CI runs `playwright install chromium`).
- **Dev:** `pnpm dev` (`pnpm -r --parallel run dev`), or targeted `pnpm dev:api` / `pnpm dev:web`.
- **Format:** `pnpm format` / `pnpm format:check` (Prettier — `semi`, `singleQuote`, `trailingComma: all`, `printWidth: 100`, `tabWidth: 2`). **There is no ESLint in this repo** — the "lint gate" is Prettier + strict `tsc`.
- **Clean:** `pnpm clean` (rimraf dist/tsbuildinfo/node_modules).
- **Demo (single-origin):** `pnpm demo` → builds web with `VITE_API_BASE_URL= VITE_DEMO_WORKSPACE=1`, then serves it through the API via `TYCHE_SERVE_WEB=$PWD/apps/web/dist`.

### CI / release (`.github/workflows/`)

`ci.yml` (on push to `main` + all PRs) has **two parallel jobs**, both on `ubuntu-latest`, both using **pnpm 10.33.0** (`pnpm/action-setup@v4`) and **Node 22** (`actions/setup-node@v4`, `cache: pnpm`), both installing with `pnpm install --frozen-lockfile`:
1. **`verify`:** `pnpm typecheck` → `pnpm test` → `pnpm build`.
2. **`e2e`:** resolve Playwright version → cache `~/.cache/ms-playwright` keyed by version → `playwright install --with-deps chromium` (or `install-deps` on cache hit) → `pnpm test:e2e` → upload `playwright-report/` + `test-results/` on failure.

`release.yml` (on tags `v*`) runs a **`gate`** job (identical install → typecheck → test → build) then a **`release`** job that extracts the matching `## <version>` section from `CHANGELOG.md` via `awk`, `gh release create` with `--verify-tag`, and builds + pushes the self-host Docker image to **`ghcr.io/<owner>/tyche:<tag>` and `:latest`** (`docker/build-push-action@v6`, lowercased repo slug). Cutting a release = `git tag v0.3.0 && git push origin v0.3.0`, and the CHANGELOG section **must** exist or the job fails.

### The canonical "run the whole gate" sequence

There is **no single aggregate script** — reproduce CI locally by running, from the repo root, in order:
```bash
pnpm install --frozen-lockfile   # exact lockfile, workspace symlinks
pnpm typecheck                   # tsc --noEmit across all 8 members
pnpm test                        # vitest run (node env, ~66 test files)
pnpm build                       # vite build of @tyche/web -> apps/web/dist
pnpm test:e2e                    # playwright smoke; auto-boots API(:4010, mock) + web(:5173)
```
A change is "green" when all five pass. (`pnpm format:check` is the optional style gate; it is not wired into CI.)

### Key files for this chapter

- `/home/user/Tyche/pnpm-workspace.yaml`
- `/home/user/Tyche/package.json`
- `/home/user/Tyche/tsconfig.base.json`
- `/home/user/Tyche/.npmrc`
- `/home/user/Tyche/vitest.config.ts`
- `/home/user/Tyche/playwright.config.ts`
- `/home/user/Tyche/.github/workflows/ci.yml`
- `/home/user/Tyche/.github/workflows/release.yml`
- `/home/user/Tyche/Dockerfile`
- `/home/user/Tyche/packages/contracts/package.json`
- `/home/user/Tyche/packages/contracts/src/index.ts`
- `/home/user/Tyche/apps/api/package.json`
- `/home/user/Tyche/apps/web/package.json`
- `/home/user/Tyche/apps/web/vite.config.ts`
- `/home/user/Tyche/packages/ui/tsconfig.json`

### Open questions / known ambiguities

- Node version is stated two ways: root package.json engines is `>=20.10.0`, but CI, Dockerfile, and the release gate all pin Node 22. Which is the supported floor vs. the tested/canonical version?
- apps/web/vite.config.ts `optimizeDeps.exclude` lists contracts/terminal-kernel/module-sdk/ui but omits @tyche/analytics even though web depends on it — is that an intentional exception or an oversight (it still resolves via the workspace symlink)?
- packages/data-adapters/src has both top-level real providers (FredProvider, SecEdgarProvider) AND a stubs/ directory shadowing several of them (Ccxt, Fred, SecEdgar, Yahoo) — which set is wired into providerRegistry.ts, and are the stubs live or placeholders?
- No ESLint config exists anywhere; the only style enforcement is Prettier (not run in CI) + strict tsc. Is lint intentionally out of scope, or is an ESLint gate planned?
- The e2e job is a separate CI job from `verify` but the local gate sequence runs them serially; there is no single `pnpm gate`/`pnpm verify` script — is adding one desired for the handoff?

---

<!-- Chapter 3: Contracts & Data Model — the Single Source of Truth (@tyche/contracts) -->

## Contracts & Data Model — the SSOT

`@tyche/contracts` is the keystone package of the Tyche monorepo. Every other package — providers (`@tyche/data-adapters`), the terminal kernel (`@tyche/terminal-kernel`), the module SDK (`@tyche/module-sdk`), the API (`apps/api`), and the web client (`apps/web`) — depends on it so they all speak one normalized domain language. If you change a contract here, you change the meaning of data everywhere. Read `packages/contracts/src/index.ts` first: it is the barrel that re-exports all 22 domain modules.

### Package facts (verified)

- `packages/contracts/package.json`: name `@tyche/contracts`, `"type": "module"`, `main`/`types` both point at `./src/index.ts` (ships raw TS, no build step). The **only** runtime dependency is `zod` (`^3.24.1`); dev dep is `typescript`. Keep it dependency-free — everything downstream imports it, so any dep you add here is inherited by the whole repo.
- Scripts: `pnpm --filter @tyche/contracts typecheck` runs `tsc --noEmit`. Tests run from the repo root with `pnpm test` (Vitest, config at `/home/user/Tyche/vitest.config.ts`); watch mode is `pnpm test:watch`. Test files live beside their sources as `*.test.ts` (e.g. `market.test.ts`, `schemas.test.ts`, `citation.test.ts`, `audit.test.ts`, `economics.test.ts`, `news.test.ts`, `notes.test.ts`, `portfolio.test.ts`, `ai.test.ts`).

### The Zod-first philosophy

Every contract is authored as a **Zod schema first**, and the TypeScript type is *derived* from it, never hand-written:

```ts
export const QuoteSchema = z.object({ /* … */ });
export type Quote = z.infer<typeof QuoteSchema>;
```

This is the non-negotiable pattern across all files. The schema is the runtime validator at every trust boundary (provider output, API request/response, persisted workspace/notes); the `z.infer` type is the compile-time shape. A schema and its type can never drift because the type *is* the schema. Defaults (`.default(...)`) mean a schema doubles as a migration/normalizer: e.g. `WorkspaceSchema.parse({ id, name, createdAt, updatedAt })` fills in `version`, `cols: 12`, `rowHeight: 30`, `panels: []` (see `schemas.test.ts`). Numeric guards reject `NaN`/`Infinity` (and non-positive prices) at the boundary so bad data fails cleanly instead of producing `NaN` cells — `market.ts` defines `FinitePrice`, `FinitePositivePrice`, `FiniteNonnegative` locally for this.

**Shared primitives** live in `packages/contracts/src/common.ts` and are reused everywhere: `IsoDateTime` (`z.string().datetime({ offset: true })`), `IsoDate` (permissive non-empty string, allows date-only), `Id` (non-empty string), `Currency` (1–8 chars, permissive for crypto quote currencies), `FiniteNumber` (`z.number().finite()`), `HexColor` (regex `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`).

### The Envelope<T> + Provenance model (the load-bearing invariant)

Defined in `packages/contracts/src/provenance.ts`. **Every practical data response in Tyche is an `Envelope<T>` — the data paired with the provenance that says where it came from.** This is how "provenance stamped on every response and carried into exports" is enforced structurally rather than by convention.

```ts
export interface Envelope<T> { data: T; provenance: DataProvenance; }
export const envelope = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: schema, provenance: DataProvenanceSchema });
```

`DataProvenanceSchema` fields:

| field | type | meaning |
|---|---|---|
| `provider` | `string` | provider name, e.g. `mock`, `yahoo`, `secedgar` |
| `providerMode` | `ProviderModeSchema` enum | how the data was sourced (see below) |
| `capability` | `string` | which capability produced it, e.g. `quotes` (note: free string, **not** the enum) |
| `retrievedAt` | `IsoDateTime` | when Tyche fetched it |
| `freshness` | `DataFreshnessSchema` | asOf + tier + optional delay/age/stale |
| `license` | `string?` | source license, for attribution/exports |
| `attribution` | `string?` | required attribution text |
| `sourceUrl` | `url?` | link back to the source |
| `notes` | `string?` | free notes |
| `cacheHit` | `boolean?` | served from cache |

`ProviderMode` enum (`ProviderModeSchema`): **`mock` | `public` | `paid` | `enterprise` | `user_supplied`**. This encodes the BYO-key / keyless-public / deterministic-mock sourcing model directly in the data — Tyche never resells data, so the mode records whose license the data came under.

`DataFreshness` (`DataFreshnessSchema`): `asOf` (`IsoDateTime`), `tier` (freshness tier enum), optional `delaySeconds` (e.g. `900` for 15-min delayed), `ageMs` (age at retrieval), `stale` (boolean).

Freshness **tiers** (`FreshnessTierSchema`): **`live` | `delayed` | `eod` | `historical` | `mock` | `unknown`** — real-time, exchange-delayed, end-of-day snapshot, archival series, deterministic synthetic, and unknown respectively.

`formatCitation(source)` produces the canonical one-line source string used identically by panels, exports, and the AI copilot: e.g. `mock · quotes · live · as of 2026-06-28`. It is structural over the shared fields of `DataProvenance` and an AI citation (reads `asOf` from either `freshness.asOf` or a flat `asOf`), omitting missing parts and falling back to `unknown` for provider. Verified by `citation.test.ts`.

### The ProviderCapability model — all 24 keys

Defined in `packages/contracts/src/provider.ts`. Providers **declare** which capabilities they support; modules/commands **require** capabilities; the gap between the two produces graceful "missing capability" UI instead of crashes.

`PROVIDER_CAPABILITY_KEYS` is the canonical `as const` tuple (24 entries), and `ProviderCapabilitySchema = z.enum(PROVIDER_CAPABILITY_KEYS)`:

1. `quotes` 2. `batchQuotes` 3. `historicalPrices` 4. `intradayPrices` 5. `trades` 6. `orderBook` 7. `news` 8. `filings` 9. `fundamentals` 10. `estimates` 11. `analystRatings` 12. `ownership` 13. `options` 14. `fx` 15. `crypto` 16. `futures` 17. `bonds` 18. `portfolio` 19. `screener` 20. `economicSeries` 21. `events` 22. `fundingRates` (perp-swap funding, crypto market structure) 23. `membership` (index/ETF constituents) 24. `dexPools` (on-chain DEX liquidity pools).

`ProviderCapabilitiesSchema` is a `z.object` with one `z.boolean()` per key. **Invariant (test-enforced in `schemas.test.ts`):** the `PROVIDER_CAPABILITY_KEYS` tuple and `ProviderCapabilitiesSchema.shape` must contain exactly the same keys, in both directions. `NO_CAPABILITIES` is the all-`false` base object built from the keys tuple — the starting point for stub providers.

Related schemas in the same file: `RateLimitSchema`, `FreshnessGuaranteeSchema` (a provider's promised tier/delay per capability), and `ProviderDescriptorSchema` (name, mode, `capabilities`, `freshness[]`, `attribution`, `attributionRequired`, `rateLimit`, `homepage`, `description`, `requiresConfiguration`) — the self-describing manifest every provider exposes as `descriptor`.

### The core domain schemas (one file per domain)

| File | Key schemas (→ inferred type) |
|---|---|
| `instruments.ts` | `AssetClassSchema` (equity/etf/index/crypto/fx/future/bond/option/commodity/fund), `ExchangeSchema`, `InstrumentIdentifierSchema` (symbol+assetClass+ optional exchange/mic/figi/isin/cusip/currency), `InstrumentSchema` (identifier extended with security-master fields), `SearchResultSchema` |
| `market.ts` | `BarIntervalSchema` (1m…1M), `HistoryRangeSchema` (1d…max), `MarketStateSchema` (pre/regular/post/closed), `QuoteSchema`, `QuoteBatchSchema`, `CandleSchema` (OHLCV `t,o,h,l,c,v`), `HistoricalSeriesSchema`, `TradePrintSchema`+`TradeSideSchema`, `OrderBookSchema`+`OrderBookLevelSchema`, `VenueQuoteSchema` |
| `news.ts` | `NewsItemSchema`, `NewsSentimentSchema`, `NewsQuerySchema` (all-optional; no symbol ⇒ global TOP feed) |
| `filings.ts` | `FilingSchema` (form/title/filedAt/accession/documents), `FilingDocumentSchema` |
| `fundamentals.ts` | `FinancialStatementSchema`+`StatementLineItemSchema`+`StatementTypeSchema`(income/balance/cash_flow)+`FiscalPeriodSchema`(annual/quarterly/ttm), `EstimateMetricSchema`+`EstimatePeriodSchema`, `AnalystRatingSchema`+`RatingActionSchema`, `InstitutionalHolderSchema` |
| `options.ts` | `OptionContractSchema`, `OptionChainSchema`, `OptionGreeksSchema`, `OptionTypeSchema` |
| `portfolio.ts` | `PositionSchema`, `PortfolioSchema`, `WatchlistSchema` (user-owned, local; not a market provider) |
| `notes.ts` | `NoteSchema` (markdown `body`, local-first, exportable, AI-groundable), `NoteExportSchema` |
| `alerts.ts` | `AlertRuleSchema` (field price/changePercent/volume, operators incl. crosses_above/below, `oneShot`, `lastTriggeredAt`) |
| `workspace.ts` | `WORKSPACE_SCHEMA_VERSION = 1`, `WorkspaceSchema` (panels grid), `PanelSchema`, `GridPositionSchema`, `UserPreferencesSchema` (theme/density/keymap/flags/disabledPlugins/onboardingRole) |
| `screener.ts` | `ScreenFieldSchema`, `ScreenFilterSchema` (with `superRefine` forcing numeric fields→number, categorical→string), `ScreenQuerySchema`, `ScreenRowSchema`, `SavedScreenSchema` |
| `economics.ts` | `EconomicSeriesSchema` (FRED-style, observations may be `null`), `EconomicObservationSchema`, `EconomicSeriesQuerySchema` |
| `audit.ts` | `AuditEventSchema` (at/actor/action/resource/outcome), `AuditOutcomeSchema` (allow/deny/error) — append-only accountability trail |
| `events.ts` | `CorporateEventSchema` (earnings/dividend/split, confirmed/estimated), `EventsQuerySchema` |
| `funding.ts` | `FundingRateSchema` (perp funding rate/interval/annualizedPct/mark+index price) |
| `membership.ts` | `IndexMembershipSchema` + `ConstituentSchema` (weightPct) |
| `dexpool.ts` | `DexPoolSchema` (pairAddress/chain/dex/base+quote token/priceUsd/liquidityUsd/…), `DexTokenSchema` |
| `provider.ts` | capability keys, `ProviderCapabilitiesSchema`, `ProviderDescriptorSchema`, `NO_CAPABILITIES` |
| `terminal.ts` | `CommandDescriptorSchema` (id must match `/^[A-Z][A-Z0-9]*$/`, `requiredCapabilities`, `acceptedAssetClasses`, `maturity`), `CommandParseResultSchema`, `ParsedTokenSchema` |
| `module.ts` | `ModuleManifestSchema` (moduleId kebab-case, `commandIds.min(1)`, `requiredCapabilities`, `exportFormats`, `keyboardShortcuts`, `hasStreaming`) |
| `plugin.ts` | `PLUGIN_API_VERSION = 1`, `PluginManifestSchema` (id lowercase slug, kind provider/module), `PluginInfoSchema`+`PluginStatusSchema` (active/quarantined/disabled), `PluginConformanceCheckSchema` |
| `ai.ts` | `AIContextPacketSchema` (grounding packet: active symbol, open panels w/ provenance, notes, watchlist), `AIChatRequestSchema`, `AIChatResponseSchema` (carries `citations`, `grounded`, `disclaimer`, `mode`), `provenanceToCitation()` helper |

`packages/contracts/src/schemas.ts` exposes `Schemas`, a `Record<string, ZodTypeAny>` registry of ~50 named domain schemas (`Schemas.Quote === QuoteSchema`, etc.) plus the `SchemaName` union — used for generic validation, contract tests, and tooling that enumerates the domain surface. It is maintained by hand; add new schemas here when you add a domain.

### How a new capability + schema is added, end to end

The capability model spans three packages. To add capability `foo` returning `FooData`:

1. **Contract schema** — create `packages/contracts/src/foo.ts` with `export const FooSchema = z.object({…})` and `export type Foo = z.infer<typeof FooSchema>`; re-export it from `packages/contracts/src/index.ts`. Register it in the `Schemas` map in `schemas.ts`.
2. **Capability key** — add `'foo'` to `PROVIDER_CAPABILITY_KEYS` **and** add `foo: z.boolean()` to `ProviderCapabilitiesSchema` in `packages/contracts/src/provider.ts`. Both, or `schemas.test.ts` ("keys array and object schema stay in sync") fails.
3. **Provider method** — add `getFoo(...): Promise<Envelope<Foo>>` to the `DataProvider` interface in `packages/data-adapters/src/Provider.ts`, and a default in `StubProvider` that returns `this.fail('foo')` (so scaffolds fail loudly). A provider lacking a capability should **throw `CapabilityError`** (from `packages/data-adapters/src/errors.ts`), never silently return empty — the API translates that to a graceful UI state.
4. **Conformance probe** — add `foo: { call: (p) => p.getFoo(...), schema: envelope(FooSchema) }` to `buildProbes()` in `packages/data-adapters/src/conformance.ts`. `checkProviderConformance()` then calls the method for any provider that declares `foo` and validates the returned envelope against `envelope(FooSchema)`; capabilities with no probe are auto-passed.
5. **Implement + stamp provenance** — implement `getFoo` in `MockProvider` (the reference impl that must pass the full suite) and any real adapter, building the envelope with `makeProvenance({ provider, providerMode, capability: 'foo', tier, … })` + `withProvenance(data, prov)` from `packages/data-adapters/src/provenance.ts`.
6. **Surface it** — a command (`CommandDescriptorSchema.requiredCapabilities`) or module (`ModuleManifestSchema.requiredCapabilities`) lists `'foo'`. The kernel/module SDK gate on it via `missingCapabilities()` / `moduleMissingCapabilities()` (`packages/terminal-kernel/src/capabilities.ts`, `packages/module-sdk/src/capabilities.ts`), and `ProviderRegistry.aggregateCapabilities()` / `forCapability('foo', symbol)` (`packages/data-adapters/src/providerRegistry.ts`) resolve which enabled provider serves it.

Note the asymmetry: `fx`, `futures`, `bonds` are asset-class capabilities served through `getQuote`/`getHistory` (no dedicated method), and `portfolio` has **no** `DataProvider` method or conformance probe at all — these four have no probe and are auto-reported as passed.

### Key files for this chapter

- `packages/contracts/src/index.ts`
- `packages/contracts/src/common.ts`
- `packages/contracts/src/provenance.ts`
- `packages/contracts/src/provider.ts`
- `packages/contracts/src/schemas.ts`
- `packages/contracts/src/market.ts`
- `packages/contracts/src/instruments.ts`
- `packages/contracts/src/ai.ts`
- `packages/contracts/src/terminal.ts`
- `packages/contracts/src/module.ts`
- `packages/contracts/src/plugin.ts`
- `packages/contracts/src/schemas.test.ts`
- `packages/data-adapters/src/Provider.ts`
- `packages/data-adapters/src/conformance.ts`
- `packages/data-adapters/src/provenance.ts`
- `packages/data-adapters/src/errors.ts`
- `packages/data-adapters/src/providerRegistry.ts`

### Open questions / known ambiguities

- The `capability` field on DataProvenanceSchema is a free `z.string()`, not `ProviderCapabilitySchema` — so provenance can name capabilities/pseudo-capabilities (e.g. 'search', 'instruments') that aren't in the 24-key enum. Intentional looseness, but nothing validates the two agree.
- Four declared capabilities (`fx`, `futures`, `bonds`, `portfolio`) have no dedicated `DataProvider` method and no conformance probe; `fx`/`futures`/`bonds` are served via getQuote/getHistory as asset-class markers, but `portfolio` has no serving path in the provider contract at all — how a provider is meant to expose portfolio data is unspecified here.
- The `Schemas` registry in schemas.ts is maintained by hand; only a loose `length > 30` test guards it, so a newly added domain schema can be silently omitted from the registry without a test failing.
- `IsoDate` is a permissive non-empty string (not strictly validated), whereas `IsoDateTime` is strict `z.string().datetime({offset:true})` — mixing them means date-only fields accept arbitrary strings; verify downstream code doesn't assume IsoDate parses as a full timestamp.

---

<!-- Chapter 4: Provider / Adapter Layer -->

## Provider / Adapter Layer

This chapter documents the data plane: the `@tyche/data-adapters` package (`packages/data-adapters/src/*`), the capability model it depends on in `@tyche/contracts`, and the plugin host in `apps/api/src/plugins/*`. This is the layer that lets Tyche be a **BYO-key, provider-agnostic research terminal**: modules never call a data source directly — they ask the registry for a *capability*, and whatever provider the operator enabled (or the always-present deterministic mock) answers, with **provenance stamped on every response**.

### 0. Mental model in one paragraph

Every data source is a `DataProvider` (an object with a `descriptor` declaring which of 24 capabilities it serves, plus one async method per capability, each returning an `Envelope<T> = { data, provenance }`). A `ProviderRegistry` holds the enabled providers **in registration order** and answers "who serves capability X for symbol Y?". `createProviderRegistry()` builds the registry from a list of names and **always appends the mock provider as a fallback** so the terminal is never dataless. A reusable `checkProviderConformance()` suite drives every declared capability and validates the returned envelope against the contract's Zod schema — this is the gate the `PluginHost` uses before it will let an operator-installed adapter serve real data.

---

### 1. The capability model (`packages/contracts/src/provider.ts`)

The universe of capabilities is a single frozen tuple `PROVIDER_CAPABILITY_KEYS` (24 keys):

```
quotes, batchQuotes, historicalPrices, intradayPrices, trades, orderBook, news,
filings, fundamentals, estimates, analystRatings, ownership, options, fx, crypto,
futures, bonds, portfolio, screener, economicSeries, events, fundingRates,
membership, dexPools
```

- `ProviderCapability` = union of those keys; `ProviderCapabilities` = a `Record<key, boolean>` (all 24 flags required).
- `NO_CAPABILITIES` is the all-`false` base object — **every adapter builds its capability set as `{ ...NO_CAPABILITIES, quotes: true, ... }`**.
- `ProviderDescriptor` (the metadata every provider exposes as `descriptor`):
  ```ts
  { name: string; mode: ProviderMode; capabilities: ProviderCapabilities;
    freshness: FreshnessGuarantee[]; attribution?: string; attributionRequired: boolean;
    rateLimit?: { requestsPerMinute?, requestsPerDay?, burst?, notes? };
    homepage?: string; description?: string; requiresConfiguration: boolean }
  ```
- `ProviderMode` (`packages/contracts/src/provenance.ts`): `'mock' | 'public' | 'paid' | 'enterprise' | 'user_supplied'`. (`paid`/`enterprise` exist in the schema but no shipped adapter uses them.)
- `FreshnessTier`: `'live' | 'delayed' | 'eod' | 'historical' | 'mock' | 'unknown'`.

### 2. The `DataProvider` interface + `StubProvider` (`packages/data-adapters/src/Provider.ts`)

`DataProvider` requires `readonly descriptor: ProviderDescriptor`, an **optional** `servesSymbol?(symbol: string): boolean` routing hook, and one method per capability. Full method surface (all return `Promise<Envelope<...>>`):

```
searchInstruments(query, limit?)   getInstrument(symbol)
getQuote(symbol)                   getQuotes(symbols[])          getHistory(symbol, {range?, interval?})
getTrades(symbol, limit?)          getOrderBook(symbol, depth?)
getNews({symbol?, symbols?, query?/keyword?, source?, since?, until?, limit?})
getFilings(symbol, limit?)         getFinancials(symbol, {type?, period?})
getEstimates(symbol)               getAnalystRatings(symbol)     getOwnership(symbol)
getOptionChain(symbol, {expiry?})  screen(ScreenQuery)           getEconomicSeries(seriesId, {start?,end?,limit?})
getEvents({symbol?, days?})        getFundingRates(symbols?)     getMembership(symbol)   getDexPools(query, limit?)
```

Query shapes `HistoryQuery`, `NewsQuery`, `FinancialsQuery`, `OptionQuery` are declared in this same file (they are NOT in contracts).

**`StubProvider`** is an `abstract class implements DataProvider` whose every method rejects with a `ProviderError` ("Capability … is not implemented … ships as a scaffold"). Adapters that serve only a few capabilities **extend `StubProvider` and `override` just the methods they support** — every capability they do *not* declare then fails loudly instead of returning garbage. The only provider that `implements DataProvider` directly (no stub base) is `MockProvider`, because it serves nearly everything.

### 3. Envelope & provenance (`packages/data-adapters/src/provenance.ts`)

- `makeProvenance(init: ProvenanceInit): DataProvenance` — stamps `provider`, `providerMode`, `capability`, `retrievedAt` (now), and a `freshness` block (`asOf`, `tier`, computed `ageMs`, optional `delaySeconds`), plus optional `attribution`/`license`/`sourceUrl`/`notes`/`cacheHit`.
- `withProvenance(data, provenance): Envelope<T>` — the trivial `{ data, provenance }` wrapper every method's return value is built with.

Provenance is the mechanism that keeps Tyche honest about data source and freshness on every panel and in exports. **Secrets must never leak into provenance** — the FRED adapter is the reference example: the API key rides the request URL as a query param but `sourceUrl` points at the key-free public series page.

### 4. `ProviderRegistry` & `createProviderRegistry` (`packages/data-adapters/src/providerRegistry.ts`)

`class ProviderRegistry` holds `providers: DataProvider[]` (ordered) + a `byName` map. Key methods:

- `register(provider)` — throws on duplicate `descriptor.name`.
- `get(name)`, `list()`, `descriptors()`, `primary()` (first registered; throws if none).
- **`forCapability(capability, symbol?)`** — returns the **first** provider (registration order) whose descriptor declares the capability AND (when a symbol is given) whose `servesSymbol` returns true or is absent. This is the single routing primitive; registration order therefore = priority. This is why the docs say list `binance` **before** `mock` in `TYCHE_PROVIDERS` so `BTC-USDT` routes to the venue while `AAPL` and the mock-only `BTC-USD` stay on mock.
- **`aggregateCapabilities()`** — union (`some`) of every registered provider's capabilities, over `PROVIDER_CAPABILITY_KEYS`. Drives the web capability dashboard and the graceful "capability gap" UI.
- **`missingCapabilities(required)`** — `required.filter(cap => !aggregate[cap])`.

**`createProviderRegistry(config: ProviderRegistryConfig = {})`** is the factory. `ProviderRegistryConfig = { providers?: string[]; referenceDate?: Date; secEdgarUserAgent?: string|null; fredApiKey?: string|null }`. It:
1. Uses `config.providers` (or `['mock']` if empty), calls `instantiate(name, config)` for each, registers non-null results.
2. **Mock-always-fallback**: after the loop, if no provider named `mock` is registered, it appends a fresh `MockProvider`. So the mock is guaranteed present even if the operator omits it or names only keyless/keyed adapters.

`instantiate(name, config)` is the name→adapter switch (case-insensitive, trimmed). The full table:

| Name (aliases) | Returns | Needs config? |
|---|---|---|
| `mock` | `new MockProvider({referenceDate?})` | no |
| `yahoo` | `new YahooProvider()` (disabled stub) | — |
| `sec` / `secedgar` | `secEdgarUserAgent ? new SecEdgarProvider({userAgent}) : null` | **yes — UA** |
| `fred` | `fredApiKey ? new FredProvider({apiKey}) : null` | **yes — key** |
| `binance` | `new BinanceProvider()` | no (keyless) |
| `frankfurter` / `ecb` | `new FrankfurterProvider()` | no (keyless) |
| `dexscreener` / `dex` | `new DexscreenerProvider()` | no (keyless) |
| `ccxt` | `new CcxtProvider()` (disabled stub) | — |
| anything else | `null` (skipped) | — |

**Critical detail for a keyed adapter:** when its config is absent, `instantiate` returns `null` and the provider is silently skipped — so the mock's declared capability serves instead (SEC's `filings`, FRED's `economicSeries`). This is the "usable with zero keys" guarantee.

### 5. The conformance gate (`packages/data-adapters/src/conformance.ts`)

`checkProviderConformance(provider, options?): Promise<ConformanceReport>` where `ConformanceReport = { provider, ok, checks: {capability, passed, error?}[] }`.

For each capability the descriptor declares `true`, it looks up a **probe** in `buildProbes(equitySymbol, cryptoSymbol)` (defaults `'AAPL'` / `'BTC-USD'`, overridable via `options.equitySymbol`/`cryptoSymbol`). A probe = `{ call: (p) => p.someMethod(...), schema: envelope(SomeSchema) }`. It runs the call, `safeParse`s the result against the envelope schema, and records pass/fail. **Capabilities with no probe are recorded as `passed: true`** ("nothing to verify yet") — the un-probed capabilities are exactly `fx`, `futures`, `bonds`, `portfolio` (all other 20 have probes). `ok` = every check passed.

**Gotcha (load-bearing for plugin authors):** probes call with the *default* symbols `AAPL`/`BTC-USD`. A venue-scoped provider whose `getQuote('AAPL')` throws will FAIL conformance unless the caller passes matching `options`. The built-in venue adapters (Binance/Frankfurter/Dexscreener) are **not** conformance-gated at registry build — only the `PluginHost` runs conformance, and it calls `checkProviderConformance(provider)` with **no options**. So a plugin that only serves, say, `EUR-USD` would be quarantined by the default-symbol probes. Their own `*.test.ts` files pass appropriate `equitySymbol`/`cryptoSymbol` to prove conformance.

### 6. `MockProvider` (`packages/data-adapters/src/MockProvider.ts`)

The deterministic demo provider — `implements DataProvider` directly, `mode: 'mock'`, `requiresConfiguration: false`. It declares **22 of the 24** capabilities true in `MOCK_CAPABILITIES` (everything except `bonds` and `portfolio`; and it *does* set `fx`/`futures` true although those have no probe). It does **not** serve `fx`/`futures`/`bonds`/`portfolio` meaningfully per the docs — those exercise the capability-gap UI.

How it works:
- Seeded PRNG (`random.ts`: FNV-1a hash → mulberry32 → `seededRng(...parts)`, plus `gaussian`, `rangeValue`, `intInRange`, `pick`, `round`). Same inputs ⇒ same output.
- A per-symbol **master daily price path** (`MASTER_DAYS = 1300`) is a seeded geometric random walk anchored so the newest close ≈ the seed's `basePrice`; quotes, intraday bars, trades, order books, options, financials, estimates, ratings, ownership, news, filings, events all derive from it or from independent seeded streams. Results are cached in `masterCache` keyed by `symbol:endDate`.
- The demo universe lives in `seed.ts` (`SEED_INSTRUMENTS`, `SEED_BY_SYMBOL`, `SEED_SYMBOLS`): AAPL, MSFT, NVDA, TSLA, SPY, QQQ, BTC-USD, ETH-USD, etc. Unknown symbols are **synthesized** deterministically (`synthesize()`), so no ticker ever crashes a panel.
- `economicSeries` has a small named catalog (`ECON_CATALOG`: GDP, CPIAUCSL, UNRATE, FEDFUNDS, DGS10) + a synthetic fallback for any other id.
- `MockProviderOptions.referenceDate` freezes "now" so tests/exports are reproducible.
- Every provenance is stamped `mode: 'mock'`, attribution "Synthetic data — Tyche mock provider", notes "for demonstration only".

### 7. The five real adapters

Two live under `src/stubs/` for **historical naming reasons** but are real implementations (they extend `StubProvider` and override only their one real method; the registry imports them from `./stubs/…`):

| Adapter | File | Mode | Capabilities served | Key? | Endpoint / notes |
|---|---|---|---|---|---|
| **SEC EDGAR** | `src/stubs/SecEdgarProvider.ts` | `public` | `filings` | **Descriptive User-Agent required** (`SEC_EDGAR_USER_AGENT`); constructor throws without it | ticker→CIK via `sec.gov/files/company_tickers.json` (24h cache), then `data.sec.gov/submissions/CIK…json` (15m cache). Unknown ticker → empty list, never a crash |
| **FRED** | `src/stubs/FredProvider.ts` | `public` | `economicSeries` | **Free API key required** (`FRED_API_KEY`); constructor throws without it | `api.stlouisfed.org/fred/series` (6h) + `/series/observations` (30m); FRED `"."` missing marker → `null`. Key sent only as query param, **never in provenance** (`sourceUrl` = key-free series page) |
| **Binance** | `src/BinanceProvider.ts` | `public` | `quotes`, `batchQuotes`, `historicalPrices`, `intradayPrices`, `trades`, `orderBook`, `crypto`, `fundingRates` | **keyless** | Spot `api.binance.com/api/v3` + perp `fapi.binance.com/fapi/v1`. Dash notation `BTC-USDT` ⇄ compact `BTCUSDT`. **No `USD` quote mapping** (spot quotes in stablecoins). `servesSymbol` = pair-shaped AND not fiat/fiat |
| **Frankfurter** | `src/FrankfurterProvider.ts` | `public` | `quotes`, `batchQuotes`, `historicalPrices`, `fx` | **keyless** | `api.frankfurter.app` daily ECB reference rates, ~30 currencies. One fixing/business day ⇒ EOD-tier, **flat candles (o=h=l=c)**. `servesSymbol` = ISO `XXX-YYY` both in the ECB set, base≠quote |
| **Dexscreener** | `src/DexscreenerProvider.ts` | `public` | `dexPools` only | **keyless** | `api.dexscreener.com/latest/dex/search?q=…`. **Query-shaped, not symbol-shaped**; declares only `dexPools` so it never intercepts symbol routing. Sorted deepest-liquidity first, 60s cache, ~300 req/min throttle |

**Symbol-scoped routing** is what lets Binance + Frankfurter + mock coexist: Binance's `servesSymbol` declines fiat/fiat pairs so `CHF-JPY` falls to Frankfurter; Frankfurter declines anything not a two ECB-currency pair so equities/crypto fall to mock/Binance. Dexscreener needs no `servesSymbol` because `dexPools` is a distinct capability.

Every real adapter shares the same internals pattern:
- Injectable `fetchImpl?: FetchLike` (default `globalThis.fetch`) for testing — the `FetchLike` type is defined once in `src/stubs/FredProvider.ts` and imported by Binance/Frankfurter/Dexscreener.
- A `MemoryCache` (per-endpoint TTL constants at the top of the file).
- A `throttle()` promise-chain that serializes requests and enforces `minIntervalMs` politeness spacing.
- A private `getJson<T>(url)` that wraps `throttle(fetchImpl)`, throws `ProviderError` on non-ok status, and (FRED/Binance/Frankfurter/Dexscreener) swallows transport rejections into a generic `ProviderError` so a key-bearing URL can never surface in an error message.
- A private `prov(...)` helper building provenance via `makeProvenance`.

### 8. The disabled stubs (Yahoo, CCXT)

`src/stubs/YahooProvider.ts` and `src/stubs/CcxtProvider.ts` extend `StubProvider`, declare `capabilities: { ...NO_CAPABILITIES }` (i.e. **zero**), and `requiresConfiguration: true`. Because they declare nothing, `forCapability` never selects them — they can be named in `TYCHE_PROVIDERS` harmlessly and every method throws the scaffold error. Their descriptors document *intended* capabilities in prose (Yahoo → quotes/history/news; CCXT → crypto quotes/orderBook/trades/history, `mode: 'user_supplied'`). They are the template for "wire up a real adapter later."

### 9. Support modules

- `errors.ts`: `ProviderError(provider, message)` (generic — network/parse/unconfigured; what `StubProvider.fail` and `getJson` throw) and `CapabilityError(provider, capability, message?)` + `isCapabilityError()`. **Routing significance:** in `apps/api/src/routes/helpers.ts`, `serveCapability()` catches `CapabilityError` → HTTP 200 `{ error: { kind: 'capability_unavailable' }, provenance: gapProvenance(...) }`; any other error → HTTP 502 `provider_error`. A resolvable-but-empty request still carries a `gapProvenance` naming the provider+capability (tier `unknown`).
- `cache.ts`: `CacheStore` interface (`get`/`set`/`delete`/`clear` + convenience `wrap`) and `MemoryCache` (TTL-aware, in-memory). Interface is deliberately tiny so a Redis/file store drops in without touching call sites.
- `random.ts`, `seed.ts`: the mock's determinism (see §6).
- `index.ts`: the package barrel — re-exports everything, including the four stub classes by name.

### 10. The plugin system (`apps/api/src/plugins/*`, `packages/contracts/src/plugin.ts`)

Plugins let an operator add a provider **without editing the core** — same trust level as adding a dependency; **Tyche never downloads or executes remote code**.

- `PluginManifest` (Zod, `packages/contracts/src/plugin.ts`): `{ id (lowercase slug), name, version, kind: 'provider'|'module', apiVersion: number, description?, author?, homepage?, capabilities: ProviderCapability[] (default []), commandIds: string[] (default []) }`. `PLUGIN_API_VERSION = 1`.
- `ProviderPlugin` (`PluginHost.ts`): `{ manifest: PluginManifest; createProvider: () => DataProvider }`. The factory is only ever invoked by the host.
- **`PluginHost`** wraps a `ProviderRegistry`. `registerProvider(plugin, { enabled? })` runs the gate, in order, and on any failure records a `PluginInfo { manifest, status: 'quarantined', reason, conformance }` and returns **without registering** (a broken/hostile adapter can never serve):
  1. manifest passes `PluginManifestSchema`;
  2. `manifest.apiVersion === PLUGIN_API_VERSION`;
  3. `manifest.kind === 'provider'`;
  4. `enabled !== false` (else recorded `disabled`, never instantiated);
  5. `manifest.capabilities.length > 0` (a provider serving nothing is rejected);
  6. `createProvider()` doesn't throw;
  7. no name collision with an already-registered provider;
  8. the descriptor actually backs every capability the manifest declares (`undeclared` must be empty);
  9. **`checkProviderConformance(provider)` returns `ok: true`** (called with no symbol options — see §5 gotcha).
  Only then: `registry.register(provider)` and `status: 'active'`. `list()` returns all seen plugins in order (surfaced at `/api/plugins`).
- **`loadConfiguredPlugins(specifiers)`** (`loader.ts`) resolves `TYCHE_PLUGINS`: for each module specifier it dynamically `import()`s and takes `mod.plugin ?? mod.default`, accepting it only if it has `.manifest` and a `.createProvider` function; failures/mismatches are `console.warn`ed and skipped (never crash boot).

### 11. End-to-end wiring (env → registry → routes)

- `.env` → `apps/api/src/env.ts` `loadConfig()` reads `TYCHE_PROVIDERS` (CSV, default `['mock']`) → `config.providers`, `TYCHE_PLUGINS` (CSV, default `[]`) → `config.plugins`, `SEC_EDGAR_USER_AGENT` → `config.secEdgarUserAgent`, `FRED_API_KEY` → `config.fredApiKey`.
- `apps/api/src/app.ts` `buildApp()` calls `createProviderRegistry({ providers, secEdgarUserAgent, fredApiKey })`, then builds a `PluginHost(registry)`, reads `preferences.disabledPlugins`, and for each of `[...options.plugins (tests), ...await loadConfiguredPlugins(config.plugins)]` calls `plugins.registerProvider(plugin, { enabled: !disabled.has(plugin.manifest?.id) })`.
- Routes/stream resolve providers via `registry.forCapability(cap, symbol)` (`routes/helpers.ts` `serveCapability`, `routes/market.ts`, `stream/hub.ts`). The `PluginHost` and registry are placed on the request `context` (`apps/api/src/context.ts`).

### 12. RECIPE — add a new REAL adapter (core, keyed or keyless)

Using SEC EDGAR / Binance as the reference implementations:

1. **Write `packages/data-adapters/src/MyProvider.ts`.** `export class MyProvider extends StubProvider` (override only supported methods) — or `implements DataProvider` if you serve nearly everything. Set:
   ```ts
   readonly descriptor: ProviderDescriptor = {
     name: 'myprovider', mode: 'public' /* or paid/user_supplied */,
     capabilities: { ...NO_CAPABILITIES, quotes: true, historicalPrices: true },
     freshness: [{ capability: 'quotes', tier: 'live', delaySeconds: 0 }],
     attribution: 'My Data Inc.', attributionRequired: true,
     homepage: 'https://…', requiresConfiguration: true /* if it needs a key */,
   };
   ```
   - Constructor: accept `{ apiKey?, cache?, fetchImpl?, minIntervalMs? }`; **throw `ProviderError` if a required key is missing** (mirrors SEC/FRED). Default `cache = new MemoryCache()`, `fetchImpl = globalThis.fetch`.
   - Copy the `getJson`/`throttle` internals from an existing adapter. Never let a key-bearing URL escape into an error/provenance.
   - Return `withProvenance(data, makeProvenance({ provider:'myprovider', providerMode:'public', capability:'quotes', tier:'live', ... }))`.
   - Implement `servesSymbol(symbol)` if venue-scoped so the registry keeps routing other symbols elsewhere.
   - Unsupported capabilities inherit `StubProvider`'s throwing defaults automatically.

2. **Export it** from `packages/data-adapters/src/index.ts` (`export * from './MyProvider';`).

3. **Register in `instantiate()`** in `packages/data-adapters/src/providerRegistry.ts`: add a `case 'myprovider':`. If keyed, return `null` when the key is absent (so mock serves the capability); if keyless, always `return new MyProvider()`. If it needs new config, add fields to `ProviderRegistryConfig`.

4. **If it needs env config, thread it through** (two files): add the field to `ApiConfig` + read it in `loadConfig()` (`apps/api/src/env.ts`), then pass it into the `createProviderRegistry({ … })` call in `buildApp()` (`apps/api/src/app.ts`). (Today only `secEdgarUserAgent`/`fredApiKey` are threaded — a new keyed provider MUST be added here or its key never reaches `instantiate`.)

5. **Prove conformance** — add `packages/data-adapters/src/MyProvider.test.ts` that calls `checkProviderConformance(new MyProvider({ fetchImpl: stub }), { equitySymbol, cryptoSymbol })` with symbols your `servesSymbol` accepts, and asserts `report.ok`.

6. **Enable & document**: `TYCHE_PROVIDERS=myprovider,mock` (+ any key env), and add a section to `DATA_PROVIDERS.md`.

### 13. RECIPE — distribute as a PLUGIN instead (no core edits)

Build a separate module that `export default { manifest, createProvider }` (or `export const plugin = …`), where `manifest` is a valid `PluginManifest` with `apiVersion: 1`, `kind: 'provider'`, and `capabilities` matching what `createProvider()`'s descriptor actually backs. The operator installs it and names it in `TYCHE_PLUGINS`. It will only serve data if it passes the full conformance gate (§10) — remember conformance runs with default symbols `AAPL`/`BTC-USD`, so a venue-scoped plugin whose `getQuote('AAPL')` throws will be quarantined.

### Key files for this chapter

- `packages/data-adapters/src/Provider.ts`
- `packages/data-adapters/src/providerRegistry.ts`
- `packages/data-adapters/src/conformance.ts`
- `packages/data-adapters/src/MockProvider.ts`
- `packages/data-adapters/src/provenance.ts`
- `packages/data-adapters/src/errors.ts`
- `packages/data-adapters/src/cache.ts`
- `packages/data-adapters/src/index.ts`
- `packages/data-adapters/src/BinanceProvider.ts`
- `packages/data-adapters/src/FrankfurterProvider.ts`
- `packages/data-adapters/src/DexscreenerProvider.ts`
- `packages/data-adapters/src/stubs/SecEdgarProvider.ts`
- `packages/data-adapters/src/stubs/FredProvider.ts`
- `packages/data-adapters/src/stubs/YahooProvider.ts`
- `packages/data-adapters/src/stubs/CcxtProvider.ts`
- `packages/contracts/src/provider.ts`
- `packages/contracts/src/provenance.ts`
- `packages/contracts/src/plugin.ts`
- `apps/api/src/plugins/PluginHost.ts`
- `apps/api/src/plugins/loader.ts`
- `apps/api/src/env.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/helpers.ts`
- `DATA_PROVIDERS.md`

### Open questions / known ambiguities

- SEC EDGAR and FRED are REAL adapters but physically live in packages/data-adapters/src/stubs/ (imported by the registry and re-exported from index.ts as SecEdgarProvider/FredProvider). A builder may wrongly assume everything under stubs/ is a disabled scaffold — only YahooProvider and CcxtProvider are true (zero-capability) stubs.
- PluginHost calls checkProviderConformance(provider) with NO symbol options, so a venue-scoped plugin whose getQuote('AAPL')/probe symbols throw will be quarantined even though it is correct — there is currently no way for a plugin manifest to declare which probe symbols to use.
- A new KEYED core adapter requires edits in four places (MyProvider.ts, index.ts, providerRegistry.ts instantiate()+ProviderRegistryConfig, AND both env.ts ApiConfig/loadConfig and app.ts buildApp's createProviderRegistry call); the registry factory only threads secEdgarUserAgent/fredApiKey today, so a new key silently never reaches instantiate() if app.ts is not updated.
- ProviderMode includes 'paid' and 'enterprise' but no shipped adapter uses them; the intended semantics/UX for those modes (vs 'public'/'user_supplied') are undocumented in code.
- MockProvider declares fx (and futures) true in MOCK_CAPABILITIES, but DATA_PROVIDERS.md says it does not supply fx/futures; since fx/futures have no conformance probe this mismatch is never caught — unclear whether the flags or the docs are authoritative for capability-gap UI.

---

<!-- Chapter 5: Command Kernel & Web App -->

## Command Kernel & Web App

This chapter documents how a keystroke in Tyche's command bar becomes an open panel: the parse→registry→execute pipeline in `@tyche/terminal-kernel`, the full command catalog, how commands map to lazy-loaded module panels, the Zustand state model, workspaces (react-grid-layout tiling + JSON persistence), the ⌘K command bar, keybindings, and the `apiClient`/`fetchEnvelope` pattern. It ends with the exact end-to-end recipe to add a new command + module.

**Product framing that this layer enforces (do not soften):** Tyche is a keyboard-first financial *research* terminal. There is no order placement and no buy/sell/hold advice anywhere in this pipeline — commands only *open panels that read data*. Modules never bundle market data; they call the app's own API, which resolves BYO-key / keyless / deterministic-mock providers. Provenance is carried on every response (`DataProvenance`) and surfaced in the panel frame. The command surface is clean-room: benchmarked against publicly documented terminal feature *categories*, never a proprietary product.

### The three packages involved

- **`packages/terminal-kernel/`** — UI-agnostic core: grammar parser, validated command registry, effect-producing executor, active-context model, shortcuts, help generation, and the canonical command catalog (`commands.ts`). No DOM, no React — fully unit-testable.
- **`packages/module-sdk/`** — the contract for a panel module: `ModuleDefinition`, `ModulePanelProps`, `ModuleRegistry`, capability-gap helpers.
- **`packages/contracts/`** — Zod schemas + types shared everywhere (`CommandDescriptor`, `ProviderCapabilities`, `Workspace`, `Panel`, `UserPreferences`, `CommandParseResult`, `CommandEffect` types live in the kernel but reference these).
- **`apps/web/`** — the React/Vite terminal: `terminal/` (wiring), `modules/` (panel components + registry), `state/` (Zustand stores), `workspace/` (grid + persistence), `providers/` (apiClient + hooks), `app/` (App shell, boot, auth/onboarding).

The kernel is UI-agnostic by design: executing a command produces **declarative effects** (`CommandEffect[]`) that the host interprets. This is what keeps the whole grammar/routing layer testable without a browser.

---

### 1. The parse → registry → execute pipeline

#### Entry point (web): `apps/web/src/terminal/execute.ts`

```ts
export function executeInput(raw: string): void {
  const terminal = useTerminalStore.getState();
  const defaultCommandId = usePreferencesStore.getState().preferences.defaultCommandId; // 'DES'
  const parse = parseCommand(raw, { registry: commandRegistry, defaultCommandId });
  const effects = executeCommand(parse, {
    activeInstrument: terminal.activeInstrument,
    recentCommands: terminal.recentCommands,
    defaultCommandId,
    availableCapabilities: terminal.capabilities,
  }, commandRegistry);
  terminal.pushRecentCommand(raw);
  for (const effect of effects) applyEffect(effect);
}
```

`commandRegistry` is a singleton built once in `apps/web/src/terminal/registry.ts` via `createDefaultRegistry()` (kernel), which registers every entry in `DEFAULT_COMMANDS`.

#### Step 1 — Parser: `packages/terminal-kernel/src/parser.ts`

`parseCommand(input, options): CommandParseResult`. Grammar (tolerant, original — does **not** depend on proprietary behavior):

```
<symbol?> <yellow-key>* <command?> <args...>
```

Algorithm:
1. Tokenize on whitespace.
2. **Command** = the *last* token that resolves (via `registry.resolveCommand`) to a command id or alias (case-insensitive).
3. Classify remaining tokens: **yellow keys** (stripped; may set an `assetClassHint`), **strict symbols** (`isStrictSymbol` — matches `/^[A-Za-z][A-Za-z0-9.\-]{0,11}$/` AND already uppercase), **loose symbols** (symbol-shaped but lowercase).
4. **Instrument selection**: prefer the first strict ticker. A loose token is promoted to instrument *only* when the command `requiresInstrument` (`aapl des`) or it is the sole bare token (`aapl`). This keeps `SECF apple` and `find tesla` as free-text queries, not tickers.
5. Everything unconsumed → `args` (and joined → `query`).
6. Disposition: if no command resolved but an instrument was found → `finalCommandId = defaultCommandId` (DES). If no command and only a query → `isFreeText = true`. If nothing → `ok = false` with an error.

`CommandParseResult` (schema in `packages/contracts/src/terminal.ts`): `{ raw, tokens, commandId, matchedAlias, instrument, args, query, assetClassHint, isFreeText, ok, error?, suggestions }`.

Worked examples (all covered by `parser.test.ts`):
- `AAPL` → DES on AAPL (default command)
- `AAPL DES` / `AAPL US Equity DES` → DES on AAPL (yellow keys `US`, `EQUITY` stripped; equity hint)
- `DES` → DES on the active instrument (symbol comes from context in the executor)
- `SECF apple` → SECF with `query="apple"`
- `find tesla` → free-text search fallback (`isFreeText`)

Yellow keys and asset-class inference live in `packages/terminal-kernel/src/aliases.ts` (`DEFAULT_YELLOW_KEYS`, `ASSET_CLASS_KEYWORDS`, `inferAssetClass`, `looksLikeCrypto` → `BTC-USD` style becomes `crypto`).

#### Step 2 — Registry: `packages/terminal-kernel/src/registry.ts`

`CommandRegistry` holds `byId: Map<id, RegisteredCommand>` and `aliasToId: Map<UPPER, id>`. On `register()` each descriptor is validated against `CommandDescriptorSchema` (Zod) and **loudly rejects** duplicate ids and alias collisions. Key methods: `resolveCommand(token)` (used by parser), `get(id)`, `resolve(token)`, `list()`, `size()`. `validateCommandSurface(commands)` returns a structured `{ ok, errors }` report for boot/test guards without throwing.

#### Step 3 — Executor: `packages/terminal-kernel/src/executor.ts`

`executeCommand(parse, context, registry): CommandEffect[]`. **Capability gaps never throw** — they ride along on the `open-panel` effect so the module renders a graceful "missing capability" state. Logic:
- `!parse.ok` → `[{kind:'message', level:'error', text}]`
- `parse.isFreeText` → `[{kind:'search', query}]`
- Resolve command; unknown → error message.
- Compute `symbol`/`assetClass` from `parse.instrument` ?? `context.activeInstrument`.
- Compute `missing = missingCapabilities(command.requiredCapabilities, context.availableCapabilities)` (from `capabilities.ts`).
- If `parse.instrument` set → prepend `{kind:'set-active-instrument'}`.
- If `command.requiresInstrument && !symbol` → warn "needs an instrument".
- If `acceptedAssetClasses` non-empty and the active class isn't allowed → warn.
- If the command has a custom `handler` → return its effects (only **ECO** uses one — it takes a FRED series id from the typed line, never inheriting the active equity).
- Otherwise emit the default `open-panel` effect with `moduleId`, `commandId`, `symbol`, `title` (`` `${symbol} · ${id}` `` or the command title), `args`, `assetClass`, `missingCapabilities`.

`CommandEffect` union (`packages/terminal-kernel/src/types.ts`): `open-panel | set-active-instrument | search | message | noop`.

#### Step 4 — Apply effects (web): back in `execute.ts`

`applyEffect(effect)` switches on `effect.kind`:
- `set-active-instrument` → `terminalStore.setActiveInstrument`
- `open-panel` → looks up default size from `moduleRegistry.get(moduleId)?.defaultPanelSize` and calls `workspaceStore.openPanel({ moduleId, commandId, symbol, title, w, h, state: { args } })`
- `search` → opens the `search` module panel with `state: { query }`
- `message` → `terminalStore.pushMessage(level, text)`
- `noop` → nothing

Tested end-to-end in `apps/web/src/terminal/execute.test.ts`.

---

### 2. Full command catalog — `packages/terminal-kernel/src/commands.ts`

`DEFAULT_COMMANDS: RegisteredCommand[]` is the **single source of truth** for both the command registry and the module registry. Each entry is built with `cmd({...})` which defaults `aliases/requiresInstrument/acceptedAssetClasses/requiredCapabilities/examples`. 45 commands, all `stable`. `requiresInstrument` column: ✔ = must have a symbol.

| id | aliases | category | moduleId | requiredCapabilities | reqInstr | maturity |
|----|---------|----------|----------|----------------------|:---:|----------|
| HELP | ? | core | help | — | | stable |
| SECF | SEARCH, FIND | core | search | — | | stable |
| AI | COPILOT, ASK | system | ai | — | | stable |
| LAYOUT | WS, LAYOUTS | system | layout-manager | — | | stable |
| SETTINGS | PDF, PREFS, SET | system | settings | — | | stable |
| ACCOUNT | SUB, BILLING | system | account | — | | stable |
| ADMIN | METRICS, MRR | system | admin | — | | stable |
| DES | DESC | research | description | quotes | ✔ | stable |
| GP | G, CHART | market-data | chart | historicalPrices | ✔ | stable |
| GIP | INTRADAY, INTRA | market-data | intraday-chart | intradayPrices | ✔ | stable |
| HP | HIST | market-data | history-table | historicalPrices | ✔ | stable |
| QM | QUOTE, MON | market-data | quote-monitor | quotes, batchQuotes | | stable |
| FOCUS | FOC | market-data | focus | quotes | ✔ | stable |
| W | WATCH, WL | portfolio | watchlist | quotes | | stable |
| N | NEWS | news | news | news | | stable |
| TOP | TAPE, WIRE | news | top-news | news | | stable |
| CF | FILINGS, FIL | fundamentals | filings | filings | ✔ | stable |
| CFV | FILDOC | fundamentals | filing-viewer | filings | ✔ | **beta** |
| FA | FIN, FINANCIALS | fundamentals | financials | fundamentals | ✔ | stable |
| EM | ESTIMATES | fundamentals | estimates | estimates | ✔ | stable |
| ERN | EARN, EARNINGS | fundamentals | earnings | estimates | ✔ | **beta** |
| ANR | RATINGS | research | analyst-ratings | analystRatings | ✔ | stable |
| HDS | HOLDERS | research | holders | ownership | ✔ | stable |
| OMON | OPT, OPTIONS | market-data | options-monitor | options | ✔ | stable |
| TAS | TIMESALES | market-data | time-and-sales | trades | ✔ | stable |
| BOOK | DOM, DEPTH | market-data | order-book | orderBook | ✔ | stable |
| FX | FXC, CURRENCY | market-data | fx | fx | | stable |
| HEAT | MAP, TREEMAP | market-data | heatmap | screener | | stable |
| MEMB | MEMBERS, CONSTITUENTS | research | membership | membership | ✔ | stable |
| FUND | FUNDING, FUNDR | market-data | funding | fundingRates | | stable |
| DEX | ONCHAIN, POOLS | market-data | dex | dexPools | | stable |
| COMM | CMDTY, COMMODITIES, GLCO | market-data | commodities | futures | | stable |
| WEI | INDICES, WORLD | market-data | world-indices | quotes | | stable |
| NOTE | NOTES, NB | system | notes | — | | stable |
| PORT | PORTFOLIO | portfolio | portfolio | quotes | | stable |
| ALERT | ALERTS, ALRT | system | alerts | quotes | | stable |
| COMP | HMS, COMPARE | analytics | compare | historicalPrices | ✔ | stable |
| EQS | SCREEN, SCREENER | analytics | screener | screener | | stable |
| MOST | MOVERS, GAINERS | market-data | movers | screener | | stable |
| ECO | ECON, MACRO | market-data | economics | economicSeries | | stable (custom `handler`) |
| EVT | EVENTS, CAL | research | events | events | | stable |
| OVME | OPRICE, OPTVAL | analytics | option-pricer | — | | stable |
| CALC | FINCALC, TVM | analytics | calculator | — | | stable |

Notes:
- **ERN** is the only command whose `moduleId` (`earnings`) has *no* entry in `moduleComponents` — it falls back to `BetaPlaceholder`. **CFV** is marked `beta` but *does* have a real component (`filing-viewer`).
- `requiredCapabilities: []` commands (HELP, SECF, AI, LAYOUT, SETTINGS, ACCOUNT, ADMIN, NOTE, OVME, CALC) always work — no provider needed. OVME (Black–Scholes) and CALC (TVM/CAGR) are local educational analytics, explicitly "not advice".
- Every capability name is one of the 24 keys in `PROVIDER_CAPABILITY_KEYS` (`packages/contracts/src/provider.ts`).
- `maturity` drives the badge in the panel frame and the `assertModuleCoverage` guard (stable commands MUST have a real component).
- `category` drives HELP grouping order (`help.ts` `CATEGORY_ORDER`). A `crypto` category exists in the enum but no command currently uses it.

---

### 3. Module / panel system — how a command maps to a lazy-loaded panel

**Command → module is derived, not hand-maintained.** `apps/web/src/modules/registry.ts::buildDefinitions()` iterates `DEFAULT_COMMANDS` and collapses commands by `moduleId` into `ModuleDefinition<ModuleComponent>`, merging `commandIds` and unioning `requiredCapabilities`. `component = moduleComponents[moduleId] ?? BetaPlaceholder`. `hasStreaming` is true for `STREAMING_MODULES = { 'quote-monitor', 'watchlist', 'time-and-sales' }`. It then registers all into the `moduleRegistry` singleton (`ModuleRegistry` from `@tyche/module-sdk`), which validates each manifest and rejects duplicate module ids / conflicting command→module mappings.

**Lazy components:** `apps/web/src/modules/components.ts` is `Record<moduleId, ModuleComponent>` where every value is `React.lazy(() => import('./XModule').then(m => ({ default: m.XModule })))`. Each entry keeps a **literal** `import()` so the bundler makes one chunk per module and the entry bundle stays small. `ModuleComponent` (`modules/types.ts`) = `ComponentType<ModulePanelProps> | LazyExoticComponent<...>`.

**Rendering a panel:** `apps/web/src/workspace/PanelHost.tsx` resolves `moduleRegistry.get(panel.moduleId)?.component ?? BetaPlaceholder`, wraps it in `<Suspense fallback="Loading module…">`, wraps that in `<PanelFrame>` (title, symbol, `maturity` badge, provenance footer, link-group dot, min/max/close), and passes `ModulePanelProps`:

```ts
interface ModulePanelProps {           // packages/module-sdk/src/PanelState.ts
  panelId; moduleId; symbol: string|null; args: string[]; commandId; assetClass;
  state: Record<string,unknown>; setState; setSymbol?;   // setSymbol propagates to linked panels
  missingCapabilities: ProviderCapability[]; active: boolean;
  reportProvenance?(p): void;          // lifts DataProvenance to the frame footer
  reportSummary?(s): void;             // lifts a text digest to the AI copilot context
}
```

**Standard module shape** (see `modules/FocusModule.tsx` for a minimal example): call `useApiData(() => api.getX(symbol), [symbol])`, wrap output in `<ModuleBody state=... missingCapabilities=...>` (the render ladder capability-gap → loading → error → empty → content, in `modules/common.tsx`), and lift provenance/summary with `useReportProvenance`/`useReportSummary`. `BetaPlaceholder` (`modules/BetaPlaceholder.tsx`) renders an `EmptyState` explaining which capabilities the scaffold will need.

**Coverage guard:** `assertModuleCoverage()` (in `modules/registry.ts`) throws if any `stable` command lacks a real component. `modules/registry.test.ts` asserts routing, capability gating, and that every `moduleComponents` value is a `React.lazy` (`$$typeof === Symbol.for('react.lazy')`).

---

### 4. Zustand stores (`apps/web/src/state/`)

**`terminalStore.ts` — `useTerminalStore`** (global terminal state, read imperatively via `.getState()` in non-React code):

```
activeInstrument: InstrumentIdentifier | null
recentCommands: string[]                 // deduped, capped 50
capabilities: ProviderCapabilities       // starts allCapabilitiesTrue(), overwritten by /api/health
providers: ProviderDescriptor[]
mode: string                             // 'mock' | ... (from health)
appMode: 'selfhost' | 'hosted'
demo: boolean                            // read-only public demo
user: TerminalUser | null                // hosted auth: { id, email, admin, billing? }
messages: TerminalMessage[]              // toast queue, keeps last ~5
```
Key actions: `setActiveInstrument`, `pushRecentCommand`, `setCapabilities`, `setProviders`, `setMode`, `setAppMode`, `setDemo`, `setUser`, `pushMessage(level,text)`, `dismissMessage(id)`.

**`workspaceStore.ts` — `useWorkspaceStore`** (the active layout; see §5).

State: `id, name, panels: Panel[], activePanelId, cols(12), rowHeight(30), closedStack: Panel[], createdAt`.
Key actions: `openPanel(input) → id` (appends a `Panel` with a fresh id, alternates x∈{0,6}, `y:1000` so grid vertical-compaction drops it to the bottom, `activePanelId = new`), `closePanel` (pushes to `closedStack`, capped 20), `undoClose`, `setActivePanel`, `setLinkedSymbol(sourceId, symbol)` (broadcasts to every panel sharing the source's `linkGroup`, else just the source; also writes `state.args=[symbol]`), `focusNextPanel`/`focusPrevPanel` (wrap-around), `toggleMinimize`, `toggleMaximize`, `applyLayout(items)` (from grid drag/resize; no-op if unchanged), `setPanelState`, `cyclePanelLink` (cycles through `LINK_COLORS`, then null), `rename`, `clearAll`, `newWorkspace(name)`, `loadWorkspace(ws)`, `toWorkspace(activeInstrument) → Workspace` (serialize; preserves original `createdAt`).

**`preferencesStore.ts` — `usePreferencesStore`**: `{ preferences: UserPreferences }` + `setPreferences`, `patch(partial)`. `UserPreferences` (`contracts/workspace.ts`) includes `theme`, `density`, `defaultProvider`, `defaultCommandId` (default `'DES'`), `keymap` (rebind overrides), `flags`, `disabledPlugins`, `onboardingRole`. Hydrated from `/api/preferences` at boot.

**`aiContextStore.ts`** — per-panel provenance + summary packets for the AI copilot (fed by `PanelHost`'s `reportProvenance`/`reportSummary`).

---

### 5. Workspaces — named layouts, tiling, persistence

**Tiling:** `apps/web/src/workspace/WorkspaceGrid.tsx` uses **react-grid-layout** (`WidthProvider(GridLayout)`), `cols=12`, `rowHeight=30`, `margin=[8,8]`, `draggableHandle=".panel-drag-handle"`, `draggableCancel=".no-drag"`, `compactType="vertical"`. Each `Panel.grid` (`{x,y,w,h}`, `minW:2,minH:3`) maps to a layout item; `onLayoutChange` → `workspaceStore.applyLayout`. Empty state shows a hint (`AAPL DES`, `QM`, `HELP`); a `maximized` panel renders full-bleed instead of the grid. Each panel is a `PanelHost` (§3).

**Schema:** `Workspace`/`Panel` in `packages/contracts/src/workspace.ts` (`WORKSPACE_SCHEMA_VERSION = 1`). `Panel = { id, moduleId, commandId, symbol, title, grid, state, linkGroup, minimized, maximized, createdAt }`.

**Persistence:** `apps/web/src/workspace/persistence.ts`:
- `saveCurrentWorkspace()` — serialize (`toWorkspace`), mirror to `localStorage` (`STORAGE_KEYS.workspace`, `.lastWorkspaceId`), then `api.saveWorkspace(ws)`; toasts "saved".
- `restoreWorkspace()` — localStorage mirror first (validated via `WorkspaceSchema.safeParse`), else `api.getWorkspace(lastId)`. Called at boot.
- `switchWorkspace(ws)`, `saveWorkspaceAs(name)` (forks under a new `ws_<uuid>` id), `exportWorkspaceJson()` / `importWorkspaceJson(text)` (both validate against `WorkspaceSchema`; import rejects bad JSON/shape with a toast).

**UIs:** the **LAYOUT** command opens `LayoutManagerModule.tsx` (list all saved layouts via `api.getWorkspaces()`, open/save-current/save-as/new-empty/delete; active layout can't be deleted). The **Header** (`app/Header.tsx`) has Save / New / Reopen / Export (download `<name>.json`) / Import (file picker → `importWorkspaceJson`) plus the editable workspace name.

**Panel linking:** each panel has an optional `linkGroup` color (`LINK_COLORS` in `constants.ts`). Retargeting a symbol in one panel (`setSymbol`) broadcasts to all panels in the same group via `setLinkedSymbol` and moves the global `activeInstrument`.

---

### 6. Command bar (⌘K + fuzzy autocomplete)

**Container:** `apps/web/src/terminal/CommandBarContainer.tsx` wires the presentational `CommandBar` (`packages/ui/src/CommandBar.tsx`). It merges two suggestion sources (max 8):
1. **Command suggestions** — synchronous, from `terminal/suggest.ts::buildCommandSuggestions(value, COMMANDS)`. Ranking on the token being typed: id prefix (0) > alias prefix (1) > subsequence/fuzzy on id, ≥2 chars (2) > title substring, ≥3 chars (3). So `QM`, `MON`, `OMN`, `option` all resolve. Completions preserve everything before the current token.
2. **Symbol suggestions** — async, debounced 150ms, only when `wantsSymbolSuggestions` says the first token is symbol-shaped and not an exact command. Rides the provider-agnostic `api.search(query)` so *any* enabled provider's universe feeds the popup (never a hardcoded list). Each suggestion's `id` has a trailing space (Enter runs the bare symbol → default command; Tab leaves the cursor ready for a command).

**Keyboard (in `CommandBar.tsx`):** with the popup open — ↓/↑ move selection, **Tab** fills the input with the selection, **Enter** runs it, **Esc** dismisses the popup (a second Esc blurs via the app handler). With no popup — ↑/↓ walk `recentCommands` history; **Enter** submits the raw line via `executeInput`. A `›` prompt, an active-symbol chip, and a `⌘K` kbd hint are shown.

**Focus:** ⌘K/Ctrl+K focuses the bar — handled by the global keydown in `App.tsx` (action `focusCommandBar`), not by the component itself.

---

### 7. Keybindings

**App-level (the one the web app actually uses):** `apps/web/src/terminal/keybindings.ts` + the global `keydown` handler in `app/App.tsx`. Three **rebindable** actions:

| action id | default combo | effect |
|-----------|--------------|--------|
| `focusCommandBar` | `mod+k` | focus command input |
| `saveWorkspace` | `mod+s` | `saveCurrentWorkspace()` |
| `reopenPanel` | `mod+shift+z` | `workspaceStore.undoClose()` |

`comboFromEvent` normalizes to a lowercase `mod+shift+alt+key` string (`mod` collapses ⌘/Ctrl). `resolveBindings(keymap)` overlays the user's `UserPreferences.keymap` onto defaults and returns `byAction`/`byCombo`; `conflictingCombos` flags collisions for the Settings UI. Overrides persist in prefs and apply live (read on each keydown). **Fixed contextual keys** (not rebindable): `Tab`/`Shift+Tab` cycle panel focus (never while typing in a field), `Esc` blurs the command bar. A modifier-less custom chord is suppressed while typing in an input/textarea.

**Kernel-level:** `packages/terminal-kernel/src/shortcuts.ts` also defines `DEFAULT_SHORTCUTS` + a `ShortcutRegistry` (`mod+k`, `mod+s`, `mod+/`, `mod+shift+z`, `esc`, `alt+arrow…`). This is the kernel's reusable shortcut model; the current web app implements its own subset in `terminal/keybindings.ts` (see Open Questions).

---

### 8. `apiClient` / `fetchEnvelope` (never throws)

`apps/web/src/providers/apiClient.ts`. `API_BASE_URL` = `VITE_API_BASE_URL` ?? `http://localhost:4010`.

**`fetchEnvelope<T>(path, init): Promise<EnvelopeResult<T>>`** is the contract every data call goes through and it **never throws**:

```ts
type EnvelopeResult<T> =
  | { ok: true;  data: T;          provenance: DataProvenance | null }
  | { ok: false; error: ApiError;  provenance: DataProvenance | null };
```

It sends `credentials:'include'` + JSON headers, parses the body, and: returns `{ok:false,error}` if the body carries `error`; returns an `http_error` on non-2xx with no error body; catches thrown/network failures into `{ok:false, error:{kind:'network_error'}}`. **Provenance is carried even on failures** — a capability gap or error still names the would-be provider, so the panel footer never reads "no provenance available." (Two methods intentionally bypass the envelope and return `T | null`: `getHealth()` and `aiChat()`.)

`api` is a flat object of typed methods: auth (`authMe/Register/Login/Logout/…`), billing/admin, `getProviders/getPlugins/getAudit`, and one method per capability endpoint — `search`, `getQuote/getQuotes`, `getHistory/getIntraday`, `getTrades/getOrderBook`, `getNews/getFilings/getEvents/getEstimates/getRatings/getOwnership/getFinancials/getOptions`, `screen`, `getFunding/getDexPools/getMembership/getEconomicSeries`, plus workspaces/watchlists/preferences/portfolios/alerts/notes CRUD.

**Consumption:** modules use `useApiData(loader, deps)` (`providers/useApiData.ts`), which tracks `loading/error/provenance`, exposes `reload()`, and **distinguishes a graceful `capability_unavailable` response from a hard error** (the former routes to an `EmptyState` naming the capability, not an error). `ModuleBody` renders the standard ladder off this state.

**Health boot:** `App.tsx` calls `api.getHealth()` → sets `capabilities/mode/appMode/demo`; in `hosted` mode it gates behind `api.authMe()` (AuthScreen if no session, PaywallScreen if trial expired + billing on), then hydrates providers, preferences, and the last workspace, and may seed a demo layout (`VITE_DEMO_WORKSPACE=1`) or show role-preset onboarding.

---

### 9. Recipe — add a new command + module end to end

Concrete example: a `SPRD` command ("bid/ask spread board") mapping to module `spread`, needing `quotes`.

**1. (Only if the capability is new) add it to the contract** — `packages/contracts/src/provider.ts`: append the key to `PROVIDER_CAPABILITY_KEYS` **and** add the matching boolean field to `ProviderCapabilitiesSchema`. (`quotes` already exists, so skip for this example.)

**2. Add the command to the kernel catalog** — `packages/terminal-kernel/src/commands.ts`, a new `cmd({...})` in `DEFAULT_COMMANDS`:

```ts
cmd({
  id: 'SPRD',                       // MUST match /^[A-Z][A-Z0-9]*$/, unique
  aliases: ['SPREAD'],              // must not collide with any existing id/alias
  title: 'Spread board',
  description: 'Live bid/ask spreads across symbols. Read-only, no advice.',
  category: 'market-data',
  moduleId: 'spread',               // the module key you will create in step 3
  defaultPanelSize: { w: 6, h: 12 },
  maturity: 'stable',               // 'stable' REQUIRES a real component (step 3)
  requiredCapabilities: ['quotes'],
  examples: ['SPRD', 'AAPL SPRD'],
}),
```
No further kernel wiring — `createDefaultRegistry()` registers it, the parser resolves it, and the executor emits the default `open-panel` effect. Add a custom `handler` only for non-default routing (see `ECO`).

**3. Create the panel component** — `apps/web/src/modules/SpreadModule.tsx`, a named export taking `ModulePanelProps`:

```tsx
import type { ModulePanelProps } from '@tyche/module-sdk';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance } from './common';

export function SpreadModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const state = useApiData(() => api.getQuote(symbol ?? 'AAPL'), [symbol]);
  useReportProvenance(reportProvenance, state.provenance);
  return (
    <ModuleBody state={state} missingCapabilities={missingCapabilities}>
      {(q) => <div className="p-3 font-mono text-sm">{q.symbol}: {q.ask - q.bid}</div>}
    </ModuleBody>
  );
}
```

**4. Register it lazily** — `apps/web/src/modules/components.ts`, one line keyed by the `moduleId`:

```ts
spread: lazy(() => import('./SpreadModule').then((m) => ({ default: m.SpreadModule }))),
```
The `moduleRegistry` rebuilds from `DEFAULT_COMMANDS` on import, so this is the only registration needed. (Omit it and a `stable` command fails `assertModuleCoverage`; a `beta`/`stub` command would silently render `BetaPlaceholder`.)

**5. (If it streams)** add the `moduleId` to `STREAMING_MODULES` in `apps/web/src/modules/registry.ts`.

**6. Backend** — implement the capability in the provider layer + expose the `/api/...` route (out of scope for this dimension, covered in the data-provider chapter). With the mock provider, `quotes`-based commands work with zero keys immediately.

**7. Verify** — run the kernel tests (`packages/terminal-kernel` — parser/registry/executor) and `apps/web/src/modules/registry.test.ts` (routing + lazy + coverage). Type `SPRD` / `AAPL SPRD` in the running app; the chunk loads on first open.

**Do NOT:** place orders, emit buy/sell/hold advice, hardcode a symbol universe (use `api.search`), bundle/embed vendor data, or strip provenance — always thread `reportProvenance`.

### Key files for this chapter

- `packages/terminal-kernel/src/commands.ts`
- `packages/terminal-kernel/src/parser.ts`
- `packages/terminal-kernel/src/registry.ts`
- `packages/terminal-kernel/src/executor.ts`
- `packages/terminal-kernel/src/types.ts`
- `packages/terminal-kernel/src/aliases.ts`
- `packages/terminal-kernel/src/capabilities.ts`
- `packages/terminal-kernel/src/shortcuts.ts`
- `packages/terminal-kernel/src/help.ts`
- `packages/contracts/src/terminal.ts`
- `packages/contracts/src/provider.ts`
- `packages/contracts/src/workspace.ts`
- `packages/module-sdk/src/ModuleDefinition.ts`
- `packages/module-sdk/src/ModuleRuntime.ts`
- `packages/module-sdk/src/PanelState.ts`
- `packages/module-sdk/src/capabilities.ts`
- `apps/web/src/terminal/execute.ts`
- `apps/web/src/terminal/registry.ts`
- `apps/web/src/terminal/suggest.ts`
- `apps/web/src/terminal/keybindings.ts`
- `apps/web/src/terminal/CommandBarContainer.tsx`
- `apps/web/src/modules/registry.ts`
- `apps/web/src/modules/components.ts`
- `apps/web/src/modules/types.ts`
- `apps/web/src/modules/common.tsx`
- `apps/web/src/modules/BetaPlaceholder.tsx`
- `apps/web/src/modules/FocusModule.tsx`
- `apps/web/src/modules/LayoutManagerModule.tsx`
- `apps/web/src/state/terminalStore.ts`
- `apps/web/src/state/workspaceStore.ts`
- `apps/web/src/state/preferencesStore.ts`
- `apps/web/src/workspace/WorkspaceGrid.tsx`
- `apps/web/src/workspace/PanelHost.tsx`
- `apps/web/src/workspace/persistence.ts`
- `apps/web/src/providers/apiClient.ts`
- `apps/web/src/providers/useApiData.ts`
- `apps/web/src/app/App.tsx`
- `apps/web/src/app/Header.tsx`
- `apps/web/src/constants.ts`
- `packages/ui/src/CommandBar.tsx`

### Open questions / known ambiguities

- Two keybinding systems coexist: the kernel's shortcuts.ts (DEFAULT_SHORTCUTS/ShortcutRegistry, incl. mod+/, alt+arrows) and the web app's terminal/keybindings.ts (only 3 rebindable actions + fixed Tab/Esc). The web App.tsx uses the latter and does NOT consume the kernel ShortcutRegistry — so kernel shortcuts like mod+/ (HELP) and alt+arrow panel focus are defined but not wired in the current UI. Unclear if the kernel model is intended to supersede the app one.
- ERN (aliases EARN/EARNINGS) points at moduleId 'earnings', which has no entry in moduleComponents, so it renders BetaPlaceholder. It is the only such gap; unclear whether a real earnings module is planned or ERN should be folded into EM (estimates).
- RegisteredCommand.handler is a general escape hatch but only ECO uses one in the whole catalog. There is no documented pattern/registry for handlers beyond 'return effects'; a builder adding complex routing has only ECO as a reference.
- PanelHost passes assetClass={null} to every module regardless of the parsed/active asset class, and setSymbol defaults a bare retarget to assetClass:'equity'. Modules needing crypto/fx-specific behavior on a manual retarget can't rely on assetClass from props today.
- The 'crypto' CommandCategory exists in the enum and help ordering but no command uses it; crypto-flavored commands (DEX, FUND, BOOK) live under 'market-data'. Unclear if 'crypto' is reserved for future grouping.

---

<!-- Chapter 6: Hosted / SaaS Layer -->

## Hosted / SaaS Layer

This chapter documents the multi-user SaaS layer of the Tyche API — the code that turns the single-user self-host terminal into a hosted, account-based, optionally-paywalled service **without changing a single route handler**. Everything here lives in `apps/api/src/`. The whole layer is opt-in via `TYCHE_MODE=hosted`; with the default `selfhost` it is inert.

Product-vision anchor (do not soften): the hosted mode **sells software + hosting, never data**. Market data still comes from operator-connected BYO-key providers or keyless public sources; the mock provider makes the app fully usable with zero keys. Billing gates *access to the software*, not data resale. Every response still carries a `provenance` stamp (see `apps/api/src/routes/helpers.ts` `localProvenance()`/`gapProvenance()`).

---

### 1. selfhost vs hosted — the mode switch

`ApiConfig.mode: 'selfhost' | 'hosted'` (`apps/api/src/env.ts`), read from `TYCHE_MODE` (`env.TYCHE_MODE === 'hosted' ? 'hosted' : 'selfhost'`). The single boolean `const hosted = config.mode === 'hosted'` in `apps/api/src/app.ts` (line 103) fans out into every difference:

| Concern | selfhost (default) | hosted |
| --- | --- | --- |
| Accounts | none — one implicit local user | `UserRegistry` (`saas/users.ts`) |
| Data store | one shared `PersistenceStore` | `scopedPersistence()` over per-user `UserStores` |
| Audit actor | `'local'` | authenticated user email via `scopedAudit()` |
| Session auth | none | `onRequest` hook resolves HMAC cookie |
| Billing | never | `none` / `mock` / `stripe` driver |
| Email | never | `EmailSender` (console/http) for reset |
| `trustProxy` | `false` (direct peer) | `config.trustProxyHops` (default 1) |
| Boot requirement | none | `TYCHE_SESSION_SECRET` (≥16 chars) or **throws** |

In hosted mode `buildApp()` constructs `UserRegistry`, `UserStores`, `EmailSender`, and (if billing≠none) a `BillingDriver`, then wraps the shared `persistence` in `scopedPersistence(persistence)` and the shared `audit` in `scopedAudit(audit)` before putting them on `AppContext` (`apps/api/src/context.ts`). Because routes only ever touch `ctx.persistence` / `ctx.audit`, the per-user routing is invisible to them.

Hard boot guard (`app.ts` lines 109-111):
```ts
if (!config.sessionSecret || config.sessionSecret.length < 16) {
  throw new Error('TYCHE_MODE=hosted requires TYCHE_SESSION_SECRET (>= 16 chars).');
}
```

---

### 2. Request lifecycle in `app.ts` (the hooks, in execution order)

Fastify runs all `onRequest` hooks (in registration order) → `preHandler` hooks → route handler → `onResponse`. Tyche registers, in this order:

1. **CORS + cookie plugins** (`app.register(cors, …)`, `app.register(cookie)`). CORS `origin: config.webOrigin` (single `WEB_ORIGIN` allow-list for both REST and SSE), `credentials: true`, methods `GET/POST/DELETE/PUT/PATCH/OPTIONS`.

2. **`preHandler`: bearer-token guard** — `createAuthGuard(config)` from `security/auth.ts`. This is the **self-host** guard, off unless `TYCHE_AUTH_ENABLED=true`. When on, it requires `Authorization: Bearer <TYCHE_AUTH_TOKEN>` on mutations (POST/PUT/DELETE/PATCH) **and** on `GET /api/audit`. It is independent of hosted session auth; in hosted deployments it is normally left off. (Registered as `preHandler`, so it runs *after* the onRequest hooks below.)

3. **`onRequest`: demo read-only guard** — only added when `config.demo` (`TYCHE_DEMO=true`). Rejects every persistence-mutating request with `403 read_only_demo`:
   ```ts
   const READ_ONLY_POSTS = new Set(['/api/screen', '/api/ai/chat']);
   const WRITE_METHODS = new Set(['POST','PUT','DELETE','PATCH']);
   // block if path starts /api/ AND method is a write AND not an allow-listed non-persisting POST
   ```
   GETs, SSE streams, market data, the screener (`POST /api/screen`) and the AI copilot (`POST /api/ai/chat`) still work — they don't persist. This lets a shared no-signup instance run un-vandalizable.

4. **`onRequest`: session auth + per-user scoping + paywall** — only added when `hosted && users && userStores` (`app.ts` lines 248-298). This is the **load-bearing** hosted hook and is the **last onRequest hook registered**, which matters (see §7). Its logic:
   - Compute path classes:
     - `shared` = not `/api/*` **or** `/api/health` **or** `/api/ready` **or** `/api/auth/*` **or** `OPTIONS`.
     - `paywallExempt` = `shared` **or** `/api/billing*` **or** `/api/account/export` (an expired trial must still sign in, read status, pay, and **export** — "cancel anytime, export everything").
     - `anonOpen` = `shared` **or** `/api/billing/webhook` (Stripe/mock calls it unauthenticated; it is signature-verified instead).
   - Extract token: `request.cookies[SESSION_COOKIE]` (`tyche_session`) **or** `Authorization: Bearer <token>`.
   - `claims = verifySession(secret, token)`; `user = accounts.get(claims.userId)`.
   - **Valid session** iff `user && claims && user.tokenEpoch === claims.tokenEpoch` (epoch match is what makes password change / reset kill old sessions):
     - Paywall check: `if (paywalled && !paywallExempt && !user.admin && entitlement(user.billing) === 'expired')` → **`402 payment_required`**. `paywalled = Boolean(billing)`. Admins are never paywalled out of their own service.
     - `accounts.touch(user.id, nowIso())` (hour-throttled activity stamp).
     - `stores.forUser(user.id).then(store => requestScope.run({ user, store }, done))` — resolve the user's store and run the **rest of the lifecycle inside the `AsyncLocalStorage` scope**.
   - Else if `anonOpen` → `done()` (no scope; e.g. health, auth, webhook, static assets).
   - Else → **`401 unauthorized`**.

5. **`onResponse`: structured access log** — one JSON line per request `{level, at, reqId, method, path, status, ms}` (path is query-stripped; no headers/body). Skipped under `process.env.VITEST`.

Cross-cutting handlers registered in `buildApp()`:
- **`setErrorHandler`** — logs every 5xx as one structured JSON line to stderr and returns a generic `{error:{kind:'internal'}}` body (never leaks internals); 4xx keep their message.
- **`onClose`** — closes persistence (`ctx.persistence.close?.()`), flushes `FileAuditSink`, and (hosted) `stores.closeAll()`.
- **static/SPA** — if `config.serveWeb` set, `@fastify/static` serves the built web app with an SPA fallback (`setNotFoundHandler` → `index.html` for non-`/api/` GETs). Else `GET /` returns `{name:'tyche-api',status:'ok',health:'/api/health'}`.

---

### 3. `UserRegistry` (`saas/users.ts`) — accounts, scrypt, tokenEpoch, reset tokens

A single JSON document `<dataDir>/users.json` (`{ users: UserRecord[] }`), loaded fully into memory on `init()`; writes are atomic (temp file + `rename`) and serialized through a promise `queue`. Per-user *terminal* data lives elsewhere (see `UserStores`).

`UserRecord`: `{ id: 'u_<hex>', email (lowercased), passwordHash, salt, createdAt, admin, tokenEpoch, billing: BillingState, lastSeenAt?, resetTokenHash?, resetTokenExpiresAt? }`. `PublicUser` (via `toPublicUser`) exposes only `{id, email, admin, createdAt, billing}` — never the hash/salt.

- **Passwords (scrypt):** `scryptAsync(password, salt, 64)` with a per-user 16-byte hex salt; stored as 64-byte hex. Verify uses `timingSafeEqual`. `verify()` on an **unknown email still burns one scrypt** (`'tyche-timing-equalizer'` salt) so response timing can't reveal account existence.
- **`admin` bootstrap:** if `TYCHE_ADMIN_EMAIL` is set, **only** that exact email gets admin on registration; otherwise the **first** account (`this.users.length === 0`) is admin. This prevents a stranger who beats the operator to an exposed deployment from owning the dashboard. (Verified in `saas/hardening.test.ts` "admin bootstrap".)
- **`tokenEpoch`:** starts at `1`; every session token embeds it; bumping it invalidates **all** outstanding sessions for that user. Bumped by `applyNewPassword()` (used by both `setPassword` and `resetPassword`), which also re-salts, re-hashes, and clears any pending reset token.
- **Trial:** `create()` sets `billing = { plan:'trial', trialEndsAt: now + 14d }` (`TRIAL_DAYS = 14`).
- **Reset tokens:** `issueResetToken(email, ttl=1h)` returns the **raw** 32-byte hex token (only its `sha256` is stored in `resetTokenHash`, with `resetTokenExpiresAt`); returns `null` for an unknown email so the caller can 200 either way. `resetPassword(token, pw)` finds the user by constant-time comparing sha256 hashes among non-expired tokens, then **claims the token synchronously** (deletes `resetTokenHash`/`resetTokenExpiresAt` *before* the scrypt await) so a concurrent double-confirm can only succeed once (single-use; Node's single thread makes the check-and-clear atomic).
- **`touch(id, at)`:** stamps `lastSeenAt` at most once/hour/user (avoids rewriting `users.json` every request); fire-and-forget.
- **`remove(id)`:** drops the record only — deleting the user's *data directory* is the caller's job (`UserStores.destroy`).

---

### 4. Sessions (`saas/sessions.ts`) — stateless HMAC cookie

Token format: **`userId.tokenEpoch.expiresMs.signature`** where `signature = HMAC-SHA256(secret, "userId.epoch.expires")` base64url. No server-side session store — tokens survive restarts.

- `issueSession(secret, userId, tokenEpoch, ttl=30d)` → string.
- `verifySession(secret, token)` → `{ userId, tokenEpoch } | null`: splits into 4 parts, constant-time compares the signature, checks `expires >= now` and `tokenEpoch` is an integer. **Epoch matching against the live user is the caller's job** (done in the app.ts hook). `SESSION_COOKIE = 'tyche_session'`; `SESSION_TTL_MS = 30 * 86_400_000`.
- Cookie is set in `routes/auth.ts` `setSessionCookie()`: `httpOnly`, `sameSite:'lax'`, `secure:'auto'` (secure whenever TLS-terminated), `maxAge` 30d, `path:'/'`. The token is also accepted as a `Bearer` header for API clients.

---

### 5. Billing (`saas/billing.ts`) — drivers + entitlements

Billing is a **driver behind a small interface**; the rest of the app only reads `BillingState` / `entitlement()`.

- **`entitlement(billing, now) → 'trial' | 'pro' | 'expired'`**: `pro` if `plan==='pro'` (stays pro until a provider cancellation/deletion webhook — **never expires on a clock**, so a missed renewal degrades to "still works", not "locked-out customer"); `trial` if `trialEndsAt > now`; else `expired` (= paywall). `trialDaysLeft()` is a display helper.
- **`BillingEvent`** (provider-agnostic): `subscribed | renewed | canceled`. `applyBillingEvents(users, events, audit)` mutates the registry (sets `plan:'pro'` + Stripe ids on `subscribed`/`renewed`, `plan:'none'` on `canceled` — data kept intact, trial does not resurrect) and audits each.
- **`config.billing` = `'none' | 'mock' | 'stripe'`** (from `TYCHE_BILLING`). **Fails closed:** an unset/unknown value → `'none'`, i.e. accounts **without** a paywall — never mock (mock grants pro free). `mock` must be opted into explicitly.
  - **`MockBillingDriver`** (`name:'mock'`): `createCheckout` returns `{ url: successUrl, completed:[subscribed…] }` — checkout "succeeds" instantly, no card/network, so the full trial→paywall→upgrade→pro loop is exercisable locally. Boot logs a loud one-time warning: `[billing] MOCK billing driver active: checkout is free…`. Webhooks HMAC-signed with the deployment secret via `x-tyche-signature`.
  - **`StripeBillingDriver`** (`name:'stripe'`): plain REST against `https://api.stripe.com/v1` (form-encoded, **no SDK dependency**). `createCheckout` → `/checkout/sessions` (`mode:subscription`, `client_reference_id:user.id`, reuse `stripeCustomerId` or pass `customer_email`); `createPortal` → `/billing_portal/sessions`; `parseWebhook` verifies `Stripe-Signature` via exported `verifyStripeSignature()` (`t=…,v1=…`, HMAC of `"<t>.<payload>"`, constant-time, 300s replay tolerance) then `parseStripeEvents()` maps `checkout.session.completed` → subscribed, `customer.subscription.updated` → renewed/canceled by status, `customer.subscription.deleted` → canceled. Requires `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` or `buildApp` **throws** at boot.

Billing routes (`routes/billing.ts`) — all session-authed except the webhook: `GET /api/billing` (status), `POST /api/billing/checkout`, `POST /api/billing/portal`, and `POST /api/billing/webhook`. The webhook lives in an **encapsulated `app.register` scope** with a string content-type parser so the **raw body** is preserved for signature verification; it is `anonOpen` and signature-verified.

---

### 6. Pluggable sinks — `AuditSink` (`security/audit.ts`) and `EmailSender` (`saas/email.ts`)

Both follow the same "foundation ships console + one durable/remote option, BYO for anything else" pattern.

- **`AuditSink`** interface `{ record(event), recent(limit) }`. Shared `RingBuffer` (last 500 events, newest-first `recent()`).
  - `ConsoleAuditSink` — logs `[audit] {json}` to stdout (default, `auditSink:'console'`).
  - `FileAuditSink` — appends JSON-lines to `config.auditFile` (`TYCHE_AUDIT_SINK=file`, default `<dataDir>/audit.log`); serialized writes, failures logged never thrown, `init()` tail-seeds the ring from an existing log, `flush()` on shutdown. Rotation/retention is the operator's job.
  - Hosted mode wraps the chosen sink in **`scopedAudit()`** (`saas/requestContext.ts`) so `actor` is the authenticated user's email.
- **`EmailSender`** interface `{ name, send({to,subject,text}) }`; built by `createEmailSender(config)`.
  - `ConsoleEmailSender` (default, keyless) — logs the message so password reset is exercisable with zero setup. **In hosted mode it redacts the body** (`redactBody = config.mode === 'hosted'`) so the reset token/link never reaches production logs (only `to` + `subject`).
  - `HttpEmailSender` (`TYCHE_EMAIL_SINK=http` **and** `TYCHE_EMAIL_WEBHOOK_URL` set) — POSTs `{to,subject,text[,from]}` JSON to your provider/relay, optional `Authorization: Bearer <TYCHE_EMAIL_WEBHOOK_TOKEN>`, 10s timeout, throws on non-2xx. Misconfigured http (URL unset) **degrades to console**, and `buildApp` warns loudly at boot when reset mail is being logged rather than delivered in hosted mode.

---

### 7. Per-user data isolation — `scopedPersistence` + `AsyncLocalStorage` + `UserStores`

- **`requestScope = new AsyncLocalStorage<{ user, store }>()`** (`saas/requestContext.ts`). The app.ts session hook calls `requestScope.run({ user, store }, done)` — using **`run()` not `enterWith()`** precisely so the scope can never leak across requests. Because this hook is the **last `onRequest` hook registered**, `done` continues into `preHandler` + the handler *inside* the scope, so `currentUser()` and the scoped stores work in every handler.
- **`scopedPersistence(root)`** returns a `PersistenceStore` whose every data method delegates to `requestScope.getStore()?.store ?? root` (falls back to the root/self-host store when no scope). `init()` and `close()` deliberately delegate to `root` (per-user stores are managed by `UserStores`). Routes keep calling `ctx.persistence` unchanged.
- **`currentUser()`** returns `requestScope.getStore()?.user` — used by `routes/auth.ts` (`/me`, password, delete), `routes/billing.ts`, `routes/admin.ts`, and `routes/user.ts` (`/account/export` stamps the account).
- **`UserStores`** (`saas/userStores.ts`): lazily opens and process-caches one `PersistenceStore` per user under **`<dataDir>/users/<id>/`** — a `SqlitePersistence(<dir>/tyche.db)` when `persistence:'sqlite'` (falling back to `FilePersistence(dir)` on failure so a user is never locked out), else a `FilePersistence`. `forUser(id)` caches the pending promise; `destroy(id)` closes and `rm -rf`s the user's dir (account deletion); `closeAll()` on shutdown.

Isolation is verified in `saas/hardening.test.ts` ("account export" — Alice's data never appears in Bob's export/watchlists; "account deletion" — re-registering the same email starts from scratch).

---

### 8. Rate limiting + trustProxy hops

- **`RateLimiter`** (`security/rateLimit.ts`): in-process sliding window, per-key hit timestamps, no timers/deps, opportunistic prune above 10k keys. `routes/auth.ts` uses one shared limiter **`new RateLimiter(20, 10*60_000)`** (20 attempts / 10 min) keyed on **`request.ip`**, applied to every credential endpoint (register/login/password/reset/delete). Over budget → `429 rate_limited` + an `auth.rate_limited` audit `deny`. Multi-node deployments should add proxy-level limiting (this is the safe single-container default).
- **`trustProxy`**: `Fastify({ trustProxy: hosted ? config.trustProxyHops : false })`. `TYCHE_TRUST_PROXY_HOPS` (default 1, `Math.max(1, …)`) tells Fastify to trust **exactly N hops** so `request.ip` — the rate-limit key — is the real client the proxy appended, **not** a client-spoofable leftmost `X-Forwarded-For`. Self-host trusts no proxy (direct socket peer). The shipped `deploy/Caddyfile` **overwrites** XFF with `{remote_host}`, matching hops=1. Running a CDN in front of Caddy requires *both* raising the hop count *and* changing the edge Caddy to preserve the upstream client, or all users on a PoP collapse to one bucket. The anti-spoof behavior is verified in `saas/hardening.test.ts` ("keys the limiter on the trusted proxy hop, not a spoofable X-Forwarded-For").

---

### 9. Health, readiness, graceful shutdown, demo

- **`GET /api/health`** (`routes/health.ts`) — liveness, no I/O: `{status, time, version (TYCHE_VERSION ?? npm_package_version ?? 'unknown'), uptimeSec, appMode, demo, billing, mode (mock/mixed), providers[], capabilities}`. This is the container `HEALTHCHECK` target (`Dockerfile` uses `node -e fetch(.../api/health)`).
- **`GET /api/ready`** — readiness: a cheap real `readyStore.getPreferences()` against the **unscoped** base store (passed explicitly as the 3rd arg to `registerHealthRoutes(app, ctx, persistence)` — *not* `ctx.persistence`, which is per-request scoped). `503 unavailable` on failure so a load balancer / deploy probe can tell booting-or-broken from healthy.
- **Graceful shutdown** (`apps/api/src/index.ts`): `installGracefulShutdown` traps `SIGTERM`/`SIGINT` (idempotent), calls `app.close()` → runs `onClose` hooks (SQLite WAL checkpoint, audit flush, `userStores.closeAll()`), then `process.exit`. Prevents the 10s SIGKILL from stranding mid-write; makes `scripts/backup.sh` snapshots clean.
- **`TYCHE_DEMO`** — see §2 hook #3. A read-only public demo (`docker run -e TYCHE_DEMO=true …`). Orthogonal to mode; typically paired with mock providers.

---

### 10. The `/api` route surface (all routes)

**Auth (`routes/auth.ts`, hosted; else `400 not_hosted`):** `POST /api/auth/register` (201, rate-limited, honors `TYCHE_SIGNUPS=closed` once ≥1 account), `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` (verify current → re-hash → bump epoch → re-issue *this* cookie), `POST /api/auth/reset/request` (**always 200**, all account-conditional work runs off the response path to defeat enumeration), `POST /api/auth/reset/confirm`, `POST /api/auth/delete` (password-confirmed; removes record + data dir + cookie).

**Billing (`routes/billing.ts`):** `GET /api/billing`, `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/billing/webhook` (raw-body, unauth, signature-verified).

**Admin (`routes/admin.ts`, hosted + `user.admin` only; else 400/403):** `GET /api/admin/metrics` — `{users, activeTrials, pro, expired, trialsEndingSoon, activeToday, activeWeek, priceMonthly, mrr (=pro*priceMonthly), billingProvider, signupsByDay[14], latest[8]}`.

**Health/ops (`routes/health.ts`):** `GET /api/health`, `GET /api/ready`, `GET /api/providers`, `GET /api/plugins`, `GET /api/audit` (`?limit`, 1–500, newest-first).

**User data (`routes/user.ts`, scoped in hosted):** `GET /api/account/export` (full account dump; `account` stamp is null in self-host); preferences `GET/POST /api/preferences`; watchlists `GET/POST /api/watchlists`, `DELETE /api/watchlists/:id`; alerts `GET/POST /api/alerts`, `DELETE /api/alerts/:id`; portfolios `GET /api/portfolios`, `GET/POST/DELETE /api/portfolios[/:id]` (live marks stripped — Tyche places no orders); saved screens `GET/POST /api/screens`, `DELETE /api/screens/:id`; workspaces `GET/POST/DELETE /api/workspaces[/:id]`; notes `GET /api/notes`, `GET /api/notes/export`, `POST /api/notes`, `POST /api/notes/import`, `DELETE /api/notes/:id`.

**Market (`routes/market.ts`):** `GET /api/search`, `/api/instruments/:id`, `/api/quote/:symbol`, `/api/quotes`, `/api/history/:symbol`, `/api/intraday/:symbol`, `/api/trades/:symbol`, `/api/book/:symbol`, `/api/membership/:symbol`, `/api/dex`, `/api/funding`, `/api/economics/:seriesId`.

**Research (`routes/research.ts`):** `GET /api/news`, `/api/filings/:symbol`, `/api/estimates/:symbol`, `/api/ratings/:symbol`, `/api/ownership/:symbol`, `/api/financials/:symbol`, `/api/options/:symbol`, `/api/events`, `POST /api/screen`.

**AI (`routes/ai.ts`):** `POST /api/ai/chat` — deterministic mock responder only; a live adapter would slot in "gated on `ctx.config.ai.apiKey`".

**Streams (`routes/stream.ts`, SSE):** `GET /api/stream/quotes?symbols=`, `GET /api/stream/trades?symbol=`, `GET /api/stream/alerts?symbols=`. Raw SSE headers manually mirror credentialed-CORS (`Access-Control-Allow-Origin: webOrigin` + `Allow-Credentials: true`) so `EventSource(withCredentials)` works with hosted session cookies; 15s heartbeats.

**Root:** `GET /` → `{name:'tyche-api',status:'ok',health:'/api/health'}` (only when not serving the web bundle).

---

### 11. Full env-var surface (`env.ts` → `ApiConfig`)

| Env var | Config field | Default | Notes |
| --- | --- | --- | --- |
| `API_HOST` | `host` | `127.0.0.1` | Docker image sets `0.0.0.0` |
| `API_PORT` | `port` | `4010` | |
| `WEB_ORIGIN` | `webOrigin` | `http://localhost:5173` | CORS allow-list (REST **and** SSE) |
| `TYCHE_MODE` | `mode` | `selfhost` | `hosted` enables the SaaS layer |
| `TYCHE_DEMO` | `demo` | `false` | read-only public demo (blocks writes) |
| `TYCHE_SESSION_SECRET` | `sessionSecret` | `null` | **required ≥16 chars in hosted** (HMAC) |
| `TYCHE_TRUST_PROXY_HOPS` | `trustProxyHops` | `1` (min 1) | trusted proxy hops (anti IP-spoof) |
| `TYCHE_SIGNUPS` | `signups` | `open` | `closed` blocks new signups after 1st account |
| `TYCHE_ADMIN_EMAIL` | `adminEmail` | `null` | only this email gets admin (else 1st account) |
| `TYCHE_BILLING` | `billing` | `none` | `none`/`mock`/`stripe` (fails closed to none) |
| `STRIPE_SECRET_KEY` | `stripeSecretKey` | `null` | required for stripe |
| `STRIPE_PRICE_ID` | `stripePriceId` | `null` | required for stripe |
| `STRIPE_WEBHOOK_SECRET` | `stripeWebhookSecret` | `null` | required for stripe |
| `TYCHE_PUBLIC_URL` | `publicUrl` | `WEB_ORIGIN` | billing redirect + reset-link base |
| `TYCHE_PRICE_MONTHLY` | `priceMonthly` | `29` | admin MRR readout only |
| `TYCHE_DATA_DIR` | `dataDir` | `./data` | root of users.json, per-user stores, audit |
| `TYCHE_PERSISTENCE` | `persistence` | `file` | `file`/`sqlite` (sqlite falls back to file) |
| `TYCHE_SQLITE_PATH` | `sqlitePath` | `<dataDir>/tyche.db` | |
| `TYCHE_PROVIDERS` | `providers` | `['mock']` | comma list |
| `TYCHE_PLUGINS` | `plugins` | `[]` | operator provider-plugin module specifiers |
| `SEC_EDGAR_USER_AGENT` | `secEdgarUserAgent` | `null` | required by SEC fair-access when secedgar enabled |
| `FRED_API_KEY` | `fredApiKey` | `null` | free key; never written to provenance |
| `TYCHE_SERVE_WEB` | `serveWeb` | `null` | dir of built web app for same-origin serving |
| `TYCHE_AUDIT_SINK` | `auditSink` | `console` | `console`/`file` |
| `TYCHE_AUDIT_FILE` | `auditFile` | `<dataDir>/audit.log` | |
| `TYCHE_EMAIL_SINK` | `emailSink` | `console` | `console`/`http` |
| `TYCHE_EMAIL_WEBHOOK_URL` | `emailWebhookUrl` | `null` | required for http sink |
| `TYCHE_EMAIL_WEBHOOK_TOKEN` | `emailWebhookToken` | `null` | optional bearer |
| `TYCHE_EMAIL_FROM` | `emailFrom` | `null` | optional From in payload |
| `TYCHE_AUTH_ENABLED` | `authEnabled` | `false` | self-host bearer guard on mutations + /api/audit |
| `TYCHE_AUTH_TOKEN` | `authToken` | `null` | the bearer token |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | `ai.{provider,apiKey,model}` | `mock`/`null`/`null` | copilot (mock only shipped) |

Read outside `loadConfig`: `TYCHE_VERSION` / `npm_package_version` (health), `process.env.VITEST` (quiet logging). Compose-only (not read by the API): `TYCHE_DOMAIN`, `TYCHE_ACME_EMAIL` (Caddy). Web build-time: `VITE_API_BASE_URL`, `VITE_DEMO_WORKSPACE`.

---

### 12. Production deployment shape

`docker-compose.prod.yml` runs the Tyche container (`TYCHE_MODE=hosted`, `TYCHE_PERSISTENCE=sqlite`, `TYCHE_AUDIT_SINK=file`, same-origin serving) behind `caddy:2-alpine` (auto-HTTPS via `deploy/Caddyfile`, which overwrites `X-Forwarded-For` with the real client). Compose gates Caddy on the container's `service_healthy` (the `/api/health` HEALTHCHECK). Config comes from `.env.prod` (`deploy/env.prod.example`); `scripts/deploy.sh` generates the session secret on first run; `scripts/backup.sh` / `restore.sh` snapshot the `tyche-data` volume. The single-container `Dockerfile` builds the web bundle with an empty `VITE_API_BASE_URL` (same-origin) and serves it via `TYCHE_SERVE_WEB=/app/apps/web/dist`.

### Key files for this chapter

- `apps/api/src/app.ts`
- `apps/api/src/env.ts`
- `apps/api/src/context.ts`
- `apps/api/src/index.ts`
- `apps/api/src/saas/users.ts`
- `apps/api/src/saas/sessions.ts`
- `apps/api/src/saas/billing.ts`
- `apps/api/src/saas/requestContext.ts`
- `apps/api/src/saas/userStores.ts`
- `apps/api/src/saas/email.ts`
- `apps/api/src/security/auth.ts`
- `apps/api/src/security/rateLimit.ts`
- `apps/api/src/security/audit.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/routes/user.ts`
- `apps/api/src/routes/helpers.ts`
- `apps/api/src/saas/hardening.test.ts`
- `docker-compose.prod.yml`
- `deploy/Caddyfile`
- `deploy/env.prod.example`
- `docs/BILLING.md`

### Open questions / known ambiguities

- Scale ceilings of the file-backed registry: UserRegistry loads all of users.json into memory and does O(n) linear scans (findByEmail, subscription lookups in applyBillingEvents); the auth RateLimiter and the UserStores cache are per-process. Multi-node / large-user deployments need a shared store and proxy-level rate limiting — no sharding or external DB exists yet.
- Sessions are stateless HMAC with no per-device revocation: the only revocation is bumping tokenEpoch, which kills ALL of a user's sessions at once. There is no 'log out other devices' or single-token blocklist.
- CSRF posture relies on SameSite=lax cookies + credentialed CORS pinned to WEB_ORIGIN, but the token is also accepted via Authorization: Bearer; there is no separate CSRF token. Confirm this is acceptable for the intended cross-site threat model.
- No live AI adapter ships — routes/ai.ts only returns the deterministic mock (the code comments where a real adapter 'gated on ctx.config.ai.apiKey' would slot in). AI_PROVIDER/AI_API_KEY/AI_MODEL are plumbed but unused beyond mock.
- Only Stripe has a concrete billing driver; adding another provider means implementing BillingDriver + a parseXEvents mapper and wiring it in buildApp's billing switch.
- Password reset links point at `${publicUrl}/reset.html?token=…` — that static page must exist in the served web bundle for the flow to complete; verify the web app ships reset.html.
- combined TYCHE_DEMO=true with TYCHE_MODE=hosted is not obviously an intended combination (the demo write-block hook runs before the session hook); the demo guard is designed for a shared no-signup selfhost instance.

---

<!-- Chapter 7: Invariants, Conventions & the Operating Rhythm -->

## Invariants, Conventions & the Operating Rhythm

This chapter is the guardrail. Tyche is a **keyboard-first financial research terminal** — research-only, provider-agnostic, self-hostable. A change that violates one of the invariants below is wrong even if it typechecks and passes tests. Every claim here was verified against the named file; when you extend the repo, keep these true.

Repo shape (verified): a pnpm monorepo, `pnpm-workspace.yaml` globs `packages/*` and `apps/*` → **8 workspaces**: `packages/{contracts,terminal-kernel,data-adapters,module-sdk,ui,analytics}` + `apps/{api,web}`. The dependency keystone is `@tyche/contracts` — everything imports it; the web app talks to the API only over HTTP/SSE and never imports server packages.

---

### 1. Product invariants and WHERE they are enforced

These five are non-negotiable. Restate them accurately — do not soften.

**(a) Research-only: no advice, no orders.**
Tyche shows data and *educational* analysis. It never emits buy/sell/hold guidance and has **no order-placement / trade-execution path anywhere** (verify by absence: there is no broker, routing, or order module).
- Enforced concretely in the AI copilot: `apps/api/src/ai/copilot.ts` defines `NO_ADVICE_DISCLAIMER` and an `ADVICE_PATTERN` regex (`/\b(should i|do you recommend|is it a (good )?(buy|sell)|...)\b/i`). When it matches, the copilot responds "I can't provide personalized buy/sell/hold guidance…" and redirects to on-screen data. `NO_ADVICE_DISCLAIMER` is attached to **every** copilot response (`disclaimer:` field of `AIChatResponse`), advice-seeking or not.
- The default `AI_PROVIDER=mock` copilot never calls a model — it summarizes provided terminal context and cites provenance, so no prompt or data leaves the machine by default.
- Convention codified in `CONTRIBUTING.md`: "No advice, no orders. Don't add features that give personalized buy/sell/hold guidance or place trades." Stated again in `SECURITY.md` ("No financial advice") and `README.md`.

**(b) BYO-key, never resell/bundle market data.**
The mock provider's data is **entirely synthetic** (`MockProvider` descriptor: `name: 'mock'`, `mode: 'mock'`; synthetic instruments are literally suffixed `"(synthetic demo)"`). Real adapters are **gated on the operator's own credentials**, in `packages/data-adapters/src/providerRegistry.ts` `instantiate()`: SEC EDGAR only enables when `SEC_EDGAR_USER_AGENT` is set, FRED only when `FRED_API_KEY` is set; otherwise mock serves that capability. Binance / Frankfurter / Dexscreener are keyless public sources. No provider's data is ever bundled or resold — hosted mode sells "software + hosting," per `README.md` and `SECURITY.md`. `DataProvenance` carries optional `license` / `attribution` / `sourceUrl` so attribution requirements travel with the data.

**(c) Provenance on everything, carried into exports.**
The single source of truth is `packages/contracts/src/provenance.ts`: `interface Envelope<T> { data: T; provenance: DataProvenance }` and `DataProvenanceSchema` with **required** fields `provider`, `providerMode`, `capability`, `retrievedAt`, `freshness` (+ optional `license`/`attribution`/`sourceUrl`/`cacheHit`). Enforcement points:
- **Provider layer:** every `DataProvider` method returns `Envelope<T>`. The conformance suite (`packages/data-adapters/src/conformance.ts`, `checkProviderConformance`) probes each declared capability and `safeParse`s the result against `envelope(<Schema>)` — a provider that returns data without valid provenance **fails conformance** and cannot join the registry.
- **Even failures are stamped:** `apps/api/src/routes/helpers.ts` `serveCapability()` returns `gapProvenance(...)` on missing-capability (200) and provider-error (502) responses, so an empty/errored panel still names the would-be provider. `localProvenance()` stamps locally-stored (non-market) data as `provider: 'local'`, `providerMode: 'user_supplied'`.
- **Exports:** `apps/web/src/modules/export.ts` `provenanceCsvHeader()` prepends commented `# provider=…`, `# providerMode=…`, `# freshness.tier=…` lines to CSV; `financialsToJson()` embeds the `provenance` object. `formatCitation()` in provenance.ts renders the canonical one-liner (`mock · quotes · live · as of 2026-06-28`) shared by panel footers, exports, and copilot citations.

**(d) Mock mode always works (zero keys).**
`createProviderRegistry()` in `providerRegistry.ts` **always** registers `MockProvider` as a fallback: after instantiating the configured providers, `if (!registry.get('mock')) registry.register(new MockProvider(...))`. Comment: "The mock provider is always registered (as a fallback) so the terminal is never left without data." `pnpm dev` needs no credentials; the mock is deterministic (seeded via `packages/data-adapters/src/{seed,random}.ts`) and even models market sessions and freshness tiers. Convention (`CONTRIBUTING.md`): "Graceful, never crashing" — surface missing capabilities/providers via `EmptyState`/`ErrorState`, never throw in render.

**(e) Clean-room.**
Benchmarked only against *publicly documented* terminal feature **categories** — never any proprietary product's branding, UI, private APIs, trade dress, or undocumented behavior. Recorded in `docs/adr/0001-clean-room-terminal-foundation.md` and `docs/adr/0004-public-competitor-research-clean-room-roadmap.md`; restated at the top of `README.md`. When adding a feature, cite the public category, not a product.

---

### 2. Code conventions

**Response envelope — the `{data}` / `{error:{kind,message}}` shape.**
Server side (`apps/api/src`): success is `reply.send({ data, provenance })`; failure is `reply.send({ error: { kind, message, /* capability?, detail? */ }, provenance? })`. `kind` is a stable machine-readable slug — real examples: `capability_unavailable`, `provider_error`, `bad_request`, `unauthorized`, `not_hosted`, `signups_closed`, `email_taken`, `invalid_credentials`, `rate_limited`, `payment_required`, `read_only_demo`, `invalid_token`, `internal`. HTTP-code discipline: **200** for a graceful capability gap (data absent but attributed), **502** `provider_error`, **400** via `badRequest(reply, message, detail?)` helper, plus 401/402/403/409/429 as above. Client side mirrors it: `apps/web/src/providers/apiClient.ts` defines `type EnvelopeResult<T> = { ok:true; data:T; provenance } | { ok:false; error:ApiError; provenance }` and `fetchEnvelope()` discriminates purely on the presence of `json.error`. New routes MUST use this shape both ways.

**Audit-event shape.**
Defined once in `packages/contracts/src/audit.ts`: `AuditEventSchema = { at: IsoDateTime, actor: string, action: string, resource?: string, outcome: 'allow'|'deny'|'error', detail?: record }`. Construct with the factory `auditEvent(actor, action, outcome, extra?)` in `apps/api/src/security/audit.ts`, or inline `ctx.audit.record({ at: new Date().toISOString(), actor, action, outcome })`. `actor` is the account email in hosted mode, the client IP for pre-auth events (`auth.rate_limited`), or `'anonymous'`. `outcome:'error'` means an infrastructure failure (e.g. reset-mail delivery), distinct from `'deny'` ("refused") — keep that distinction.

**The `*_SINK` / pluggable-driver pattern.**
The house style for anything an operator might redirect: define an interface, ship two-plus implementations, select one by config in `apps/api/src/app.ts` — **call sites never change**. Instances:
- `AuditSink { record(event); recent(limit) }` → `ConsoleAuditSink` | `FileAuditSink`, selected by `TYCHE_AUDIT_SINK` (`console`|`file`). Writes are serialized and never throw into the request path.
- `EmailSender { name; send(email) }` → `ConsoleEmailSender` | `HttpEmailSender` (`apps/api/src/saas/email.ts`), selected by `TYCHE_EMAIL_SINK` via `createEmailSender()`. Falls back to console if `http` is chosen without a webhook URL; console sender **redacts the body in hosted mode** so reset tokens never hit logs.
- `BillingDriver` → `MockBillingDriver` | `StripeBillingDriver` (`apps/api/src/saas/billing.ts`), selected by `TYCHE_BILLING` (`none`|`mock`|`stripe`).
- Persistence: `PersistenceStore` → `FilePersistence` | `SqlitePersistence`, selected by `TYCHE_PERSISTENCE`; SQLite failure logs and **falls back to file** rather than failing boot.
When you need a new externally-routable concern, follow this exact pattern (interface + ≥2 impls + config switch in `app.ts`).

**Strict-TS idioms.**
`tsconfig.base.json` turns on `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`; `exactOptionalPropertyTypes` is intentionally `false`; `moduleResolution: "Bundler"`; `noEmit`.
- `verbatimModuleSyntax` → **type-only imports must use `import type`** (see the top of nearly every file, e.g. `import type { FastifyReply } from 'fastify'`). Mixing a value and type import of the same name means splitting into two statements.
- `noUncheckedIndexedAccess` → indexed access is `T | undefined`; guard or assert. Real examples: `periods[0]!.lineItems…` in `export.ts`, `const [userId, epochStr, expiresStr, signature] = parts as [string, string, string, string]` in `sessions.ts` after a `parts.length !== 4` guard, `request.url.split('?')[0] ?? request.url` throughout `app.ts`.
- Libraries have **no build step**: each package exports `src/index.ts` and consumers (Vite/tsx/tsc) read source directly. Do not add `dist/` to a library. Each workspace's `typecheck` script is `tsc --noEmit`.

**Zod at the boundary.**
Domain data is modeled as a Zod schema in `@tyche/contracts` first, with the type derived via `z.infer` and registered in the `Schemas` map (`packages/contracts/src/schemas.ts`, `export const Schemas = {…}` / `type SchemaName`). Untrusted input is validated with `.safeParse` at the API edge — e.g. `apps/api/src/routes/auth.ts` `CredentialsSchema` (`email: z.string().trim().email().max(254)`, `password: z.string().min(8).max(200)`), `PasswordChangeSchema`, `ResetRequestSchema`. Provider output is validated by the conformance suite against `envelope(schema)`. New domain shape → schema in contracts, not an ad-hoc interface.

**No-new-deps bias.**
The runtime dependency surface is deliberately tiny (verified across all 8 `package.json`s): `zod` (contracts/data-adapters/api), `fastify` + `@fastify/{cookie,cors,static}` (api), `react`/`react-dom`/`zustand`/`react-grid-layout`/`react-resizable` (web). Everything else is a workspace `workspace:*` link. Crypto, HTTP, and SQLite come from Node built-ins (`node:crypto`, global `fetch`, `node:sqlite`). Default to the standard library and existing deps; adding a dependency is a decision that needs justifying in the PR, and any new one plus new env vars must be noted in `.env.example` and the relevant doc.

---

### 3. Security posture bar

The bar is "a solo operator can expose this to the internet." Concrete, verified requirements:

- **Equal-cost login for unknown emails.** `apps/api/src/saas/users.ts` `verify()`: on a missing account it still runs `await scryptAsync(password, 'tyche-timing-equalizer', 64)` before returning `null`, so response timing doesn't reveal whether an account exists. scrypt uses a per-user 16-byte random salt, keylen 64.
- **Timing-safe compares** via `node:crypto` `timingSafeEqual` (with a length check first): password hash (`users.ts` `verify`), session signature (`apps/api/src/saas/sessions.ts` `verifySession`), reset-token hash (`users.ts` `resetPassword`), and the Stripe webhook HMAC (`apps/api/src/saas/billing.ts`, constant-time compare + 300s timestamp tolerance against replay). **One honest exception:** the optional self-host bearer guard (`apps/api/src/security/auth.ts`) compares `token === config.authToken` with plain `===` (not constant-time) — it's a coarse foundation-level guard, not the identity system; the hosted path is the hardened one. Don't "fix" it by mistaking it for the hosted flow, but a real hardening PR would make it timing-safe.
- **Always-200 anti-enumeration.** `POST /api/auth/reset/request` (`routes/auth.ts`) **always** replies `{ data: { ok: true } }`. All account-conditional work (token issue + `users.json` write + email send) runs in a fire-and-forget `void (async () => {…})()` **off the response path**, so a real account isn't slower (disk write) than an unknown one (in-memory miss) and a persist failure isn't a 500-vs-200 tell. Preserve this shape exactly if you touch it.
- **Stateless sessions + revocation lever.** Tokens are `uid.epoch.expires.sig` HMAC-SHA256 signed with `TYCHE_SESSION_SECRET`; the API **refuses to boot** in hosted mode if the secret is `< 16` chars (`app.ts` throws). A per-user `tokenEpoch` is the revocation lever — bumping it (password change, reset, delete) invalidates every outstanding token. Cookie is `httpOnly`, `SameSite=Lax`, `secure:'auto'`, 30-day.
- **Fail-closed defaults.** `TYCHE_BILLING` defaults to `none` (no paywall) — the free-granting `mock` driver must be selected explicitly and **warns loudly at boot** (`app.ts`: "MOCK billing driver active: checkout is free"). The console email sink in hosted mode also warns that reset mail is logged, not delivered. Admin bootstrap: when `TYCHE_ADMIN_EMAIL` is set it is the *only* registration granted admin (first-registrant fallback applies only when it's unset).
- **Rate limiting + proxy trust.** Credential endpoints share a per-IP sliding window (20 attempts / 10 min → 429, audited). `trustProxy` is set to exactly `trustProxyHops` (default 1) in hosted mode so `X-Forwarded-For` can't be spoofed to escape the limiter; selfhost trusts no proxy.
- **Error handler never leaks internals.** `app.ts` `setErrorHandler`: 5xx returns a generic `{ error:{ kind:'internal', message:'Internal server error.' } }` while logging one structured JSON line (reqId, method, url, status, stack) to stdout; 4xx keep their message.
- **Right to leave.** `GET /api/account/export` stays reachable **through the paywall** (402-exempt in `app.ts`); `POST /api/auth/delete` (password-confirmed) removes the account and its entire data directory.

---

### 4. The shipping rhythm

Verified from `git log` (every change lands as `Merge pull request #NN`), `CONTRIBUTING.md`, and `.github/workflows/`.

- **Branch from fresh `main`.** One concern per branch; the working branch pattern is `claude/financial-terminal-foundation-*`.
- **Small one-concern slices, one PR per slice.** Conventional-commit subjects with scopes: `feat(auth):`, `fix(api):`, `docs(launch):`, `feat(ops):`. Example from history: `fix(auth): harden password reset (adversarial review findings)` — i.e. ship the slice, then a follow-up adversarial self-review pass that hardens it.
- **Test-driven, tests co-located.** `*.test.ts` sit next to source (e.g. `saas/passwordReset.test.ts`, `security/audit.test.ts`, `conformance` exercised by `MockProvider.test.ts`). New API route → a `fastify.inject` smoke test in `apps/api/src/app.test.ts`. New parser grammar → a parser test. New provider capability → must pass `checkProviderConformance()`. New domain shape → registry/schema tests.
- **The full gate (run locally before every PR):**
  `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
  - `pnpm typecheck` = `pnpm -r run typecheck` → `tsc --noEmit` in all **8 workspaces** ("typecheck 8/8"); zero errors.
  - `pnpm test` = `vitest run` (unit/contract/API, ~520+ tests, Node env).
  - `pnpm build` = `pnpm --filter @tyche/web build` (production Vite bundle).
  - `pnpm test:e2e` = `playwright test` (Chromium browser journeys) — run when the change touches UI.
  CI (`.github/workflows/ci.yml`) mirrors this as two jobs — `verify` (typecheck→test→build) and `e2e` (cached Chromium) — on Node 22, pnpm 10.33.0, `--frozen-lockfile`.
- **Adversarial self-review** before opening/merging: re-read the diff hunting for the failure mode you didn't test (timing oracles, missing provenance, ungated writes, a thrown error in render). This is a distinct pass, not the same read that wrote the code.
- **Docs move with code:** new env var → `.env.example` + the relevant doc; significant architectural choice → a new `docs/adr/NNNN-*.md`; user-visible change → `CHANGELOG.md` (release cut = move `Unreleased` under `## X.Y.Z — YYYY-MM-DD`, bump root `package.json`, tag → `release.yml` verifies and publishes the GHCR image).

**Copy-pasteable Definition of Done** (a slice is done only when ALL hold):

```
[ ] One concern; branched from fresh main; PR describes what + why.
[ ] Product invariants intact: no advice/orders added; no bundled/resold data;
    every new provider method returns Envelope<T> with provenance; mock mode
    still works with zero keys; feature benchmarked to a PUBLIC category only.
[ ] Response shape: {data,provenance} on success, {error:{kind,message},provenance?}
    on failure, correct HTTP code; client consumes via EnvelopeResult.
[ ] Untrusted input validated with a Zod schema (.safeParse) at the boundary;
    new domain shape modeled in @tyche/contracts + added to Schemas.
[ ] Mutating/sensitive action emits an audit event {at,actor,action,outcome,...}.
[ ] Externally-routable concern uses the interface + ≥2 impls + config-switch
    pattern (no call-site changes).
[ ] Strict TS clean: import type for types; indexed access guarded/asserted;
    no unused locals/params. No new runtime dependency without justification.
[ ] Security bar: timing-safe compares on secrets; anti-enumeration preserved;
    fail-closed defaults; no internal details leaked in error bodies.
[ ] Tests added/updated (unit/contract; fastify.inject for new routes;
    conformance for new capabilities; e2e for UI).
[ ] Full gate green locally: pnpm typecheck (8/8) && pnpm test && pnpm build
    && pnpm test:e2e (when UI).
[ ] .env.example + docs (+ CHANGELOG/ADR) updated for any new config/decision.
[ ] Adversarial self-review pass done.
```

### Key files for this chapter

- `apps/api/src/routes/helpers.ts`
- `packages/contracts/src/provenance.ts`
- `packages/contracts/src/audit.ts`
- `apps/api/src/security/audit.ts`
- `apps/api/src/saas/email.ts`
- `apps/api/src/saas/users.ts`
- `apps/api/src/saas/sessions.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/security/auth.ts`
- `apps/api/src/ai/copilot.ts`
- `apps/api/src/app.ts`
- `apps/api/src/env.ts`
- `packages/data-adapters/src/providerRegistry.ts`
- `packages/data-adapters/src/conformance.ts`
- `apps/web/src/modules/export.ts`
- `apps/web/src/providers/apiClient.ts`
- `tsconfig.base.json`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/workflows/ci.yml`

### Open questions / known ambiguities

- The self-host bearer-token guard (apps/api/src/security/auth.ts) compares tokens with plain `===`, not timingSafeEqual — inconsistent with the hosted-mode timing-safe posture; is this an accepted tradeoff for the coarse foundation guard or a latent hardening TODO?
- README/CONTRIBUTING cite '520+ unit tests' and '35 e2e journeys' and '41 stable commands' — these counts drift as slices land; a builder should recount (vitest run / playwright list / DEFAULT_COMMANDS) rather than trust the doc figure
- There is no automated lint/enforcement (e.g. no ESLint rule) that a new provider method returns Envelope<T> or that a route uses the {data}/{error} shape — these invariants are enforced only by the conformance suite, code review, and convention, so a weaker model could regress them without a red test
- Prettier formatting is checked via `pnpm format:check` but is NOT part of the CI gate jobs in ci.yml (only typecheck/test/build/e2e run) — unclear whether formatting drift should block a PR

---

<!-- Chapter 8: State of the Project, Gaps & a Sequenced Build Backlog -->

## State of the Project, Gaps & a Sequenced Build Backlog

This chapter is the ground truth for "where Tyche is and what to build next." It is reconciled against the **actual code**, not the roadmap prose — several ticket status fields (`docs/roadmap/tickets/*.md`) still read `proposed`/`in-progress` for work that has since shipped, so trust the code and the reconciliation below over ticket headers.

Repo version: `package.json` → `0.3.0`. Single active dev branch `claude/financial-terminal-foundation-49spvm`; `main` exists. Node ≥ 20.10 (Node 22 for SQLite persistence), pnpm 10.33.0, pnpm monorepo.

### How to read the command surface (the map of what exists)

`packages/terminal-kernel/src/commands.ts` is the **single source of truth**. Every command is a `RegisteredCommand` with a `maturity` of `'stable' | 'beta' | 'stub'`. The web app derives modules from it (`apps/web/src/modules/registry.ts` → `buildDefinitions()`), and any `moduleId` without a real component in `apps/web/src/modules/components.ts` falls back to `BetaPlaceholder` (`apps/web/src/modules/BetaPlaceholder.tsx`). `assertModuleCoverage()` in `registry.ts` enforces that **every `stable` command has a real component** — so "stable" is a hard, tested guarantee, not a label.

Total commands defined: **45** — all `stable` (`ERN`/`CFV` promoted, `CHANGELOG` + `TOUR` added; no `beta`/`stub` left, so every command renders a real component and `assertModuleCoverage()` guards them all). Verify anytime with the maturity field in `commands.ts`.

---

### DONE — feature-complete areas

These are wired end-to-end (contract → provider/route → module → e2e-smokeable) and backed by the suite (`pnpm test` = 66 test files / 535 cases at the time of writing — recount with `npx vitest run` rather than trusting any doc figure; `pnpm test:e2e` = Playwright `tests/e2e/smoke.spec.ts`).

- **Foundation spine.** Zod contracts for the full domain (`packages/contracts/src/`: `market`, `instruments`, `fundamentals`, `filings`, `news`, `options`, `portfolio`, `workspace`, `alerts`, `ai`, `provider`, `events`, `funding`, `dexpool`, `membership`, `economics`, `notes`, provenance) + schema registry. Terminal kernel: tolerant parser, validated registry, effect-producing executor, active context, shortcuts, help generation.
- **Provider plane.** 24 typed capabilities (`packages/contracts/src/provider.ts` → `PROVIDER_CAPABILITY_KEYS`). Deterministic `MockProvider` declares **22 of the 24** — everything except `bonds` and `portfolio`, neither of which any command requires (`MOCK_CAPABILITIES`, `packages/data-adapters/src/MockProvider.ts`) — 8 seed instruments + synthesis for any symbol, market sessions, corporate-events calendar. Capability-gap routing (`providerRegistry.ts` → `forCapability` / `servesSymbol` venue scoping), cache interface, reusable `conformance.ts` suite.
- **Five REAL adapters shipped** (all extend `StubProvider`, injectable `FetchLike`, conformance-gated):
  - `SecEdgarProvider` (`filings`) — keyless but requires `SEC_EDGAR_USER_AGENT`.
  - `FredProvider` (`economicSeries`) — requires `FRED_API_KEY`.
  - `BinanceProvider` — keyless crypto: `quotes, historicalPrices, intradayPrices, trades, orderBook, fundingRates`, symbol-scoped to pairs.
  - `FrankfurterProvider` — keyless ECB FX: `fx, quotes, historicalPrices`.
  - `DexscreenerProvider` — keyless on-chain `dexPools`.
- **41 stable commands** with real modules (`apps/web/src/modules/`), each provider-capability-gated with graceful empty states: charting `GP`/`GIP` (candles, axes, volume, SMA/EMA/RSI, crosshair, wheel-zoom/pan, log scale), `DES`, `HP`, `QM`, `FOCUS`, `W` (tabs + batch import), `N`/`TOP` (filters), `CF`, `FA`, `EM`, `ANR`, `HDS`, `OMON`, `TAS`, `BOOK`, `FUND`, `DEX`, `COMM`, `FX`, `HEAT`, `MEMB`, `WEI`, `EVT`, `COMP`, `EQS`, `MOST`, `ECO`, `OVME`, `CALC`, `NOTE`, `PORT` (read-only, no orders), `ALERT`, `AI`, `LAYOUT`, `SETTINGS`, `SECF`, `HELP`, plus hosted `ACCOUNT`/`ADMIN`.
- **AI copilot with real citations.** `apps/api/src/ai/copilot.ts` maps context provenance → `AICitation[]` (`provenanceToCitation`), grounds answers, declines personalized advice. Deterministic mock backend (`AI_PROVIDER=mock`, no key).
- **Provenance end-to-end.** Every response is `{ data, provenance }`; CSV/JSON exports embed it (`apps/web/src/modules/export.ts`); AI cites it.
- **API + persistence + ops.** Fastify REST + SSE hub (`apps/api/src/`), File **and** SQLite persistence (`apps/api/src/persistence/`), durable JSON-lines audit sink + `GET /api/audit` (`apps/api/src/security/audit.ts`), optional bearer auth, graceful shutdown, health/readiness, `scripts/backup.sh`/`restore.sh`.
- **Hosted SaaS mode** (`TYCHE_MODE=hosted`, `apps/api/src/saas/`). Accounts (scrypt), stateless HMAC cookie sessions with `tokenEpoch` revocation, structural per-user data isolation (`TYCHE_DATA_DIR/users/<id>`), 14-day trial + 402 paywall, billing driver interface with `mock`/`stripe`/`none` (fails closed to `none`), `ACCOUNT`/`ADMIN` commands, onboarding role presets + welcome screen, full-account export that survives the paywall, password reset (`POST /api/auth/reset/*`, `apps/web/public/reset.html`), rate-limited credential endpoints, hardened admin bootstrap.
- **CI/release.** `.github/workflows/ci.yml` (typecheck + test + build + Playwright e2e on Node 22) and `release.yml` (tag → re-verify → GitHub Release + GHCR image). One-command deploy `scripts/deploy.sh` (compose + Caddy auto-TLS). Landing page `marketing/landing.html`, demo GIF `docs/assets/demo.gif`.

---

### PARTIAL — scaffolds, stubs, and beta commands that name a capability they don't fully serve

- **`ERN` (Earnings history & estimates) — the only true stub.** `maturity: 'beta'`, `moduleId: 'earnings'`, and there is **no `earnings` entry in `components.ts`**, so it renders `BetaPlaceholder`. The data exists (mock already serves `estimates`); only the module view is missing.
- **`CFV` (Filing document viewer) — beta but actually implemented.** `FilingViewerModule.tsx` renders a sandboxed EDGAR iframe with an external fallback link. It's marked `beta` because a real document URL only exists when `SecEdgarProvider` is enabled; in mock mode it shows an honest EmptyState (mock supplies filing metadata only). It is promotable to `stable` once verified against real EDGAR.
- **Two genuinely disabled provider scaffolds** (`extends StubProvider`, all methods throw "not implemented"): `YahooProvider` (`packages/data-adapters/src/stubs/YahooProvider.ts`, intended equity `quotes/historicalPrices/news`) and `CcxtProvider` (`stubs/CcxtProvider.ts`, intended crypto, deliberately no order placement). Declared `NO_CAPABILITIES`; the registry routes their intended capabilities to mock instead.
- **Autocomplete is command+symbol only.** `apps/web/src/terminal/suggest.ts` emits `Suggestion.kind: 'command' | 'symbol'`. There is **no argument-level completion** (FRED series ids for `ECO`, screener fields for `EQS`, watchlist/layout names).
- **Billing has monthly + annual prices; team seats via invite.** `apps/api/src/saas/billing.ts` supports an optional `STRIPE_PRICE_ID_ANNUAL` (annual plan). Closed-signup instances provision seats by invite (`TYCHE_SEATS`, `apps/api/src/saas/invites.ts`, `ADMIN` Team panel) — seats gate access, decoupled from billing (per-seat Stripe quantity is still a later slice).
- ~~**Onboarding tour is one-shot.**~~ **RESOLVED** — the `TOUR` command replays the 30-second tour on demand in any mode (`apps/web/src/modules/TourModule.tsx`, shares `apps/web/src/app/TourBasics.tsx` with `OnboardingScreen.tsx`).
- **Rate limiting has a pluggable shared store; session revocation is registry-bound.** `apps/api/src/security/rateLimitStore.ts` offers a `memory` (node-local) or `sqlite` (shared `rate_hits` DB) backend via `TYCHE_RATE_LIMIT_STORE`, so a multi-node deployment can enforce one credential budget. Sessions stay stateless HMAC; `tokenEpoch` revocation is only multi-node-instant when the user registry is shared, and the shipped file `UserRegistry` caches in memory — so a shared read-through registry (SQLite/Postgres) is the remaining piece for horizontal scale (boundary + sticky-session guidance in `SECURITY.md`).

---

### KNOWN GAPS (by design or not-yet-shipped)

- **No real US-equity/global-equity feed — by design.** Equity `quotes`, `historicalPrices`, `intradayPrices`, `news`, `estimates`, `analystRatings`, `ownership`, `options`, `screener`, `membership` are **mock-only**. This is the BYO-key posture: those are operator-licensed sources. (`filings` + `fundamentals` are the exceptions — real via keyless SEC EDGAR for US issuers, see below.) The synthetic mock makes the whole app usable keyless — never bundle or resell data (`SECURITY.md`, `ROADMAP.md` non-goals).
- ~~Email verification at registration is not shipped.~~ **Shipped** (backlog task 3): registration emails a single-use 24h link via the configured sink; `POST /api/auth/verify` + session-bound rate-limited `/verify/resend`; `emailVerified` on the public user. It is a nudge, not a gate — unverified accounts are never blocked (see `apps/api/src/saas/emailVerification.test.ts`).
- ~~**No trial-lifecycle emails**~~ **RESOLVED** — `apps/api/src/saas/retention.ts` runs day-11 trial-ending + day-2 welcome-back campaigns on a background tick (pure selectors, persisted one-shot markers, audited sends), gated on a real email sender (`app.ts`).
- **Password reset ships; the web reset page (`apps/web/public/reset.html`) was only recently added** — exercise it end-to-end against a real `TYCHE_EMAIL_SINK=http` before launch.
- **Real `events` is mock-only** (EDGAR 8-K parsing planned as an upgrade — backlog #12). Real `fundamentals` via SEC company-facts **is now built** (`SecEdgarProvider.getFinancials`): with `SEC_EDGAR_USER_AGENT` set, `AAPL FA` returns real income/balance/cash-flow for US issuers (`mode: 'public'`), mock fallback when unset.
- **Launch blockers that are not code:** legal templates (`apps/web/public/{terms,privacy}.html`, source `marketing/legal/`) still contain `‹blank›` placeholders and a DRAFT banner; landing `og:image` is a placeholder; support email is a placeholder.
- **Non-goals (do not build):** order placement/routing, personalized buy/sell/hold advice, bundled/resold market data, private-company/community/expert-network data, latency-edge marketing.

---

### Dependency-ordered build backlog (next ~18 tasks)

Ordered so reusable foundations land before dependents. Each: **why · reuse · size · acceptance**. "Reuse" names the real file/pattern to copy.

**Group A — reusable foundations (do first)**

1. ~~**Argument-level autocomplete in the command bar**~~ — **SHIPPED**. `buildArgumentSuggestions` (`apps/web/src/terminal/suggest.ts`, `kind: 'argument'`) sources each command's arg vocabulary from the first arg of its *command-first* `examples` (SSOT — so `ECO ` → GDP/UNRATE/CPIAUCSL, while symbol-first `AAPL GP` stays symbol-driven); fires on a completed command + space, appended command→symbol→argument in `CommandBarContainer.tsx`; `arg` badge in `@tyche/ui`. Covered by `suggest.test.ts`. *Note for future work:* EQS takes structured interactive filters, not a positional arg, so it has no example-arg vocabulary — enrich a command's `examples` (which also improves HELP) to widen its autocomplete.

2. **CSV/JSON export parity across every table module** — *mostly shipped.* Reusable foundation added: generic `rowsToCsv`/`rowsToJson` in `apps/web/src/modules/export.ts` (provenance header + label row for CSV; `{provenance, rows}` for JSON), an optional plain-text `value` accessor on `Column<T>` (`packages/ui/src/DataTable.tsx`), and a shared `<TableExport>` control (`apps/web/src/modules/TableExport.tsx`) that reuses a module's DataTable columns (or explicit `exportColumns` for bespoke tables). Wired into **10 modules**: `HP`, `ANR`, `HDS`, `MEMB`, `WEI`, `COMM`, `MOST`, `EQS`, `DEX`, `FUND` (each CSV+JSON, provenance included). e2e asserts the HP CSV **and** JSON downloads. **Follow-up (2b):** `EM` (a metric×period pivot — needs a matrix exporter like `financialsToCsv`) and `OMON` (a two-sided calls/puts option chain — needs a bespoke shape); wire both once a pivot/2-sided export helper exists. Recipe for any new flat-table module: pass the DataTable `columns` + `rows` + `provenance` to `<TableExport name=…>`; add a `value` accessor to any column whose key isn't the raw field or that formats its display.

3. **Email verification at registration (hosted)** — M. *Why:* `SECURITY.md`'s named gap; blocks fake-email trial abuse and is the prerequisite for trial-lifecycle mail. *Reuse:* email sender `apps/api/src/saas/email.ts`, token pattern from `apps/api/src/saas/passwordReset.*` (hashed, single-use, TTL), users store `apps/api/src/saas/users.ts`, routes `apps/api/src/routes/auth.ts`. *Accept:* registration sends a verification link via the configured sink; unverified accounts are flagged; a `GET/POST /api/auth/verify` consumes a single-use hashed token; audited; console sink redacts the token in hosted mode (match reset behavior); resend is rate-limited.

4. ~~**`ERN` earnings module**~~ — **SHIPPED.** `EarningsModule.tsx` renders the estimates contract as a reported-vs-estimated board (per metric/period: consensus mean, low–high range, # analysts, actual, surprise%), with a pure `earnings.ts` `earningsSurprise` helper + test and CSV/JSON export via `<TableExport>`. Mock `getEstimates` now stamps a deterministic `actual` on the current (just-reported) quarter so the surprise renders. `earnings` mapped in `components.ts`; ERN flipped `beta→stable` (`assertModuleCoverage()` green); e2e opens the board and asserts the Surprise column. **Only remaining beta: `CFV`** (task 5 — promote the filing viewer).

5. ~~**Promote `CFV` filing viewer to stable**~~ — **SHIPPED.** `FilingViewerModule.tsx` already handled all paths — real EDGAR document (sandboxed iframe + "Open on SEC.gov" + embed-failure fallback), the honest mock EmptyState (points at `SEC_EDGAR_USER_AGENT`), and the capability gap — so this was the maturity flip: `CFV` `beta→stable` in `commands.ts`, `assertModuleCoverage()` green, existing e2e covers the mock path. **No beta/stub commands remain** — all 43 are stable.

**Group B — SaaS conversion/retention (depend on #3's email pipe)**

6. ~~**Trial-ending + welcome-back transactional emails**~~ — **SHIPPED.** `apps/api/src/saas/retention.ts` — pure selectors `dueTrialEndingEmails` (active trial, inside a 3-day lead window → day-11 of the 14-day trial) and `dueWelcomeBackEmails` (trialer unseen ≥2 days, `lastSeenAt`→`createdAt` fallback), plus `runRetentionTick` which sends via the pluggable `EmailSender`, stamps a persisted one-shot marker on the `UserRecord` (`trialEndingEmailSentAt`/`welcomeBackEmailSentAt`) **only after a successful send** (so a restart never re-sends and a delivery failure retries next tick), and audits every send/failure (`actor: system:retention`). Wired in `app.ts` as an unref'd `setInterval` (first scan 60 s after boot, then every 6 h; cleared on shutdown), **gated on a real sender** — under the console sink the campaign is disabled with a one-time warning, never a crash. Copy stays research-only (no advice/orders). Covered by `retention.test.ts` (window/plan/idempotency + runner send-stamp-audit + retry-on-failure). Uses the day-2/day-11 defaults from `DEFAULT_RETENTION_OPTIONS`.

7. ~~**Annual Stripe price (second plan)**~~ — **SHIPPED.** Optional `STRIPE_PRICE_ID_ANNUAL` (`env.ts`) enables a yearly plan. `BillingDriver.createCheckout` takes an `interval` (`'month' | 'year'`); the pure `resolveCheckoutPrice` picks the price and **falls back to monthly + warns once** when the annual price is unset. The billed interval rides Stripe checkout-session `metadata` (echoed back on the webhook — no second API call) into `BillingState.interval`; the mock driver stamps it directly (30/365-day period). `POST /api/billing/checkout` accepts `{ interval }`; `GET /api/billing` returns `interval` + `annualAvailable`. `ACCOUNT` shows **Monthly** and **Annual (2 months free)** buttons for trialers (annual only when available) and a **Billing** row with the current interval once subscribed. Covered by `billing.test.ts` (`resolveCheckoutPrice` cases, metadata interval capture, annual mock-checkout flow) + `account.test.ts` (`intervalLabel`). Docs: `BILLING.md` + `.env.example`.

8. ~~**Team / closed-signup seat mode + `ADMIN` seat count**~~ — **SHIPPED.** `apps/api/src/saas/invites.ts` — an `InviteRegistry` (atomic-JSON, hash-at-rest single-use tokens, expiry-pruned) + pure `seatsUsed`/`seatAvailable` accounting where a seat = an account **or** an outstanding invite (so a closed instance can't be oversubscribed). Env `TYCHE_SEATS` (null = unlimited). Admin routes: `POST /api/admin/invite` (seat-cap + duplicate-email guarded, mails the link off the response path) / `POST /api/admin/invite/revoke`, and `/api/admin/metrics` now returns `seats` + `pendingInvites`. `POST /api/auth/invite/accept` consumes the token, creates the account (starting **verified**), signs in, and bypasses the closed-signup gate by design. `AdminModule` gains a `Seats: used/limit` readout + a Team invite form and pending-invite list with revoke; `invite.html` is the accept page (mirrors `reset.html`). Seats are **decoupled from billing** (per-seat Stripe quantity deferred). Covered by `invites.test.ts` (seat accounting, registry lifecycle, and the invite→cap→accept routes). Docs: `BILLING.md` + `.env.example`.

9. ~~**`TOUR` replay command**~~ — **SHIPPED.** The 30-second-tour content is extracted into a shared presentational `TourBasics.tsx` (`apps/web/src/app/`), consumed by both the first-login `OnboardingScreen.tsx` footer and the new `TourModule.tsx` panel, so the two never drift. `TOUR` (aliases `WELCOME`/`GETTINGSTARTED`, no capability, `category: 'core'`, `moduleId: 'tour'`) is `stable` and mode-agnostic (mock/hosted/demo); `assertModuleCoverage()` green; e2e opens the panel and asserts the tour heading + first step. `OnboardingScreen` now points returning users at `TOUR`.

10. ~~**Public changelog page/route**~~ — **SHIPPED.** `CHANGELOG` command (aliases `CHANGES`/`WHATSNEW`, no capability) → `ChangelogModule` renders the root `CHANGELOG.md` via `renderMarkdown`. The file is inlined into the web bundle at build time (`import … from '…/CHANGELOG.md?raw'`), so it needs no API/runtime file access and works in the demo/offline/Docker. Linked from the README docs list and the landing footer; e2e opens the panel and asserts the rendered content.

**Group C — real-data breadth (adapter pattern; independent of A/B)**

11. ~~**SEC company-facts → real `fundamentals` adapter**~~ — **SHIPPED.** `SecEdgarProvider.getFinancials` fetches the XBRL company-facts document (`data.sec.gov/api/xbrl/companyfacts/CIK…json`, reusing the existing CIK resolver / UA throttle / `getJson` / cache) and maps a fixed us-gaap concept set onto the **same lineItem keys/labels/order the mock emits** (so the FA matrix is unchanged): income (revenue→eps + R&D, SG&A, interest expense, income tax; gross profit computed when untagged), balance (assets/current assets/cash/inventory/liabilities/current liabilities/debt/equity), cash-flow (OCF, D&A, SBC, capex & dividends negated to SEC's outflow sign, FCF computed). Concepts a filer doesn't tag render as `null` ("—"), so the row set is stable across issuers. Fiscal periods are selected **frame-first** (SEC CY frames) with a 10-K/FY fallback for annual; **quarterly is frames-only** (SEC frames are calendar quarters, `fp` is fiscal — mixing would double-key). Restatements dedupe (framed / latest-filed wins). `descriptor.capabilities.fundamentals=true` so the registry routes `FA` to secedgar when `SEC_EDGAR_USER_AGENT` is set, mock otherwise; a data gap (unknown ticker / no us-gaap / fetch failure) returns an empty-but-valid envelope, never a 502. `mode: 'public'`, keyless, no bundling. Covered by `SecEdgarProvider.test.ts` (company-facts fixture: computed gross profit, negated signs, frame dedupe, instant-vs-duration, graceful empty, conformance, registry routing). **US issuers only** (foreign IFRS filers have no us-gaap facts). Enables backlog #12 (shared EDGAR client).

12. **EDGAR 8-K → real `events` adapter** — M/L. *Why:* upgrades the mock-only events calendar for real issuers. *Reuse:* the same EDGAR client from #11; `events.ts` contract; `EventsModule.tsx`. *Accept:* `AAPL EVT` merges real 8-K-derived events when EDGAR is enabled; falls back to mock otherwise; provenance stamped; tests cover parse + fallback. *Depends on #11 (shared EDGAR client).* 

13. **Keyless equity quote-source review + adapter** — L (research-gated). *Why:* the biggest by-design gap is real equity quotes; a keyless/terms-clean source would be transformational. *Reuse:* `YahooProvider`/`CcxtProvider` scaffolds as the shell, `BinanceProvider` as the fully-worked real-adapter template (`servesSymbol`, `FetchLike`, conformance). *Accept:* a terms-of-use memo lands first (this is the blocker); if clean, an adapter serves `quotes`/`historicalPrices` for equities behind a capability flag with provenance; explicitly no bundling/resale. **Do not ship without the terms review.**

**Group D — hardening & launch readiness**

14. ~~**Expand Playwright e2e to the newer modules**~~ — **SHIPPED.** Added journeys for `FX` (board + converter), `HEAT` (heatmap + size-by toggle + tiles), `BOOK` (`BTC-USDT` depth ladder), and `FUND` (funding board rate/annualized/mark columns); `ERN`, `DEX`, and `LAYOUT` switching were already covered. **Fixed the long-standing `LAYOUT forks…` flake** — root cause was non-hermeticity, not timing: the API persists workspaces across runs, so a fixed layout name ("E2E layout") accumulated and a name-matched locator resolved to *many* rows (strict-mode violation) locally, while CI's fresh data dir saw one. The test now uses a run-unique name (`E2E fork <ts>`) and scopes its locators to it. Whole suite (42 tests) green.

15. ~~**Multi-node-safe rate limit + session revocation option**~~ — **SHIPPED.** Extracted a pluggable `RateLimitStore` interface (`apps/api/src/security/rateLimitStore.ts`): `hit(key, limit, windowMs, now) → {allowed, remaining}`, atomic per key. `MemoryRateLimitStore` is the node-local default (today's Map/sliding-window logic); `SqliteRateLimitStore` is the shared external impl — a `rate_hits` table on Node's built-in `node:sqlite`, each `hit()` inside a `BEGIN IMMEDIATE` transaction with `busy_timeout`/WAL, so every process/node pointing at one DB file enforces **one** budget (proven by a cross-connection parity test). `RateLimiter` now holds only the policy and delegates (async); the 9 `overLimit` sites in `routes/auth.ts` `await`. Selectable via `TYCHE_RATE_LIMIT_STORE=memory|sqlite` (`TYCHE_RATE_LIMIT_SQLITE_PATH`), wired in `app.ts` with a memory fallback + boot warning if SQLite can't open. **Session revocation:** the `tokenEpoch` lever is already multi-node-correct *when the user registry is shared*; the shipped file `UserRegistry` caches `users.json` in memory, so a bump is node-local until refresh — `SECURITY.md` now documents this boundary (sticky-session / single-node guidance) and flags a shared read-through registry as the follow-up. One parity suite runs the behavioural spec over both stores (+ the shared-file test); docs updated (`SECURITY.md`, `.env.example`).

16. ~~**External-SIEM audit sink**~~ — **SHIPPED.** `HttpAuditSink` (`apps/api/src/security/audit.ts`) implements `AuditSink`, keeping the shared recent-events ring while POSTing each event as JSON to `TYCHE_AUDIT_WEBHOOK_URL` (optional `TYCHE_AUDIT_WEBHOOK_TOKEN` → `Bearer`). Delivery is fire-and-forget with a 10s abort timeout; a failed/non-2xx/slow endpoint is logged but **never throws into the request path**, and `flush()` drains in-flight deliveries on shutdown. Selected via `TYCHE_AUDIT_SINK=http` (`app.ts`), degrading to console + a boot warning when the URL is unset. (Fixed a latent gap in passing: the shutdown flush now targets the raw sink, so the `file`/`http` sinks flush even in hosted mode where `ctx.audit` is the request-scoping wrapper.) Covered by `audit.test.ts` (POST shape + bearer, non-2xx and network-error never-throw, `flush()` awaits in-flight); documented in `SECURITY.md` + `.env.example`. Injectable `fetchImpl` keeps tests network-free.

17. ~~**Layout keyboard chords (mod+1..9)**~~ — **SHIPPED.** `mod+1 … mod+9` jump to the 1st … 9th saved layout. Implemented as nine `KEY_ACTIONS` (`switchLayout1…9`, `apps/web/src/terminal/keybindings.ts`) so they flow through the **existing keymap machinery** — automatically rebindable in `SETTINGS` and persisted in `preferences.keymap`, no new mechanism. `App.tsx`'s global handler dispatches them via `layoutChordIndex(action)` → `switchToNthLayout(n)` (`workspace/persistence.ts`), which resolves the Nth layout in **stable creation order** (`orderLayoutsForChords`, pure) so a layout's number never shifts as it's used. `LayoutManagerModule` shows a `⌘N` badge on each of the first nine layouts (same order) for discoverability. Unit-tested: `keybindings.test.ts` (all nine chords registered, conflict-free, rebindable; `layoutChordIndex`) + `persistence.test.ts` (`orderLayoutsForChords` is a stable, non-mutating sort). Whole suite green (597 unit + 42 e2e).

18. **Launch-blocker closeout (non-code, tracked here so it isn't lost)** — S. *Why:* cannot take payments without it. *Reuse:* `apps/web/public/{terms,privacy}.html`, `marketing/legal/`, `marketing/landing.html`. *Accept:* every `‹blank›` filled, DRAFT banner removed, lawyer-reviewed; real 1200×630 `og:image`; real support email substituted everywhere; a proven backup/restore drill per `docs/LAUNCH.md`.

---

### Sequencing rationale

- **#1–#5 first**: they are either pure reuse infrastructure (autocomplete, export) that every later module leans on, or one-file finishes (ERN, CFV) that clear the "partial" list and make "stable = real" fully true.
- **#3 gates #6**: trial emails need the verification/email plumbing landed and audited.
- **#11 gates #12**: both share the EDGAR HTTP client; build the fundamentals adapter's client once, reuse for 8-K events.
- **#13 is intentionally last in Group C** and blocked on a terms review — the by-design "no bundled data" invariant means the legal memo, not the code, is the real work.
- Group D is parallelizable hardening; none of it blocks A–C, but #14/#18 gate a clean public launch.

### Key files for this chapter

- `ROADMAP.md`
- `docs/LAUNCH.md`
- `SECURITY.md`
- `docs/roadmap/tickets/00-INDEX.md`
- `packages/terminal-kernel/src/commands.ts`
- `apps/web/src/modules/components.ts`
- `apps/web/src/modules/registry.ts`
- `apps/web/src/modules/BetaPlaceholder.tsx`
- `packages/contracts/src/provider.ts`
- `packages/data-adapters/src/providerRegistry.ts`
- `packages/data-adapters/src/MockProvider.ts`
- `packages/data-adapters/src/stubs/YahooProvider.ts`
- `apps/web/src/terminal/suggest.ts`
- `apps/api/src/saas/billing.ts`
- `apps/api/src/saas/email.ts`
- `apps/web/src/modules/export.ts`
- `apps/api/src/ai/copilot.ts`
- `.github/workflows/ci.yml`

### Open questions / known ambiguities

- Ticket status fields in docs/roadmap/tickets/*.md are stale (many 'proposed'/'in-progress' items have shipped). Should a builder trust code-over-ticket, or should the tickets be reconciled first? This chapter assumes code is ground truth.
- For task #13 (keyless equity quotes) the blocker is legal, not technical: is there an approved source whose terms permit keyless server-side fetch without bundling/resale? Needs an explicit terms-of-use memo before any adapter is written.
- ~~Is real fundamentals expected strictly from SEC company-facts (US issuers only)?~~ **RESOLVED (task 11 shipped):** us-gaap-only for v1 — foreign IFRS filers (20-F/40-F under ifrs-full) return empty and stay mock-routed. Global coverage would need an additional source.
- Trial-lifecycle emails (#6) need a scheduler — is an in-process interval acceptable for the single-VPS deployment, or is an external cron/queue expected? Affects idempotency design.
- Team/seat mode (#8): is billing per-seat via Stripe quantity, or a flat team price? The current single-priceId driver doesn't encode either yet.
- MEMB (index membership) is mock-only and real constituent data is often licensed — is there a public/keyless source the operator can use, or does this stay synthetic with licensing notes?

---

## Appendix A — Consolidated invariants checklist

Every PR must hold ALL of these. Sourced from each chapter; violating one is a blocking review finding.

- [ ] packages/contracts is the SSOT and must have ZERO internal (workspace:*) dependencies — every other member depends on it, directly or transitively. *(Monorepo Topology & Toolchain)*
- [ ] Internal packages are consumed as raw TypeScript source (main/types -> ./src/index.ts); tsconfig.base.json sets noEmit:true, so libraries are never compiled to dist — only apps/web is bundled (vite build) and apps/api runs via tsx. *(Monorepo Topology & Toolchain)*
- [ ] verbatimModuleSyntax:true requires type-only imports to use `import type {…}`; noUncheckedIndexedAccess:true requires guarding all indexed/array reads. Violations fail `pnpm typecheck`. *(Monorepo Topology & Toolchain)*
- [ ] apps/web must not import @tyche/data-adapters — the browser reaches data only through the API. apps/api must not import @tyche/ui, terminal-kernel, or module-sdk. *(Monorepo Topology & Toolchain)*
- [ ] The lockfile is authoritative: CI installs with `pnpm install --frozen-lockfile`. Any dependency change must update pnpm-lock.yaml or CI fails. *(Monorepo Topology & Toolchain)*
- [ ] Node 22 + pnpm 10.33.0 are the CI/Docker toolchain; a new native-build dependency must be added to root pnpm.onlyBuiltDependencies or its install script will be blocked. *(Monorepo Topology & Toolchain)*
- [ ] The gate = install --frozen-lockfile → typecheck → test → build → test:e2e; all five must pass. There is no combined script — run them in order. *(Monorepo Topology & Toolchain)*
- [ ] Releases require a matching `## <version>` section in CHANGELOG.md before pushing a `v*` tag, or release.yml aborts. *(Monorepo Topology & Toolchain)*
- [ ] Every contract is Zod-first: define `const XSchema = z.object(...)` then `type X = z.infer<typeof XSchema>` — never hand-write the type. The schema is the runtime validator at every trust boundary. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] Every data response is an `Envelope<T> = { data: T, provenance: DataProvenance }`; provenance (provider, providerMode, capability, retrievedAt, freshness) is stamped on every response and carried into exports. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] `PROVIDER_CAPABILITY_KEYS` (24 entries) and the keys of `ProviderCapabilitiesSchema.shape` must be identical in both directions — enforced by schemas.test.ts. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] `providerMode` is exactly one of mock | public | paid | enterprise | user_supplied; freshness `tier` is exactly one of live | delayed | eod | historical | mock | unknown. These encode the BYO-key / keyless-public / mock sourcing model — Tyche never resells data. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] The `@tyche/contracts` package must stay runtime-dependency-free except for `zod` — everything downstream imports it. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] A provider asked for a capability it does not support must throw `CapabilityError`, never return empty data silently. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] Numeric guards reject NaN/Infinity at the boundary; prices are finite and positive (FinitePositivePrice) — bad data fails validation instead of producing NaN cells. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] Identifier format rules are schema-enforced: command id `/^[A-Z][A-Z0-9]*$/`, moduleId kebab-case `/^[a-z][a-z0-9-]*$/`, plugin id lowercase slug `/^[a-z0-9][a-z0-9._-]*$/`. *(Contracts & Data Model — the Single Source of Truth (@tyche/contracts))*
- [ ] The mock provider is ALWAYS in the registry: createProviderRegistry appends a fresh MockProvider whenever no provider named 'mock' was registered, so the terminal is never dataless. *(Provider / Adapter Layer)*
- [ ] Every DataProvider method returns Envelope<T> = { data, provenance }; provenance is built via makeProvenance/withProvenance and stamped on every response (mode, capability, retrievedAt, freshness). No raw data may be returned without provenance. *(Provider / Adapter Layer)*
- [ ] forCapability resolves in REGISTRATION ORDER (first match wins), so TYCHE_PROVIDERS ordering is priority — venue-scoped adapters must be listed before mock (e.g. binance,mock). *(Provider / Adapter Layer)*
- [ ] A provider must only declare capabilities it actually backs; capabilities it does NOT declare must throw (StubProvider defaults throw ProviderError). A missing capability should surface as CapabilityError, not silent empty data. *(Provider / Adapter Layer)*
- [ ] servesSymbol confines a venue adapter to its universe so the registry keeps routing foreign symbols elsewhere; without it a provider serves any symbol for its declared capabilities. *(Provider / Adapter Layer)*
- [ ] Keyed real adapters (SEC EDGAR needs SEC_EDGAR_USER_AGENT, FRED needs FRED_API_KEY) throw in their constructor if the credential is missing, and instantiate() returns null when it is absent so the mock serves the capability instead — preserving zero-key usability. *(Provider / Adapter Layer)*
- [ ] Secrets never enter provenance or error messages: send keys only as request params; sourceUrl must be the key-free public page; getJson swallows transport rejections into a generic ProviderError. *(Provider / Adapter Layer)*
- [ ] Plugin providers only serve data after passing every PluginHost gate ending in checkProviderConformance(provider).ok === true; any failure quarantines the plugin (never registered). PLUGIN_API_VERSION is 1 and manifests must match it. *(Provider / Adapter Layer)*
- [ ] Conformance probes drive each DECLARED capability with default symbols AAPL/BTC-USD and validate the envelope against the contract Zod schema; capabilities without a probe (fx, futures, bonds, portfolio) pass trivially. *(Provider / Adapter Layer)*
- [ ] Adapters read only sources the operator connected under their own license/keyless public endpoints — Tyche bundles/resells no market data; enabling a live adapter is the operator's entitlement responsibility. *(Provider / Adapter Layer)*
- [ ] Command ids must match /^[A-Z][A-Z0-9]*$/ (UPPERCASE) and be unique; aliases must not collide with any id or other alias — CommandRegistry.register throws loudly on either. DEFAULT_COMMANDS is the single source of truth for both the command registry and the module registry. *(Command Kernel & Web App)*
- [ ] The kernel is UI-agnostic: executeCommand returns declarative CommandEffect[] and never touches the DOM or React. Only the web host (execute.ts::applyEffect) turns effects into store mutations. Keep new routing logic in the kernel returning effects, not in modules. *(Command Kernel & Web App)*
- [ ] Capability gaps never throw. missingCapabilities is computed in the executor and passed through open-panel; modules render a graceful EmptyState via ModuleBody/BetaPlaceholder. Never crash on a missing provider capability. *(Command Kernel & Web App)*
- [ ] fetchEnvelope never throws — it always resolves to EnvelopeResult<T> ({ok:true,data,provenance} | {ok:false,error,provenance}). Provenance is carried even on error/gap responses. Only getHealth() and aiChat() intentionally bypass the envelope (return T|null). *(Command Kernel & Web App)*
- [ ] Every module component in modules/components.ts must be a React.lazy wrapper with a literal import() (one chunk per module); registry.test.ts asserts $$typeof === Symbol.for('react.lazy'). *(Command Kernel & Web App)*
- [ ] Every stable command must have a real component in moduleComponents — assertModuleCoverage() throws otherwise. beta/stub commands may fall back to BetaPlaceholder (currently only ERN/earnings does). *(Command Kernel & Web App)*
- [ ] A moduleId maps to exactly one set of commands; ModuleRegistry.register rejects duplicate moduleIds and a command already mapped to a different module. *(Command Kernel & Web App)*
- [ ] Research-only product invariant: no order placement, no buy/sell/hold advice, no bundled/embedded market data. Modules read via the app API (BYO-key / keyless / deterministic mock) and must thread provenance through reportProvenance. *(Command Kernel & Web App)*
- [ ] The parser treats the LAST resolving token as the command; strict (uppercase) symbols are preferred as the instrument, and a loose (lowercase) token is only promoted to an instrument when the command requiresInstrument or it is the sole bare token — so SECF apple / find tesla stay free-text queries. *(Command Kernel & Web App)*
- [ ] Persisted workspaces and imported JSON must pass WorkspaceSchema.safeParse before being applied (persistence.ts). WORKSPACE_SCHEMA_VERSION is 1. *(Command Kernel & Web App)*
- [ ] Hosted mode requires TYCHE_SESSION_SECRET (>=16 chars) or buildApp() throws; TYCHE_BILLING=stripe requires STRIPE_SECRET_KEY/PRICE_ID/WEBHOOK_SECRET or it throws. *(Hosted / SaaS Layer)*
- [ ] The session-scoping onRequest hook must remain the LAST onRequest hook registered: it wraps the remaining lifecycle (preHandler + handler) in requestScope.run(...) so AsyncLocalStorage covers the handler. Registering another onRequest hook after it, or switching run() to enterWith(), would break per-user scoping or leak scope across requests. *(Hosted / SaaS Layer)*
- [ ] A session is valid only when user.tokenEpoch === claims.tokenEpoch; any password change/reset bumps tokenEpoch and thus kills every outstanding session. Never weaken this check. *(Hosted / SaaS Layer)*
- [ ] Billing fails closed: an unset/unknown TYCHE_BILLING means 'none' (no paywall), never 'mock' (mock checkout grants pro for free). Mock must be opted into explicitly. *(Hosted / SaaS Layer)*
- [ ] A 'pro' entitlement never expires on a clock — only a provider cancellation/deletion webhook downgrades it. Do not add time-based pro expiry (a missed renewal must degrade to 'still works'). *(Hosted / SaaS Layer)*
- [ ] Paywall (402) must always exempt: shared paths (health/ready/auth/OPTIONS/non-API), all /api/billing*, /api/account/export, and admin users — an expired trial must still sign in, pay, and export its data. *(Hosted / SaaS Layer)*
- [ ] request.ip (the rate-limit key) must come from exactly trustProxyHops trusted hops; selfhost uses trustProxy:false. Never set Fastify trustProxy:true (a client could spoof X-Forwarded-For to bypass the auth limiter). *(Hosted / SaaS Layer)*
- [ ] The reset-request endpoint must always return 200 and do identical synchronous work for known vs unknown emails (all account-conditional work off the response path); the console email sender must redact the body in hosted mode. Both exist to prevent account enumeration / token leakage. *(Hosted / SaaS Layer)*
- [ ] Per-user data lives under <dataDir>/users/<id>/ and is reached only via scopedPersistence/currentUser through requestScope — routes must keep using ctx.persistence/ctx.audit and never bypass the scope. *(Hosted / SaaS Layer)*
- [ ] /api/ready must probe the UNSCOPED base store (the explicit 3rd arg to registerHealthRoutes), not ctx.persistence, since no per-request scope exists for that shared route. *(Hosted / SaaS Layer)*
- [ ] The /api/billing/webhook route is unauthenticated but must be signature-verified (Stripe-Signature or x-tyche-signature) and must read the raw string body (its encapsulated register scope installs a string content-type parser). *(Hosted / SaaS Layer)*
- [ ] Research-only: no personalized buy/sell/hold advice and NO order-placement path — enforced by the copilot's ADVICE_PATTERN + always-attached NO_ADVICE_DISCLAIMER (apps/api/src/ai/copilot.ts) and by absence of any broker/order module *(Invariants, Conventions & the Operating Rhythm)*
- [ ] BYO-key / never resell or bundle market data: mock data is synthetic (mode:'mock'); real adapters gate on the operator's own credentials in providerRegistry.ts instantiate() (SEC_EDGAR_USER_AGENT, FRED_API_KEY); keyless sources are public *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Provenance on everything and into exports: every provider method returns Envelope<T>={data,provenance}; conformance safeParses envelope(schema); serveCapability stamps gap/error responses; CSV/JSON exports embed provenanceCsvHeader / provenance object *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Mock mode always works with zero keys: createProviderRegistry() always registers MockProvider as a fallback so the terminal is never without data *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Clean-room: benchmark only publicly documented feature CATEGORIES (ADR 0001/0004); never copy any proprietary product's UI, APIs, or trade dress *(Invariants, Conventions & the Operating Rhythm)*
- [ ] API responses use {data,provenance} on success and {error:{kind,message},provenance?} on failure with correct HTTP codes; the web client consumes them via EnvelopeResult<T> *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Untrusted input is validated with a Zod schema (.safeParse) at the boundary; new domain data is modeled in @tyche/contracts and registered in Schemas *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Externally-routable concerns follow the interface + >=2 implementations + config-switch-in-app.ts pattern (AuditSink, EmailSender, BillingDriver, PersistenceStore) with no call-site changes *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Strict TS: verbatimModuleSyntax forces `import type`; noUncheckedIndexedAccess forces guarding/asserting indexed access; no unused locals/params; libraries have no build step (export src/index.ts) *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Secrets are compared timing-safely (timingSafeEqual) and login burns equal scrypt cost for unknown emails; the password-reset request endpoint always returns 200 with account-conditional work off the response path (anti-enumeration) *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Defaults fail closed: TYCHE_BILLING defaults to 'none'; the free-granting mock billing driver and the logging console email sink each warn loudly at boot; hosted mode refuses to boot without a >=16-char TYCHE_SESSION_SECRET *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Ship in small one-concern slices, one PR per slice, and only merge when the full gate is green: pnpm typecheck (8/8 tsc --noEmit) && pnpm test && pnpm build && pnpm test:e2e (when UI), after an adversarial self-review *(Invariants, Conventions & the Operating Rhythm)*
- [ ] Research-only: never add order placement/routing or personalized buy/sell/hold advice — PORT stays read-only and the AI copilot declines advice (SECURITY.md, ROADMAP.md non-goals). *(State of the Project, Gaps & a Sequenced Build Backlog)*
- [ ] Never bundle or resell market data. Real feeds are BYO-key or keyless-public adapters; the deterministic MockProvider must keep the whole app usable with zero keys (it declares 22 of 24 capabilities in MOCK_CAPABILITIES — every capability any command requires). *(State of the Project, Gaps & a Sequenced Build Backlog)*
- [ ] Every data response stays { data, provenance } and provenance must flow into exports and AI citations — do not add a data path that drops provenance. *(State of the Project, Gaps & a Sequenced Build Backlog)*
- [ ] packages/terminal-kernel/src/commands.ts is the single source of truth: add commands/modules/capabilities there; a 'stable' command MUST have a real component or assertModuleCoverage() (apps/web/src/modules/registry.ts) fails. *(State of the Project, Gaps & a Sequenced Build Backlog)*
- [ ] New capabilities must be added to PROVIDER_CAPABILITY_KEYS and ProviderCapabilitiesSchema (packages/contracts/src/provider.ts); new real adapters extend StubProvider, declare only capabilities they truly serve, and must pass the conformance suite (packages/data-adapters/src/conformance.ts). *(State of the Project, Gaps & a Sequenced Build Backlog)*
- [ ] Clean-room: benchmark only publicly documented terminal feature categories; never copy any proprietary product's UI, copy, assets, or private APIs. *(State of the Project, Gaps & a Sequenced Build Backlog)*
- [ ] Hosted mode security posture must hold: scrypt passwords, HMAC stateless sessions with tokenEpoch revocation, structural per-user data isolation, billing fails closed to 'none', and account export must survive the paywall. *(State of the Project, Gaps & a Sequenced Build Backlog)*


---

*Generated from a file-verified, 7-dimension codebase audit; maintained by hand from here on. If you change behavior this manual describes, update it in the same PR.*
