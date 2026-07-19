---
name: tyche-architecture-contract
description: >-
  The load-bearing design decisions of the Tyche monorepo and WHY they hold — the
  8-member pnpm dependency spine, the no-build-step rule for the 6 libraries, the
  provider capability-gap model, the Envelope<data,provenance> transport, the
  serveCapability "degrade never crash" contract, kernel + analytics purity, the 4
  ADRs, and the known weak points. LOAD THIS WHEN: adding or moving a package
  dependency; deciding "can package X import package Y?"; touching pnpm-workspace,
  package.json main/types/exports, tsconfig references, or Vite config; you hit an
  import cycle or "cannot find module @tyche/*"; adding a provider capability, a
  DataProvider method, or a command's requiredCapabilities; a panel shows a
  "missing capability" state and you want to know why it is not an error; a route
  returns HTTP 200 with an error body (capability_unavailable) or you must decide
  200 vs 502 vs 500; you are wondering why analytics/kernel forbid I/O, fetch, or
  Date.now; you need an ADR summary; or you are evaluating the self-host bearer-token
  guard. NOT for the step-by-step add-a-vertical recipe (use tyche-vertical-slice-campaign),
  the financial formulas (financial-terminal-reference), env vars (tyche-config-and-flags),
  or the change-control gate (tyche-change-control).
---

# Tyche Architecture Contract

The rules that keep Tyche coherent. Break one and the terminal either stops
building, starts crashing on gaps, or silently ships a number nobody can trace.
This skill states each rule, the WHY behind it, how to verify it locally, and where
it is weakest. Read it before you move a dependency, add a capability, or change how
a route responds to a missing provider.

**Jargon defined once, up front:**
- **Monorepo** — one git repo holding many packages. Tyche uses a **pnpm workspace**
  (pnpm = the package manager; a workspace links local packages together).
- **Package / member** — a directory with its own `package.json` under `packages/*`
  or `apps/*`. Tyche has exactly 8.
- **Capability** — a named data ability a provider may or may not have (e.g. `quotes`,
  `filings`). One of 28 string keys.
- **Provider / adapter** — a class that fetches data for some capabilities (mock,
  Binance, SEC EDGAR…). Lives in `@tyche/data-adapters`.
- **Envelope** — the universal `{ data, provenance }` wrapper every data response uses.
- **Provenance** — metadata saying which provider produced a number, in what mode,
  how fresh. Mandatory on every data payload.
- **Module** — a React panel body keyed by `moduleId` (e.g. `chart`, `economics`).
- **ADR** — Architecture Decision Record, a dated markdown note in `docs/adr/`.

---

## 1. The dependency spine — exactly 8 members, no cycles

The workspace is `packages/*` + `apps/*` = **8 members** (`pnpm-workspace.yaml`).
Verify: `ls -d packages/*/ apps/*/ | wc -l` → `8`.

```
packages/contracts        @tyche/contracts        SSOT — ZERO internal deps (keystone)
packages/analytics        @tyche/analytics        pure math          → contracts
packages/module-sdk       @tyche/module-sdk       module contract    → contracts
packages/terminal-kernel  @tyche/terminal-kernel  headless engine    → contracts
packages/ui               @tyche/ui               React kit          → contracts, module-sdk
packages/data-adapters    @tyche/data-adapters    provider plane     → contracts, analytics
apps/api                  @tyche/api              Fastify REST+SSE   → contracts, data-adapters, analytics
apps/web                  @tyche/web              React18+Vite6 SPA   → contracts, analytics, module-sdk, terminal-kernel, ui
```
(Verify any row: `node -e "console.log(require('./packages/<name>/package.json').dependencies)"`.)

### The load-bearing rules (each is an INVARIANT — do not violate)

| # | Rule | Why | Fast check (empty output = holds) |
|---|------|-----|-----------------------------------|
| A | **`contracts` depends on NOTHING internal** (only `zod`). | It is the shared vocabulary. If it depended on anything, every other package would inherit that, and the schema layer could not be the neutral SSOT. | `node -e "console.log(require('./packages/contracts/package.json').dependencies)"` shows only `zod` |
| B | **`web` never imports a server package** (`@tyche/api`, `@tyche/data-adapters`). | The browser talks to the backend ONLY over HTTP/SSE. Importing server code would leak provider keys, node-only APIs, and break the self-host boundary. | `grep -rn "@tyche/api\|@tyche/data-adapters" apps/web/src` |
| C | **`api` never imports the browser packages** (`@tyche/ui`, `@tyche/terminal-kernel`, `@tyche/module-sdk`). | Those carry React / DOM / rendering concerns the server must not depend on. | `grep -rn "@tyche/ui\|@tyche/terminal-kernel\|@tyche/module-sdk" apps/api/src` |
| D | **No import cycles.** The graph is a DAG that drains into `contracts`. | Cycles break `tsc`, break Vite's source-consumption model, and make "who owns this type" unanswerable. | build/typecheck fails loudly if you introduce one |

**IMPORTANT nuance (do not repeat the common myth):** `api` **does** import
`@tyche/analytics` directly — `apps/api/src/routes/user.ts:14` imports
`computePortfolioRisk` for portfolio-risk math. `analytics` is a *pure, dependency-free
math library* (rule §5) shared by both `api` and `web`; sharing it is intended and
fine. The rule is specifically: **api must not import the UI/kernel/module-sdk browser
packages** — NOT "api imports nothing but contracts + data-adapters". Verify the real
edges before asserting them.

**When you add a dependency:** confirm the new edge keeps the DAG draining toward
`contracts` and does not violate A–D. If a lower package suddenly "needs" something
from a higher one, the type almost certainly belongs in `contracts` — move it there
instead of adding a back-edge. Anything that changes the dependency graph is a
behavior change: route it through **tyche-change-control**.

---

## 2. The NO-BUILD-STEP rule — 6 libraries publish raw source

The 6 library packages (`contracts`, `analytics`, `module-sdk`, `terminal-kernel`,
`ui`, `data-adapters`) have **no build step**. Their `package.json` sets
`main`, `types`, and `exports["."]` all to **`./src/index.ts`** — the raw TypeScript,
not compiled `dist/`. Verify:
`node -e "const p=require('./packages/contracts/package.json'); console.log(p.main,p.types,JSON.stringify(p.exports))"`
→ `./src/index.ts ./src/index.ts {".":"./src/index.ts"}`.

- Only **`apps/web` has a `build` script** (`vite build`). Every other member's
  `build` script is absent. Verify:
  `for d in packages/* apps/*; do node -e "const p=require('./$d/package.json'); console.log('$d', (p.scripts&&p.scripts.build)||'NONE')"; done`
  → only `apps/web` prints `vite build`.
- **Vite (web) and `tsx` (api) consume the library `src/` directly.** `apps/api`
  runs from TypeScript via `tsx`; it too has no build step — it is executed, not bundled.
- **`vite build` does NOT run `tsc` first.** Type-checking is a *separate* gate step
  (`pnpm typecheck`). A green `pnpm build` does not mean the types are sound.

**Why:** zero build-orchestration between packages. Change a contract and every
consumer sees it on the next `tsx`/Vite run with no rebuild ordering, no stale
`dist/`, no "did I rebuild the dep first?" class of bug. The cost is that
type-checking must be run explicitly and that `strict` TS across all 8 members
(`tsconfig.base.json`) is what catches cross-package type breakage.

The full gate command, toolchain versions, and tsconfig flags live in
**tyche-build-and-env** — do not re-derive them here.

---

## 3. The provider CAPABILITY-GAP model

This is the central design idea (ADR-0002). It has two halves that must stay in sync.

**Supply side:** every provider declares a flat boolean map over **28 capability keys**
— `PROVIDER_CAPABILITY_KEYS` in `packages/contracts/src/provider.ts:10-39`
(`ProviderCapabilitiesSchema`, `provider.ts:44-79`, is one `z.boolean()` field per key).
Recount, never trust a doc figure (docs say "24" and are STALE):
`awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next} /\] as const/{f=0} f' packages/contracts/src/provider.ts | grep -c "'"` → `28`.

**Require side:** every command (`CommandDescriptorSchema.requiredCapabilities`,
`contracts/src/terminal.ts`) and every module (`ModuleManifestSchema.requiredCapabilities`,
`contracts/src/module.ts`) declares which capabilities it needs.

**The gap = required minus available.** Computed in the terminal kernel:
`missingCapabilities(required, available) = required.filter(cap => !available[cap])`
(`packages/terminal-kernel/src/capabilities.ts:4-9`).

### The two non-negotiable rules of the gap

1. **The gap is NEVER thrown.** The missing set is attached to the `open-panel`
   effect's `missingCapabilities` field (`packages/terminal-kernel/src/executor.ts`;
   effect type in `types.ts:27-41`). The module renders a graceful "missing capability"
   state; it does not crash, and the executor emits declarative effects, never
   exceptions. A capability gap is a *first-class UI state*, not an error.

2. **The tuple and the object schema MUST stay in sync.** `schemas.test.ts:56-59`
   asserts `Object.keys(ProviderCapabilitiesSchema.shape).sort()` equals
   `[...PROVIDER_CAPABILITY_KEYS].sort()` (both directions). **Adding a capability
   edits BOTH** the `PROVIDER_CAPABILITY_KEYS` tuple AND the
   `ProviderCapabilitiesSchema` object, or that test fails. `NO_CAPABILITIES`
   (`provider.ts:115-117`) is the all-false base every stub provider starts from.

**Why the whole model exists:** a fresh clone has only the mock provider, and real
providers each cover a different slice. Rather than special-casing "is this data
available?" at every call site, the system computes one gap and renders one graceful
state. This is what makes **"mock mode always works"** (product invariant #4)
mechanically true.

The executable recipe for wiring a *new* capability end to end (contract → key in
both places → DataProvider method → StubProvider default → MockProvider impl →
conformance probe → route → apiClient → command → module → tests) lives in
**tyche-vertical-slice-campaign**. This skill owns the *model*; that skill owns the
*procedure*.

---

## 4. The Envelope — data + provenance is the universal transport

Every practical data response is an **`Envelope<T> = { data: T; provenance: DataProvenance }`**
(`packages/contracts/src/provenance.ts:58-62`). The runtime schema builder is
`envelope(schema) = z.object({ data: schema, provenance: DataProvenanceSchema })`
(`provenance.ts:65-66`). The `DataProvider` interface's 25 methods each return
`Promise<Envelope<T>>`.

`DataProvenance` (`provenance.ts:42-56`) carries: `provider`, `providerMode`
(`mock | public | paid | enterprise | user_supplied`), `capability`, `retrievedAt`,
`freshness` (tier ∈ `live | delayed | eod | historical | mock | unknown`), and optional
`license`, `attribution`, `sourceUrl`, `notes`, `cacheHit`.

**Why provenance is MANDATORY, not optional:** product invariant #3 — *"a number
without provenance is a bug."* Provenance renders in panel footers and rides into CSV
exports as comment headers, so a user (or an auditor) can always answer "where did
this figure come from, and how stale is it?". The `formatCitation()` helper
(`provenance.ts:74-88`) produces the one-line form (`mock · quotes · live · as of
2026-06-28`) reused identically by panel footers, exports, and AI citations. The
invariant's rationale lives in **tyche-change-control**; the transport *shape* is owned
here.

**Note:** the *error* wire shape is NOT a contract — there is no error enum in
`@tyche/contracts`. Errors are assembled inline as
`{ error: { kind, message, capability?, detail? }, provenance? }`; `kind` is a plain
string, not a closed union. Even error/gap responses still carry provenance
(via `gapProvenance`, below).

---

## 5. serveCapability — the "degrade, never crash" contract

`serveCapability` (`apps/api/src/routes/helpers.ts:45-84`) is the single funnel through
which market-data routes answer. Its contract:

| Situation | HTTP | Body |
|-----------|------|------|
| No provider supplies the capability | **200** | `{ error: { kind: 'capability_unavailable', capability, message }, provenance: gapProvenance(...) }` |
| Loader throws `CapabilityError` | **200** | same `capability_unavailable` shape |
| Loader throws anything else (real provider failure) | **502** | `{ error: { kind: 'provider_error', capability, message }, provenance: gapProvenance(...) }` |
| Loader succeeds | 200 | the `Envelope` from the loader |

**The rule: a capability gap is HTTP 200, NEVER 500.** A 500 for a gap is a bug. Even
a resolved-but-unsatisfiable request gets provenance — `gapProvenance(registry, capability)`
(`helpers.ts:23-33`) names the would-be provider (or `'none'`) with `freshness.tier:
'unknown'`, so an empty/errored panel still tells the user which provider *would* serve it.

**Why:** the terminal must stay usable when data is missing. A missing feed is a
routine, expected condition (self-host with no keys, a provider that does not cover
this symbol) — it degrades to a labelled gap, not a stack trace. A genuine upstream
failure (network, parse) is the *only* thing that earns a 5xx, and it is a 502
(bad gateway = upstream fault), never a 500. The global `setErrorHandler`
(`apps/api/src/app.ts`) turns any truly-uncaught 5xx into a generic
`{ error: { kind: 'internal', message: 'Internal server error.' } }` that leaks no
internals — but reaching it means an invariant was already violated.

This is ADR-0002 made concrete. Persisted (non-market) routes use a different helper,
`localProvenance` (`helpers.ts:6-15`, provider `'local'`, tier `'live'`); those follow
the validate → persist → audit → `{ data, provenance }` pattern documented in the
add-a-route recipe in **tyche-vertical-slice-campaign**.

---

## 6. Kernel purity — parser → executor → declarative effects, DOM-free

`@tyche/terminal-kernel` is the UI-agnostic core: **parse a command line → validated
registry lookup → executor emits declarative EFFECTS** that the web host interprets.
It has **no DOM, no React** and is fully unit-tested.

- **Parser** (`parser.ts`) is a pure function `parseCommand(input, options) →
  CommandParseResult`. No side effects.
- **Executor** (`executor.ts`) returns a `CommandEffect[]` — a union of `open-panel`,
  `set-active-instrument`, `search`, `message{info|warn|error}`, `noop`
  (`types.ts:27-41`). It **never throws** on a capability gap (§3); it attaches the
  gap to the effect. The web host (`apps/web/src/terminal/execute.ts`) is what turns
  effects into store mutations / DOM.

**Why a design rule, not an accident:** keeping parse→execute pure and declarative
means the entire command grammar, gating, and effect logic is testable without a
browser (see `parser.test.ts`, `executor.test.ts`, `registry.test.ts`). The kernel
decides *what should happen*; only the thin web adapter decides *how to render it*.
This is ADR-0003. Do not import DOM/React into the kernel, and do not make the
executor throw for gaps — both would collapse the boundary that makes it testable.

---

## 7. Analytics purity — dependency-free, deterministic, null-on-degenerate

`@tyche/analytics`'s only runtime dependency is `@tyche/contracts` (types). That is the
*structural proof* of purity. Verify:
`node -e "console.log(require('./packages/analytics/package.json').dependencies)"`
→ `{ '@tyche/contracts': 'workspace:*' }`.

Three purity rules, each a design rule enforced by convention + tests (there is no
lint rule — see §9):

1. **Dependency-free / no I/O / no network.** No import of `data-adapters`, `api`,
   `fetch`, `axios`, `http`, or `fs`. It defines no route, no apiClient, no capability.
   The data (fundamentals, candles, filings) is fetched by *existing* capabilities and
   handed in as already-normalized contract arrays.
2. **No wall clock → deterministic.** `Date.now(` and `Math.random(` appear **0 times**
   in source. The only `new Date(...)` calls parse dates *from the data* (e.g.
   `performance.ts:116` anchors trailing returns to the LAST candle's timestamp), never
   the clock — so a computation is reproducible from its inputs alone.
3. **Returns `null` / never fabricates on degenerate input.** P/E is `null` when EPS ≤ 0;
   `marketSensitivity` nulls the whole bundle when < 2 aligned observations or a series
   is flat ("a degenerate input must render '—', never a fabricated 0"); Altman/Beneish
   are all-or-null; an unknown 8-K code echoes `Item {code}` rather than inventing a label.

**Why:** these functions produce numbers a user will read as facts. Determinism makes
them testable as fixed-input → hand-computed-output (`toBeCloseTo(x, 6)`) and
reproducible across sessions; null-on-degenerate upholds *"never silently mislabel a
datum."* An **analytics-only feature adds NO capability, route, or apiClient** — it
reuses existing data inside a web module's `useMemo` and is verified by a co-located
`X.test.ts`. The actual formulas (Altman/Piotroski/Beneish/beta/DCF/…) and their
mislabel traps live in **financial-terminal-reference**, not here.

---

## 8. The 4 ADRs (all Status: Accepted, dated 2026-06-28, in `docs/adr/`)

| ADR | Title | One-line decision |
|-----|-------|-------------------|
| 0001 | Clean-room terminal foundation | Build against publicly-documented terminal feature *categories* only; never copy any proprietary product's UI/data/naming/docs. Underpins product invariant #5. |
| 0002 | Provider capability model | Providers declare capabilities; modules require them; the gap degrades gracefully and **never crashes** (§3, §5). |
| 0003 | Command registry & module SDK | A pure, testable `parse → execute → declarative effects` kernel with a validated command registry; the web host interprets effects (§6). |
| 0004 | Public competitor research & clean-room roadmap | How to research competitors from public sources and plan the roadmap without violating clean-room (0001). |

Read the full text in `docs/adr/NNNN-*.md` before citing specifics. A new
load-bearing decision earns a new ADR — route it through **tyche-change-control**.

---

## 9. KNOWN WEAK POINTS (stated plainly, labelled OPEN)

These are real, documented, and NOT yet fixed. State them honestly; do not paper over them.

- **[OPEN] Self-host bearer guard uses plain `===`, not `timingSafeEqual`.**
  `apps/api/src/security/auth.ts:27` compares `token === config.authToken` — a
  non-constant-time compare, inconsistent with the hosted-mode posture which *does*
  use `timingSafeEqual` (sessions, password verify). Documented as an open question at
  `docs/BUILD_MANUAL.md:1382`. It is a theoretical timing oracle on the self-host
  admin token. Verify: `grep -n "token === config.authToken" apps/api/src/security/auth.ts`.
  Whether it is an accepted tradeoff for the coarse foundation guard or a latent
  hardening TODO is unresolved — treat as OPEN.

- **[OPEN] No automated enforcement of the Envelope / `{data}|{error}` invariants.**
  Nothing lints that a new provider method returns `Envelope<T>` or that a route uses
  the `{data}` / `{error}` shape. These hold only via the conformance suite, code
  review, and convention (`docs/BUILD_MANUAL.md:1382` block). A weaker model could
  regress them without a red test — so verify shapes by hand when reviewing.

- **[OPEN] Version skew.** Root `package.json` is `0.3.0` while library members are
  still `0.1.0` (and the Dockerfile ARG default is `0.1.0`). Cited in the doc-drift
  register; verify with `node -e "console.log(require('./package.json').version)"` vs
  `node -e "console.log(require('./packages/contracts/package.json').version)"`.

- **[DOC DRIFT — trust the code] Capability / command counts.** Docs say "24
  capabilities" and "41 stable commands"; the code has **28** keys in `provider.ts`
  and **60** in `DEFAULT_COMMANDS`. Always recount (commands:
  `grep -c '^  cmd({' packages/terminal-kernel/src/commands.ts`). Never hard-code a
  drifting count without its recount command. Full register in **tyche-docs-and-writing**.

---

## When NOT to use this skill (use the sibling instead)

| You want to… | Use this sibling |
|--------------|------------------|
| Follow the step-by-step recipe to add a data vertical or a new adapter | **tyche-vertical-slice-campaign** |
| Understand a financial formula (Altman/Piotroski/Beneish/beta/DCF) or a mislabel trap | **financial-terminal-reference** |
| Know the rationale/history of the 5 product invariants, or route any behavior change through the gate | **tyche-change-control** |
| Look up an env var, flag, default, or the adapter keyless/BYO-key roster | **tyche-config-and-flags** |
| Run the full gate command, toolchain versions, Docker, or CI details | **tyche-build-and-env** |
| Run/deploy/operate the app, persistence, backup/restore | **tyche-run-and-operate** |
| Add or structure a test, or e2e idioms | **tyche-validation-and-qa** |
| Triage a symptom to a fix, or read the settled failure chronicle | **tyche-debugging-playbook** / **tyche-failure-archaeology** |
| Maintain docs, CHANGELOG, or the doc-drift register | **tyche-docs-and-writing** |
| Positioning, differentiators, non-goals, pricing | **tyche-external-positioning** |

Any workflow that changes system behavior (schema, config, deploy, promoting an
experiment) MUST route through **tyche-change-control** — never around it.

---

## Provenance & maintenance

Skill authored **2026-07-19**. Every VOLATILE fact below is date-stamped and paired
with a one-line re-verification command. Re-verify before relying on any figure; if a
command's output disagrees with this skill, **trust the code** and update the skill.

| Fact (as of 2026-07-19) | Re-verify with |
|-------------------------|----------------|
| Workspace = 8 members | `ls -d packages/*/ apps/*/ \| wc -l` |
| Dependency edges per package | `node -e "console.log(require('./packages/<name>/package.json').dependencies)"` |
| web imports no server pkg | `grep -rn "@tyche/api\|@tyche/data-adapters" apps/web/src` (empty) |
| api imports no browser pkg | `grep -rn "@tyche/ui\|@tyche/terminal-kernel\|@tyche/module-sdk" apps/api/src` (empty) |
| api DOES import analytics | `grep -rn "@tyche/analytics" apps/api/src` (hits `routes/user.ts`) |
| Only web has a build script | `for d in packages/* apps/*; do node -e "const p=require('./$d/package.json');console.log('$d',(p.scripts&&p.scripts.build)||'NONE')"; done` |
| Libraries publish `./src/index.ts` | `node -e "const p=require('./packages/contracts/package.json');console.log(p.main,p.types)"` |
| 28 capability keys | `awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next} /\] as const/{f=0} f' packages/contracts/src/provider.ts \| grep -c "'"` |
| tuple↔object sync test | `sed -n '56,59p' packages/contracts/src/schemas.test.ts` |
| serveCapability contract | `sed -n '45,84p' apps/api/src/routes/helpers.ts` |
| Envelope shape | `sed -n '58,66p' packages/contracts/src/provenance.ts` |
| kernel effect union | `sed -n '27,41p' packages/terminal-kernel/src/types.ts` |
| analytics single dep | `node -e "console.log(require('./packages/analytics/package.json').dependencies)"` |
| analytics no clock | `grep -rn "Date\.now(\|Math\.random(" packages/analytics/src --include=*.ts \| grep -v .test.ts` (empty) |
| 4 ADRs, Accepted 2026-06-28 | `for f in docs/adr/*.md; do head -4 "$f"; done` |
| bearer guard uses `===` (OPEN) | `grep -n "token === config.authToken" apps/api/src/security/auth.ts` |
| known-weak-points doc block | `sed -n '1378,1392p' docs/BUILD_MANUAL.md` |
| 60 DEFAULT_COMMANDS (drift-prone) | `grep -c '^  cmd({' packages/terminal-kernel/src/commands.ts` |
