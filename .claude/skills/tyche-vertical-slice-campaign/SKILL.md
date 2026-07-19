---
name: tyche-vertical-slice-campaign
description: >-
  THE executable, decision-gated campaign for shipping a COMPLETE new data vertical (a new
  capability + panel) OR a new real data adapter end-to-end through every wiring point in Tyche —
  contract schema, capability key, provider method, mock impl, conformance probe, API route,
  apiClient, command, module, tests, docs — so it passes the full gate AND survives adversarial
  review without violating a product invariant. Load this when the task is any of: "add a new data
  type / panel / command", "add <capability> to the terminal", "wire a new provider/adapter"
  (Binance-style), "add a new module", "expose <SEC/FRED/exchange> data", "ship a forensic /
  analytics panel", "add a metric over existing data", "the mock breaks a fresh clone", "capability
  gap / missing-capability UI", "schemas.test fails after I added a capability", "conformance
  fails", or anytime you are threading a datum from an upstream source through provider→API→web. Use
  the ANALYTICS-ONLY branch when you cannot reach a live upstream to verify real behavior. NOT for
  fixing an existing panel's bug (tyche-debugging-playbook), pure test authoring
  (tyche-validation-and-qa), or config/env changes alone (tyche-config-and-flags).
---

# Tyche Vertical-Slice Campaign

You are adding a **data vertical** (a new provider capability + the panel that shows it) or a **new
real adapter** to Tyche, a keyboard-first financial *research* terminal. This is the project's
hardest live problem: one datum must thread through ~13 wiring points, pass a 4-part gate, and
survive adversarial self-review — often when the live upstream **cannot be reached** to confirm real
behavior. This skill is the numbered, gated recipe. Follow it in order; do not skip gates.

**Jargon, defined once.** *Capability* = a typed key (e.g. `quotes`) naming one kind of data a
provider can serve. *Vertical* = the full stack for one capability: contract schema → capability key
→ provider method → mock → route → apiClient → command → module. *Envelope* = the universal
`{ data, provenance }` transport shape; a number without provenance is a bug (Invariant 3). *Gate* =
`pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`. *Mock parity* = every capability a real
adapter serves must ALSO be served deterministically by the MockProvider in the SAME PR (Invariant 4).

## The five product invariants (never violate — full rationale in `tyche-change-control`)

1. **Research-only.** No buy/sell/hold advice, no orders. 2. **Never bundle/resell market data** —
live sources use the operator's own keyless/free credentials. 3. **Provenance on everything** — every
response is `Envelope<T>`. 4. **Mock mode always works** — a fresh clone with zero keys runs the whole
terminal on the deterministic mock; every new capability ships a mock impl in the same PR. 5.
**Clean-room** — benchmark documented feature categories only, never copy a proprietary product.

---

## Phase 0 — Choose the path (DECISION GATE, do this first)

| Question | Yes → | No → |
| --- | --- | --- |
| Does the feature need a **new kind of upstream data** (not already served by a capability)? | Consider **Path A (full vertical)** | Use **Path B (analytics-only)** |
| Can you **reach & verify the live upstream** right now (real HTTP response, real fields)? | Path A is safe | Prefer **Path B**, or a mock-only Path A deferring the real adapter |
| Is the feature a **new metric / scorecard / transform over data we already fetch**? | **Path B (analytics-only)** — lower risk | — |

**Ranked menu (pick the lowest-risk path that delivers the feature):**

| Path | What it adds | Mandatory obligations | Risk |
| --- | --- | --- | --- |
| **B. Analytics-only** (preferred when upstream unverifiable) | A pure `@tyche/analytics` helper consumed in a module via `useMemo`. **NO new capability, route, or apiClient method.** | A **golden test** (fixed input → hand-computed output via `toBeCloseTo(x,6)`) **and** a **degenerate-null test** (empty/flat/≤0-denominator input → returns `null`, never a fabricated `0`). | Low — no wire, no upstream |
| **A. Full vertical, mock-first** | New capability + schema + MockProvider impl + probe + route + apiClient + command + module. Real adapter **deferred** to a later PR. | Everything in Phase 1–6, 8–11 below. Real-adapter override (Phase 7) skipped; the capability is served by mock only. | Medium |
| **A+. Full vertical with real adapter** | All of the above **plus** a real adapter override. | All of Path A **plus**: the real adapter obliges a **mock impl + conformance probe in the SAME PR** (Invariant 4). Never ship a real adapter without mock parity. | High — needs a verifiable upstream |

> **Why analytics-only is the escape hatch:** `@tyche/analytics` depends on `@tyche/contracts` and
> nothing else — no network, no `fetch`, no wall clock (`Date.now()`/`Math.random()` count = 0). It
> reuses data that existing capabilities already fetch, so it needs no upstream. The recent-work
> pivot (valuation-history, market-beta, seasonality, Altman/Piotroski/Beneish scorecards) is all
> Path B. Design rationale lives in `tyche-architecture-contract`; formulas + mislabel traps live in
> `financial-terminal-reference`.

**If Path B:** skip to **Phase B**. **If Path A / A+:** continue to Phase 1.

---

## PATH A — Full vertical (numbered, gated)

Do phases in order. After each phase run the stated gate command; the **Expected** line tells you
whether you are on track, and the **If instead** line tells you what to do when you are not.

### Phase 1 — Contract schema (`@tyche/contracts`)

Files: `packages/contracts/src/<domain>.ts`, `.../index.ts`, `.../schemas.ts`.

1. In `packages/contracts/src/<domain>.ts` write the Zod schema, reusing primitives from `common.ts`
   (`IsoDateTime`, `Id`, `Currency`, `FiniteNumber`):
   ```ts
   export const FooSchema = z.object({ symbol: z.string(), asOf: IsoDateTime, value: FiniteNumber });
   export type Foo = z.infer<typeof FooSchema>;   // type is DERIVED from the schema, never hand-written
   ```
   Compose existing schemas with `.extend(...)` (see `instruments.ts:42`).
2. Barrel it: add `export * from './<domain>';` to `packages/contracts/src/index.ts`.
3. Register it: import `FooSchema` into `schemas.ts` and add `Foo: FooSchema,` to the `Schemas` object.

**Gate:** `pnpm --filter @tyche/contracts typecheck`
**Expected:** exits 0, no output. **If instead** a `tsc` error: a `z.infer` type mismatch or an unbarrelled
import — read the error's file:line and fix the schema before moving on.

### Phase 2 — Capability key (edit BOTH places or the contract test fails)

File: `packages/contracts/src/provider.ts`.

1. Add `'fooData'` to the `PROVIDER_CAPABILITY_KEYS` `as const` tuple (`provider.ts:10-39`).
2. Add `fooData: z.boolean(),` to the `ProviderCapabilitiesSchema` `z.object({...})` (`provider.ts:44-79`).

**Gate:** `npx vitest run packages/contracts/src/schemas.test.ts`
**Expected:** green. `schemas.test.ts:56-59` asserts `Object.keys(ProviderCapabilitiesSchema.shape).sort()`
equals `[...PROVIDER_CAPABILITY_KEYS].sort()`. **If instead** it fails with an array-mismatch diff: you
edited only ONE of the two — the missing side is named in the diff. `NO_CAPABILITIES` auto-covers the new
key (it is `Object.fromEntries(KEYS.map(k=>[k,false]))`).

> **Recount, don't trust docs:** the tuple currently has **28** keys (verify:
> `awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next} /\] as const/{f=0} f' packages/contracts/src/provider.ts | grep -c "'"`).
> README/BUILD_MANUAL still say "24" — that is stale drift.

### Phase 3 — DataProvider method + StubProvider default

File: `packages/data-adapters/src/Provider.ts`.

1. Add the method to the `DataProvider` interface (near `Provider.ts:84-120`):
   `getFoo(symbol: string): Promise<Envelope<Foo>>;`
2. Add a **StubProvider default** so the abstract class still implements the interface
   (`Provider.ts:129-220`): `getFoo(_symbol: string): Promise<Envelope<Foo>> { return this.fail('fooData'); }`
   — every real adapter that `extends StubProvider` inherits this loud-reject default.

**Gate:** `pnpm --filter @tyche/data-adapters typecheck`
**Expected:** exits 0. **If instead** `Class 'StubProvider' incorrectly implements interface 'DataProvider'`:
you added the interface method but not the StubProvider default — add it. Method↔capability is NOT 1:1
(e.g. `getHistory` serves both `historicalPrices` and `intradayPrices`); routing reads the descriptor's
capability booleans, never method presence.

### Phase 4 — MockProvider implementation (deterministic, seeded, keyless — Invariant 4)

File: `packages/data-adapters/src/MockProvider.ts`.

1. Set the capability true in `MOCK_CAPABILITIES` (`MockProvider.ts:94`): `fooData: true,`.
2. Implement `getFoo` **deterministically** — seed all randomness from the symbol string via
   `seededRng(symbol, 'foo-v1')` (from `random.ts`), never `Date.now()`/`Math.random()`. Wrap the
   result: `return withProvenance(data, this.prov('fooData', 'mock'));` (helper `prov()` at
   `MockProvider.ts:583`). Reuse the master price path (`this.master(seed, end)`) if the datum derives
   from prices, so the mock stays internally consistent (quote agrees with history).

**Gate:** `npx vitest run packages/data-adapters/src/MockProvider.test.ts`
**Expected:** green. **If instead** non-determinism: assert the same symbol twice returns identical data;
a diff means a live clock/RNG leaked in — replace with `seededRng`.

### Phase 5 — Conformance probe (schema-validates the mock envelope)

File: `packages/data-adapters/src/conformance.ts` (`buildProbes`, ~`:52-127`).

Add a probe so the declared capability is envelope-validated:
```ts
fooData: { call: (p) => p.getFoo(equitySymbol), schema: envelope(FooSchema) },
```
A declared capability with **no** probe auto-passes ("nothing to verify yet") — that is a silent hole,
so always add the probe.

**Gate:** `npx vitest run packages/data-adapters/src/MockProvider.test.ts`
**Expected:** green — the adapter test calls `checkProviderConformance(provider)`, which runs your probe's
`envelope(FooSchema).safeParse(result)`. **If instead** a `path: message` parse failure: the mock's shape
diverges from the contract — align the mock to `FooSchema` (do not loosen the schema to fit a sloppy mock).

### Phase 6 — API route (`serveCapability` — degrade, never crash)

Files: a route group in `apps/api/src/routes/*.ts` (`market.ts` for market data, `research.ts` for
research data). Add inside the existing `register<Group>Routes(app, ctx)`:
```ts
app.get('/api/foo/:symbol', async (req, reply) => {
  const symbol = (req.params as { symbol: string }).symbol;
  return serveCapability(reply, ctx.registry, 'fooData', (p) => p.getFoo(symbol), symbol);
});
```
`serveCapability` (`helpers.ts:45-84`) returns **HTTP 200** `{data, provenance}` on success; **HTTP 200**
`{error:{kind:'capability_unavailable',...}, provenance: gapProvenance(...)}` when no provider supplies
the capability or on `CapabilityError`; **HTTP 502** `provider_error` on any other throw. **Capability
gaps are 200, never 500.** Pass `symbol` so venue-scoped providers only see their own universe.

**Gate:** add a `fastify.inject` test to `apps/api/src/app.test.ts` (one shared app in `beforeAll`,
`buildApp({config:{dataDir, providers:['mock']}})` then `app.ready()`), then
`npx vitest run apps/api/src/app.test.ts`.
**Expected:** `res.statusCode === 200` and `res.json().data` valid; provenance present. **If instead** a
500: your handler threw outside `serveCapability` — everything that can throw must be inside the loader.

### Phase 7 — Real adapter override (Path A+ ONLY; skip for mock-first / analytics-only)

Only do this if you can **verify the live upstream**. File: `packages/data-adapters/src/<Name>Provider.ts`
(or `stubs/<Name>Provider.ts` — note `stubs/` is a misnomer; SecEdgar & Fred there are FULL real impls).

1. `extends StubProvider`; set `fooData: true` in its descriptor `capabilities`; `override getFoo(...)`.
2. Inject a `FetchLike` (default `globalThis.fetch`), a `MemoryCache`, and a `throttle()`/`minIntervalMs`.
3. Keys/User-Agents come ONLY from env → config; **never** put a key in provenance, `sourceUrl`, or error
   messages (Invariant 2). Keyless-public or BYO-key only — no paid feed shipped/proxied.
4. Degrade: a data gap → empty-but-valid envelope, not a 502.
5. Wire the enable path in `providerRegistry.ts` `instantiate()` switch + `apps/api/src/env.ts` if it is a
   new provider name; mock is always appended last as the fallback.

**Gate:** `npx vitest run packages/data-adapters/src/<Name>Provider.test.ts` — must call
`checkProviderConformance` on the real adapter (mock its `fetch` with a recorded upstream fixture).
**Expected:** conformance green against the fixture. **If instead** you cannot get a real fixture: **stop —
do not ship the real adapter this PR.** Ship Path A mock-first; add the real adapter when the upstream is
reachable. A real adapter without mock parity violates Invariant 4.

### Phase 8 — apiClient method (web data layer)

File: `apps/web/src/providers/apiClient.ts`. Add to the `api` object:
```ts
getFoo: (symbol: string) => fetchEnvelope<Foo>(`/api/foo/${encodeURIComponent(symbol)}`),
```
Returns `EnvelopeResult<Foo>` = `{ok:true;data;provenance} | {ok:false;error;provenance}` — gap/error still
carries the would-be provenance.

**Gate:** `pnpm --filter @tyche/web typecheck` → expects 0 errors.

### Phase 9 — Command (`@tyche/terminal-kernel`)

File: `packages/terminal-kernel/src/commands.ts` — add a `cmd({...})` to `DEFAULT_COMMANDS`:
```ts
cmd({ id: 'FOO', aliases: ['FOOBAR'], title: 'Foo Panel', description: '…', category: 'market-data',
  moduleId: 'foo', requiredCapabilities: ['fooData'], requiresInstrument: true,
  defaultPanelSize: { w: 6, h: 8 }, maturity: 'stable', examples: ['AAPL FOO'] }),
```
**ID rules (`terminal.ts:34`):** id must match `/^[A-Z][A-Z0-9]*$/` — **uppercase LETTER first, then
uppercase alnum only.** No lowercase, no leading digit, no symbols/hyphens. **Aliases** are
`z.array(z.string())` with **NO regex** — an alias MAY start with a digit or be a symbol (real: `'?'`,
`'8K'`, `'13F'`); the only alias rule is uniqueness. `moduleId` is kebab-case and is the join key to the web
component.

**Gate:** `npx vitest run packages/terminal-kernel/src/registry.test.ts`
**Expected:** green — `validateCommandSurface(DEFAULT_COMMANDS)` passes. **If instead** `Duplicate command
id` / `Alias collision` / non-uppercase-id throw: fix the id/alias per the rules above.

### Phase 10 — Web module (panel) + component registration

Files: `apps/web/src/modules/FooModule.tsx`, `apps/web/src/modules/components.ts`.

1. Write the module — a named-export React fn rendering only its BODY (PanelHost supplies the frame /
   footer / provenance chrome). Canonical shape (mirror `ValuationModule.tsx`):
   ```tsx
   export function FooModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
     const data = useApiData(() => (symbol ? loadFoo(symbol) : noSymbol()), [symbol]);
     useReportProvenance(reportProvenance, data.provenance);
     if (!symbol) return <SymbolRequired />;
     return (
       <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage="No data.">
         {(d) => /* render d with @tyche/ui: DataTable, formatNumber/formatCurrency/formatPercent */}
       </ModuleBody>
     );
   }
   ```
   `ModuleBody` is the render ladder: capability-gap → unavailable → loading → error (`onRetry=reload`) →
   empty → `children(data)`. All `@tyche/ui` format helpers return `'—'` on null. To fold two fetches into
   one ladder: one async `loadFoo` awaits the PRIMARY (`if (!primary.ok) return primary`), then the
   secondary, merges, returns the primary's provenance.
2. Register in `components.ts` keyed by the **same moduleId** as the command:
   ```ts
   foo: lazy(() => import('./FooModule').then((m) => ({ default: m.FooModule }))),
   ```

**Gate:** `pnpm --filter @tyche/web typecheck && pnpm build`
**Expected:** typecheck 0 errors, build succeeds. **If instead** `assertModuleCoverage()` throws at test/boot
("stable command lacks a real component"): the `moduleId` in `components.ts` does not match the command's
`moduleId` — they must be identical strings.

### Phase 11 — Tests across all 4 layers, then docs

Add/confirm tests at each layer (mechanics in `tyche-validation-and-qa`):

| Layer | File | What to assert |
| --- | --- | --- |
| Contract | `packages/contracts/src/<domain>.test.ts` | `FooSchema.safeParse` happy-path + rejection; capability-key sync (Phase 2) |
| Provider/conformance | `packages/data-adapters/src/MockProvider.test.ts` | determinism + `checkProviderConformance` passes the new probe |
| API route | `apps/api/src/app.test.ts` | `app.inject` → 200 `{data,provenance}`; gap path 200 not 500 |
| Kernel | `packages/terminal-kernel/src/registry.test.ts` | `validateCommandSurface` still passes |
| Web/e2e | `tests/e2e/smoke.spec.ts` | command opens the panel; provenance footer renders |

**Docs (required for Definition of Done):** update `COMMANDS.md` (new command row), `DATA_PROVIDERS.md`
(new capability / adapter), `CHANGELOG.md` (`## Unreleased` section, Keep-a-Changelog style), and
`.env.example` if the real adapter added an env var. Doc maintenance detail: `tyche-docs-and-writing`.

Then go to **Validation & promotion** below.

---

## PATH B — Analytics-only (reuse an existing capability)

Use when the feature is a metric/scorecard/transform over data already fetched, or when you cannot verify
a live upstream. **Add NO capability, NO route, NO apiClient method.**

1. **Pure helper** — new function in a `packages/analytics/src/<name>.ts`, barrelled in
   `packages/analytics/src/index.ts`. Rules (enforced by the package's zero-dep design): no
   data-adapters/api import, no `fetch`/`fs`/`http`, **no wall clock** (`Date.now()`/`Math.random()` must
   stay at count 0), and **return `null` on degenerate input — never fabricate a `0`** (e.g. P/E null when
   EPS ≤ 0; beta null when < 2 observations or a flat series). Every docstring: "educational analytics
   only — not investment advice" (Invariant 1).
2. **Consume it** in an existing (or new) module via `useMemo`:
   ```ts
   const scores = useMemo(() => fundamentalScorecard(statements ?? []), [statements]);
   ```
   The data comes from an existing capability's `useApiData` call (fundamentals/history/filings). Formulas
   and mislabel traps: `financial-terminal-reference`.
3. **Tests (both required):**
   - **Golden:** fixed input array → hand-computed expected via `expect(result).toBeCloseTo(x, 6)`.
   - **Degenerate-null:** empty / flat / ≤0-denominator input → `expect(result).toBeNull()` (or the
     bundle nulls). This is the anti-fabrication proof.

**Gate:** `npx vitest run packages/analytics/src/<name>.test.ts` → green, both cases covered.

Then update `CHANGELOG.md` (`## Unreleased`) and any relevant `COMMANDS.md` row, and go to Validation.

---

## KNOWN WRONG PATHS (fenced off — each has evidence)

| Wrong move | What breaks | Evidence |
| --- | --- | --- |
| Add a capability key to the tuple **only** (or the object **only**) | `schemas.test.ts` fails on an array-mismatch diff | `packages/contracts/src/schemas.test.ts:56-59` |
| Ship a **real adapter without a mock impl + probe** in the same PR | Invariant 4 — a fresh clone with zero keys can no longer run that capability | `docs/BUILD_MANUAL.md:16-33`; MockProvider is always-appended fallback |
| Add a `DataProvider` interface method but **not** a `StubProvider` default | `StubProvider incorrectly implements interface DataProvider` (typecheck fails; breaks every real adapter) | `Provider.ts:129-220` |
| Use a **near-miss upstream field** (e.g. `CommonStockSharesIssued` for shares-outstanding, which includes treasury) | The **mislabel class** — a silently wrong number ships. History has multiple fix commits (LVGI double-count, empty-balance-sheet) | dossier §9; **"Never silently mislabel a datum"** |
| Let a capability gap **throw / 500** | Violates degrade-never-crash; the panel should render a graceful gap state | `serveCapability` returns 200 with `capability_unavailable` (`helpers.ts:45-84`) |
| Fabricate a `0` (or any value) on degenerate analytics input | Violates the analytics purity rule; a `0` reads as a real datum | analytics returns `null`; degenerate-null test is mandatory |
| Command id with lowercase / leading digit / hyphen | Registry `CommandDescriptorSchema.parse` throws | `terminal.ts:34` regex `/^[A-Z][A-Z0-9]*$/` |
| `moduleId` in `components.ts` ≠ command's `moduleId` | `assertModuleCoverage()` throws; panel falls back to `BetaPlaceholder` | `apps/web/src/modules/registry.ts` |
| Put an API key in provenance / `sourceUrl` / error text | Leaks the operator's credential (Invariant 2) | Finnhub/FRED send keys only as request params |

---

## Validation & promotion protocol (MEASURABLE — never judged by eye)

Promotion routes through **`tyche-change-control`** (one slice per PR, conventional-commit subject,
adversarial self-review, exact commit trailers). Do NOT route around it. Success is measured, not eyeballed:

1. **Full gate** (the exact sequence — details in `tyche-build-and-env`):
   ```
   pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
   ```
   - `pnpm typecheck` = `pnpm -r run typecheck` → **8/8** members print `Done` (one per workspace member).
     **Expected: 8/8.** If fewer than 8, a member's `tsc --noEmit` failed — read that member's error.
   - `pnpm test` = `vitest run` (single root process) → **all green**. If red, the failing file:test names the layer.
   - `pnpm build` = `pnpm --filter @tyche/web build` → Vite bundle succeeds (note: `vite build` does NOT run
     `tsc` first — typecheck is the separate step above).
   - `pnpm test:e2e` = `playwright test` (Chromium) → green when UI changed.
2. **Conformance** — the adapter test's `checkProviderConformance(provider)` is green (Path A/A+): every
   declared capability's probe `safeParse`s the full envelope.
3. **Adversarial self-review** (the project signature — 19 "adversarial review" + 17 "harden" commits).
   Re-read your diff through the recurring bug classes: mislabel, TOCTOU/lost-update, isolation leak,
   timing oracle, provider-routing over mixed universes, signed-vs-gross math. Each finding gets a fix
   **with a regression test**. Method + proof recipes: `tyche-proof-and-analysis-toolkit`.
4. **Definition of Done** (12 gates — recount `sed -n '1331,1355p' docs/BUILD_MANUAL.md | grep -c '\[ \]'` → 12; the "13-gate" label in some handoff notes is a mislabel, see `tyche-change-control`): invariants intact; `{data,provenance}` /
   `{error:{kind,message},provenance?}` shape + correct HTTP; Zod `.safeParse` at the boundary + shape in
   `@tyche/contracts`; audit event on mutations; strict-TS clean; the full gate above; `.env.example` +
   docs + CHANGELOG updated; adversarial self-review done.

You are done only when **8/8 typecheck, vitest green, conformance pass, e2e green, docs+CHANGELOG updated**.

---

## When NOT to use this skill (use the named sibling instead)

| Situation | Use instead |
| --- | --- |
| An existing panel/route has a **bug** (wrong number, crash, regression) | `tyche-debugging-playbook` |
| You only need to **write or fix tests** (no new vertical) | `tyche-validation-and-qa` |
| You only need to run the **gate** or understand toolchain/CI | `tyche-build-and-env` |
| Only **config / env var / provider enable-list** changes | `tyche-config-and-flags` |
| You need the **structural WHY** of each layer (capability-gap model, degrade-never-crash design) | `tyche-architecture-contract` |
| You need a **domain formula** (Altman/Piotroski/Beneish/beta/BSM) or a mislabel trap | `financial-terminal-reference` |
| **Promoting** anything that changes behavior (schema/config/deploy/experiment) | `tyche-change-control` |
| **Correctness proof** recipes (golden/determinism/mislabel-detection/adversarial method) | `tyche-proof-and-analysis-toolkit` |
| Deciding **whether an idea is shippable** at all | `tyche-research-methodology` |

---

## Provenance & maintenance (VOLATILE facts — re-verify before trusting; date-stamped 2026-07-19)

Trust the CODE over docs — the repo has known doc drift. Every count below is drift-prone; recount, do not
memorize.

| Fact (as of 2026-07-19) | Value | Re-verify command (run from repo root) |
| --- | --- | --- |
| Provider capability keys | **28** | `awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next} /\] as const/{f=0} f' packages/contracts/src/provider.ts \| grep -c "'"` |
| `DEFAULT_COMMANDS` | **60** | `grep -c '^  cmd({' packages/terminal-kernel/src/commands.ts` |
| `moduleComponents` entries | **60** | `grep -cE 'lazy\(\(\) =>' apps/web/src/modules/components.ts` |
| MockProvider capabilities true | **26 of 28** (all except `bonds`, `portfolio`) | `sed -n '/const MOCK_CAPABILITIES/,/^};/p' packages/data-adapters/src/MockProvider.ts \| grep -c ': true'` |
| Contract capability-sync test | `schemas.test.ts:56-59` | `sed -n '56,59p' packages/contracts/src/schemas.test.ts` |
| Command id regex | `/^[A-Z][A-Z0-9]*$/` | `grep -n 'command id must be UPPERCASE' packages/contracts/src/terminal.ts` |
| `serveCapability` gap = HTTP 200 | 200 `capability_unavailable`; 502 only on non-CapabilityError throw | `sed -n '45,84p' apps/api/src/routes/helpers.ts` |
| StubProvider `fail()` default | every method rejects loudly | `sed -n '129,220p' packages/data-adapters/src/Provider.ts` |
| Conformance probe registry | `buildProbes` in `conformance.ts` | `sed -n '52,127p' packages/data-adapters/src/conformance.ts` |
| Full gate command | `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` | `grep -n 'pnpm typecheck && pnpm test' CONTRIBUTING.md docs/BUILD_MANUAL.md` |
| Toolchain | pnpm 10.33.0, Node 22, TS ^5.7.3, vitest ^2.1.8, Playwright ^1.49.1 | `grep -n 'packageManager\|typescript\|vitest\|playwright' package.json` |
| Docs to update | `COMMANDS.md`, `DATA_PROVIDERS.md`, `CHANGELOG.md` (repo root) | `ls COMMANDS.md DATA_PROVIDERS.md CHANGELOG.md` |

**Doc-drift warning:** README:114 / BUILD_MANUAL say "24 capabilities" and "41 commands" — both stale; the
code has 28 and 60. If you cite any count in a PR, pair it with its recount command above. Note also the
`stubs/` directory is a misnomer: `SecEdgarProvider` and `FredProvider` there are FULL real
implementations; only `YahooProvider` and `CcxtProvider` are true no-op scaffolds.
