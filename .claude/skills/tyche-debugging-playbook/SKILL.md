---
name: tyche-debugging-playbook
description: >-
  Symptom -> triage -> discriminating-experiment -> fix table for Tyche's ACTUAL
  failure modes. Load this when you hit a concrete failure and need to fix it now:
  a strict-TS build/typecheck error ("is declared but its value is never read",
  "possibly undefined" on an array index, "does not provide an export" / "cannot
  be used as a value" under verbatimModuleSyntax); a Playwright e2e failure
  ("strict mode violation: resolved to N elements", locator ambiguity, timeouts);
  a terminal panel that unexpectedly shows "capability unavailable" or empty data;
  a module that flashes a false "no data"/"insufficient data" state or shows the
  wrong error while loading; a provider conformance test failing on envelope shape;
  empty AAPL/MSFT balance sheets from SEC EDGAR; a metric rendering a fabricated
  0.00 instead of "—"; mock-vs-real data divergence; an SSE quote/trade stream that
  does not move in mock mode. Use for phrases like "why is this failing", "the
  build broke", "typecheck error", "e2e is flaky", "panel says no data", "conformance
  test red", "the stream is frozen". For the settled story of WHY a past bug happened
  use tyche-failure-archaeology; for test mechanics use tyche-validation-and-qa.
---

# Tyche Debugging Playbook

Active-debugging reference for **Tyche** (keyboard-first financial *research* terminal;
pnpm TypeScript monorepo, 8 workspace members). Use it when something is broken and you
need the fastest path from **symptom you can see** to **the fix**. Every row is a real,
recurring Tyche failure mode with a *discriminating experiment* (a cheap read-only check
that confirms the cause before you touch code).

Jargon defined once, at first use. Commands are copy-pasteable and run from the repo root
`/home/user/Tyche` unless noted.

---

## When to use this skill

Load this when you have a **concrete, current failure** — a red build, a red test, a panel
showing the wrong thing, a stream that will not move — and you want to identify and fix it.

## When NOT to use this skill (use the named sibling instead)

| If you actually want to…                                              | Use this sibling instead        |
|-----------------------------------------------------------------------|---------------------------------|
| Understand the *settled history* of why a past bug happened & the lesson | **tyche-failure-archaeology**   |
| The full strict-TS flag list / the exact local gate command sequence  | **tyche-build-and-env**         |
| Test *mechanics*: how to add a test, e2e idioms, layers, `fastify.inject` | **tyche-validation-and-qa**     |
| Prove a hypothesis / write a golden or determinism check / mislabel detection | **tyche-proof-and-analysis-toolkit** |
| The architecture rules (capability-gap model, degrade-never-crash, analytics purity) | **tyche-architecture-contract** |
| Every env var and its default (`TYCHE_PROVIDERS`, keys, …)            | **tyche-config-and-flags**      |
| Run/deploy/persistence/backup operations                              | **tyche-run-and-operate**       |
| The domain formulas (Altman/Piotroski/beta/BSM) and mislabel traps    | **financial-terminal-reference**|
| Diagnostic scripts (conformance runner, wiring audit) — how to RUN them | **tyche-diagnostics-and-tooling**|

**Any fix that changes system behavior** (a schema, a config default, a capability, promoting
a provider) must route through **tyche-change-control** — one concern per PR, adversarial
self-review, regression test with the fix. Do not route around it.

---

## The 30-second triage loop

1. **Read the exact error text.** Tyche's failures name themselves — the TS code, the
   Playwright "strict mode violation", the `error.kind` in a JSON envelope.
2. **Classify the layer:** build-time (typecheck/`tsc`) · e2e (Playwright) · web-runtime
   (a panel) · api/provider (an envelope) · analytics (a number).
3. **Run the discriminating experiment** in the matching table below (a read-only check).
4. **Apply the fix**, add a regression test, run the gate:
   `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` (see tyche-build-and-env).

---

## 1. Build-time: strict-TypeScript breaks

Tyche compiles under a strict `tsconfig.base.json` (verify: `cat tsconfig.base.json`). Three
flags cause almost every "it compiled on my machine but CI is red" surprise. `pnpm typecheck`
runs `tsc --noEmit` in all 8 members; **`vite build` does NOT run `tsc` first** — a typecheck
error can hide behind a green build, so always run `pnpm typecheck` separately.

| Symptom (error text)                                                                 | Likely cause                                                                 | Confirm (discriminating check)                                     | Fix |
|--------------------------------------------------------------------------------------|------------------------------------------------------------------------------|--------------------------------------------------------------------|-----|
| `'x' is declared but its value is never read.` on a callback/map/handler parameter    | `noUnusedParameters: true` — an unused **positional** arg (e.g. the index in `arr.map((row, i) => …)` where `i` is unused, or an unused event arg) | Is the param positional (a later param IS used) so you can't just delete it? | Rename it with a leading underscore: `(row, _i) => …`. TS ignores params prefixed `_`. Only delete it outright if it is trailing. |
| Same error on a top-level `const`/`import`                                             | `noUnusedLocals: true`                                                        | Is it a local you stopped using?                                   | Delete it. Do not `_`-prefix locals to silence — remove dead code. |
| `Object is possibly 'undefined'` on `arr[i]`, `map.get(k)`, `record[key]`, `match[1]` | `noUncheckedIndexedAccess: true` — every index/`.get()` access is `T \| undefined` | `grep -n 'noUncheckedIndexedAccess' tsconfig.base.json` (it is on) | Guard (`const row = rows[i]; if (!row) return;`) or, when you have proven the index is in range, assert with a non-null narrowing (`rows[i]!`) — but prefer a real guard; the codebase's habit is to guard, not assert. |
| `Module '"x"' has no exported member 'T'` / `'T' cannot be used as a value` / `re-exporting a type when 'isolatedModules' is enabled requires 'export type'` | `verbatimModuleSyntax: true` — a **type-only** symbol imported/exported as a value | Is the symbol an `interface`/`type`/Zod-`infer`'d type (not a runtime value)? | Change the import to `import type { T } from '…'` (or `import { type T, runtimeValue }` for a mixed line), and re-exports to `export type`. |
| Switch statement: `Fallthrough case in switch.`                                       | `noFallthroughCasesInSwitch: true`                                            | A `case` with code but no `break`/`return`?                        | Add `break`/`return`, or an explicit `// falls through` only if intentional. |

> These flags are non-negotiable project rules — do not relax `tsconfig.base.json` to make an
> error go away. The full flag inventory and rationale live in **tyche-build-and-env**.

---

## 2. E2E: Playwright strict-mode ambiguity & flake

The e2e suite is a single spec, `tests/e2e/smoke.spec.ts`, run by `pnpm test:e2e` (Chromium,
`workers: 1`, `retries: 0`, base URL `http://localhost:5173`). Playwright locators are **strict
by default**: if a locator matches more than one element, the action fails instead of guessing.

| Symptom                                                                                  | Likely cause                                                                                          | Confirm                                                                                       | Fix |
|------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|-----|
| `Error: strict mode violation: locator resolved to N elements` (N ≥ 2)                    | A substring/`getByText` matched more than one node — commonly a short label that is also a substring of a heading, a footnote, or a second button (e.g. text "CSV" appearing as both a button and a caption). | Read the N snippets Playwright prints; look for a heading/footnote/second control sharing the string. | Prefer a **role + exact name**: `page.getByRole('button', { name: 'CSV', exact: true })`. `getByRole` scopes to the control; `exact: true` stops the substring collision. The spec already uses this idiom 90+ times (`grep -c getByRole tests/e2e/smoke.spec.ts`). For plain text that must be exact, `getByText('Venue', { exact: true })`. |
| Locator times out waiting for an element that IS on screen                                | The element exists but is not the *role* you queried, or a `.first()`/`.nth()` is needed on a legitimately repeated control (e.g. per-panel "Cycle link group"). | Does the app render several of this control (one per panel/row)?                              | Narrow by role+name; if genuinely repeated, chain `.first()` or scope to a parent locator. Never loosen to a broad `getByText`. |
| e2e flakes intermittently, esp. around **workspace save/restore** or after a reload       | A race between an optimistic UI write and page navigation — historically the workspace localStorage mirror was cleared on a `{ok:false}` save that lost to an in-flight fetch aborted by reload. Fixed forward in `ab560f4` (never roll back the optimistic mirror). | `git show ab560f4 --stat` — is your change re-introducing a rollback/`clearMirror` on failed save? | Keep the optimistic write + a failure toast; do **not** clear/roll back the local mirror on `{ok:false}`. Cross-account safety comes from namespacing the mirror key by user id (`apps/web/src/workspace/persistence.ts`), not from clearing. Full story: tyche-failure-archaeology. |

E2e runs its own API + web servers (`playwright.config.ts` `webServer`, both `reuseExistingServer`)
with the **mock** provider — so an e2e failure is almost never a data-source problem. Test idioms
and how to add an assertion belong to **tyche-validation-and-qa**.

---

## 3. Web-runtime: a panel shows the wrong state

A **module** is a named-export React function `XModule(props: ModulePanelProps)` that renders
only its body; the frame/footer/provenance chrome comes from the host. The canonical body drives
its states through `<ModuleBody>` (`apps/web/src/modules/common.tsx`), the standard render ladder:
**capability-gap → `state.unavailable` → loading → error → empty → content** (common.tsx line 14
comment; `:30` unavailable, `:39` loading, `:40` error). Data comes from `useApiData(loader, deps)`
(`apps/web/src/providers/useApiData.ts`).

| Symptom                                                                                     | Likely cause                                                                                                  | Confirm                                                                                                  | Fix |
|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|-----|
| Panel **flashes a false "no data"/"insufficient data"** then fills in, or briefly shows the **wrong error** (e.g. attributes a benchmark/secondary fetch failure to the whole panel) | The module runs **two independent `useApiData` loaders** (or fetches in parallel) with separate loading/error state, so there is a window where one is done and the other is not → the render ladder reads a half-loaded state. | Read the module: does it call `useApiData` twice (or `Promise.all` two envelopes into separate state) and branch on both? | **Fold both fetches into ONE `useApiData` loader** — the *primary* fetch drives the ladder; return early if `!primary.ok` (propagates its capability/error); then await the secondary and **degrade gracefully** (missing secondary → empty slice, not a panel error); return the primary's provenance. This is the **ComparisonModule / ValuationModule idiom** (`apps/web/src/modules/ComparisonModule.tsx`, `ValuationModule.tsx`). One loader = one ladder = no flash. |
| Panel shows **"capability unavailable"** (an amber capability chip / gap message) when you expected data | No enabled provider supplies that capability for this symbol. `serveCapability` returns **HTTP 200** with `error.kind:'capability_unavailable'` when `registry.forCapability(cap, symbol)` finds no provider (`apps/api/src/routes/helpers.ts`). This is the *degrade-never-crash* contract, not a crash. | See §4 row 1 — check `TYCHE_PROVIDERS`, provider registration order, and `servesSymbol`. | Enable a provider that declares the capability (set `TYCHE_PROVIDERS`, supply its key/UA), or fix routing. See §4. |
| Panel stuck on the **loading spinner** forever                                              | The loader promise never resolves, or `deps` never settle (a new object/array identity each render re-triggers the effect). | Add a `console.log` in the loader; check the Network tab for a pending request; inspect the `deps` array for an inline `{}`/`[]` that changes identity every render. | Ensure the loader resolves an `EnvelopeResult` (never a bare throw that is swallowed); stabilize `deps` (memoize or pass primitives like `symbol`, `range`). |
| Panel renders but the **provenance footer is blank / says "no provenance available"**       | The module did not call `useReportProvenance(reportProvenance, data.provenance)`, or the loader returned `provenance: null`. | Read the module: is `useReportProvenance` wired? Does the loader propagate `.provenance`? | Call `useReportProvenance(reportProvenance, data.provenance)`; ensure the *primary* fetch's provenance is returned even on a graceful gap (the gap envelope still carries would-be provenance). |

Wiring a whole new module (command + component + registry + route) is the vertical-slice recipe —
see **tyche-vertical-slice-campaign**, not this skill.

---

## 4. API / provider: capability gaps, conformance, data-source quirks

Providers are data adapters selected by an **explicit capability model**: a module asks for a
*capability* (e.g. `fundamentals`), and the registry routes to the first provider (in **registration
order**) that declares it and serves the symbol. The **mock** provider is always registered last as a
fallback, so the terminal is never dataless.

| Symptom                                                                                          | Likely cause                                                                                                                                                                   | Confirm (discriminating check)                                                                                                                                | Fix |
|-------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|
| A route/panel returns **`capability_unavailable`** for a capability you believe is enabled       | (a) the provider is not in `TYCHE_PROVIDERS`; (b) it is listed but was **skipped at boot** because its key/UA env is missing (SEC needs `SEC_EDGAR_USER_AGENT`, FRED needs `FRED_API_KEY`, Finnhub needs `FINNHUB_API_KEY`); (c) its `servesSymbol(symbol)` declines this symbol (venue-scoped, e.g. Binance declines `AAPL`); (d) it is registered *after* mock so mock served first. | 1) `curl -s localhost:4010/api/providers \| jq '.data'` (or `/api/health` → `.capabilities`) to see who is enabled and the aggregate capabilities. 2) Check the boot log for a "skipped/warn" line about a missing key. 3) `forCapability` scans in registration order (`packages/data-adapters/src/providerRegistry.ts`, `forCapability` ~line 78; mock appended last ~line 174). | Set `TYCHE_PROVIDERS` so the real provider is listed **before** mock; supply the required key/UA env (tyche-config-and-flags); for a conformant operator plugin use `registerBefore('mock', provider)` so it beats the fallback. Do not "fix" this by deleting the mock fallback. |
| **Provider conformance test fails** (`checkProviderConformance` reports a capability `passed:false` with a Zod issue path like `data.0.price: Expected number, received string`) | The adapter's returned envelope **drifted from the contract Zod schema**. Conformance calls each declared capability's probe method and runs `envelope(Schema).safeParse` on the result (`packages/data-adapters/src/conformance.ts`, `checkProviderConformance` ~line 139). Any shape mismatch fails. | Read the failing check's `error` string — the Zod `path: message` names the exact field. Compare the adapter's mapping to the schema in `packages/contracts/src/*.ts`. | Fix the **adapter mapping** to match the contract (coerce types, fill required fields, wrap as `{data, provenance}`). Never widen the contract schema to accept bad data — the schema is the SSOT. If the shape legitimately must change, that is a contract change → **tyche-change-control**. |
| **Empty balance sheet for AAPL / MSFT** (or another off-December fiscal-year filer) from SEC EDGAR fundamentals | SEC frames a fiscal-year-end *instant* by the **calendar quarter** of the year-end, not always Q4: `CY####Q3I` for a September year-end (AAPL), `CY####Q2I` for June (MSFT), `CY####Q4I` only for December filers. Hardcoding `CY####Q4I` returns nothing for those filers. Fixed in `d63f764`. | `git show d63f764` — read the commit body. In the adapter, is the FY-end instant frame hardcoded to `Q4I`? | Accept any `CY####Q[1-4]I` FY-end instant gated on `fp==='FY'`; key every annual fact by the **calendar year of its period END**, not fiscal `fy`. Also guard `res.json()` against non-JSON (WAF/maintenance HTML) → `ProviderError`, don't let a `SyntaxError` bypass the graceful-empty path. Full story: tyche-failure-archaeology. |
| **Mock-vs-real divergence** — a panel/analytic looks right on mock but wrong (or empty) against a real adapter, or vice-versa | The two providers legitimately return different shapes/coverage; a bug hides on whichever you did not test. Mock is deterministic and covers most capabilities; a real adapter covers only its declared subset and can return sparser data. | Run the same request against both: set `TYCHE_PROVIDERS=mock` vs the real provider and compare the envelopes. Run conformance on the real adapter (tyche-diagnostics-and-tooling). | Make the module/analytic robust to the sparser real shape (guard optional fields, degenerate-input null — see §5). Add a conformance probe and a test fixture that mirrors the real shape. Never hardcode assumptions that only hold for mock seed data. |
| **SSE stream does not move** in mock mode (quotes/trades panel frozen, no ticks) | The stream hub only applies its seeded random walk to **mock-mode** providers (`apps/api/src/stream/hub.ts`: `if (provider.descriptor.mode !== 'mock')` passes real data through untouched, `:58`; mock walk via `seededRng('stream', …)`, `:62`). If the resolved provider is not mock-mode, no jitter is added and a static real feed looks "frozen". Or the SSE connection never opened. | Which provider serves `quotes` for this symbol? (`/api/providers`). Is the browser `EventSource` connected (Network tab, `event: ready` then `event: quote`)? Is the symbol list non-empty? | If you expected the demo to "move", ensure the mock provider is serving (mock mode). If a real provider is correctly static between ticks, that is not a bug — live data is never jittered. If the connection is dead, check `WEB_ORIGIN`/CORS (the SSE route mirrors credentialed CORS manually) and that symbols are passed. |

The **degrade-never-crash contract** (capability gaps are HTTP 200, never 500) is an architecture
rule owned by **tyche-architecture-contract** — if you find a route returning 500 for a mere
missing provider, that is the bug, not the 200.

---

## 5. Analytics: a fabricated number instead of "—"

`@tyche/analytics` is pure (its only runtime dep is `@tyche/contracts`): no I/O, no wall clock,
deterministic. Its cardinal rule: **on degenerate input, return `null` — never a fabricated `0.00`.**
The UI renders `null`/`NaN` as `—` (all `packages/ui/src/format.ts` helpers are null-safe).

| Symptom                                                                                     | Likely cause                                                                                                          | Confirm                                                                                                        | Fix |
|--------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|-----|
| A metric shows a suspicious **`0.00`, `0%`, or a beta of exactly 0** on thin/degenerate data | A helper divided by zero, took a ratio on ≤ 0 denominator, or computed a slope on a flat/short series and returned `0` instead of `null` (a *fabricated* zero). | Feed the degenerate case (fewer than 2 observations, a flat benchmark, EPS ≤ 0) to the helper in a REPL/test and inspect the return. Reference guard: `packages/analytics/src/marketBeta.ts:105` nulls the whole bundle when `n < 2` or either series has zero stddev. | Add the **degenerate-input guard**: return `null` when the denominator ≤ 0, observations < 2, or variance is 0 (all-or-null for a bundle). Add a test asserting `null` (e.g. `expect(fn(flatInput)).toBeNull()`). The math and the specific null-conditions per metric live in **financial-terminal-reference**. |
| A number is **misattributed / mislabeled** (a value shown under the wrong field — e.g. treasury-inclusive shares as "shares outstanding") | A datum mapped to the wrong contract field — the recurring "never silently mislabel a datum" class. | Trace the field back to its source; does the source field's semantics match the label? | Map to the correct source field; if none exists, render `—`, do not approximate with a near-miss field. This is a correctness fix → regression test + tyche-change-control. Settled examples: tyche-failure-archaeology. |

---

## 6. Fast confirmation commands (read-only)

```bash
# Which flags are on (strict-TS triage §1)
cat tsconfig.base.json

# Reproduce the exact CI failure locally, one layer at a time
pnpm typecheck            # tsc --noEmit across all 8 members (build-time errors)
pnpm test                 # vitest run (unit/contract/api/conformance)
pnpm test:e2e             # Playwright (needs the web+api servers; config starts them)

# Provider/capability triage (§4) — with the API running (default port 4010)
curl -s localhost:4010/api/providers | jq '.data'      # enabled providers + capabilities
curl -s localhost:4010/api/health   | jq '.capabilities'

# Confirm a past-bug fix is not being re-introduced
git show d63f764          # SEC fiscal-frame fix
git show ab560f4          # optimistic-mirror rollback fix
```

---

## Provenance & maintenance

Date-stamped **2026-07-19**. Re-verify each volatile fact before relying on it; the repo has known
doc-drift, so trust CODE over prose and recount.

| Fact (as of 2026-07-19)                                                                 | Re-verify with |
|-----------------------------------------------------------------------------------------|----------------|
| Strict flags on: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`, `noImplicitOverride`; `exactOptionalPropertyTypes` OFF | `cat tsconfig.base.json` |
| `vite build` does not run `tsc` first (typecheck is a separate gate)                     | `cat apps/web/package.json` (build = `vite build`, no `tsc &&`) |
| Local gate: `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`                 | `grep -n 'typecheck && ' CONTRIBUTING.md` (and tyche-build-and-env) |
| Sole e2e spec `tests/e2e/smoke.spec.ts`; uses `getByRole(..., { exact: true })` idiom (90+ uses) | `grep -c getByRole tests/e2e/smoke.spec.ts`; `cat playwright.config.ts` |
| `ModuleBody` render ladder order (gap→unavailable→loading→error→empty→content)          | `sed -n '14,45p' apps/web/src/modules/common.tsx` |
| `useApiData` treats `error.kind==='capability_unavailable'` as a graceful gap           | `grep -n capability_unavailable apps/web/src/providers/useApiData.ts` |
| Fold-two-fetches idiom lives in ComparisonModule / ValuationModule                      | `sed -n '20,40p' apps/web/src/modules/ValuationModule.tsx` |
| `serveCapability`: missing provider or `CapabilityError` → HTTP **200** `capability_unavailable`; genuine throw → 502 | `sed -n '45,84p' apps/api/src/routes/helpers.ts` |
| `forCapability` routes in registration order; mock appended last                        | `grep -n 'forCapability\|register(\s*new MockProvider\|!registry.get' packages/data-adapters/src/providerRegistry.ts` |
| Conformance = `envelope(Schema).safeParse` per declared capability                      | `sed -n '139,175p' packages/data-adapters/src/conformance.ts` |
| SEC FY-end instant frame is calendar-quarter-of-year-end (fix `d63f764`)                | `git show d63f764` |
| Stream hub jitters only `mode === 'mock'` providers; real data untouched                | `grep -n "mode !== 'mock'\|seededRng('stream'" apps/api/src/stream/hub.ts` |
| Analytics returns `null` on degenerate input, never a fabricated 0 (`marketBeta`)       | `sed -n '100,106p' packages/analytics/src/marketBeta.ts` |
| Providers needing env keys are skipped at boot when unset (SEC UA / FRED / Finnhub)     | `grep -n 'User-Agent is configured\|API key is configured' packages/data-adapters/src/providerRegistry.ts` |
| Counts drift in docs (docs say 24 caps / 41 cmds; code has 28 / 60) — recount, don't trust prose | caps (=28): `sed -n '/PROVIDER_CAPABILITY_KEYS = \[/,/\] as const/p' packages/contracts/src/provider.ts \| grep -coE "'[a-zA-Z]+'"`; cmds (=60): `grep -c 'cmd({' packages/terminal-kernel/src/commands.ts` |
