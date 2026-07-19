---
name: tyche-validation-and-qa
description: >
  What counts as evidence in Tyche and how to add each kind of test. Load this
  whenever you are ADDING or CHANGING a test, deciding "how do I prove this
  works?", or a reviewer asks for a regression test. Covers the four test
  layers — (1) unit/contract (Vitest, node env, co-located *.test.ts; contract
  round-trips; analytics golden/determinism with toBeCloseTo(x,6) + degenerate
  NULL cases), (2) API smoke via fastify.inject in app.test.ts, (3) provider
  CONFORMANCE via checkProviderConformance, (4) e2e (Playwright Chromium,
  tests/e2e/smoke.spec.ts) — plus the STRICT-MODE e2e idioms that prevent
  flakes (getByRole heading/columnheader/exact over getByText substrings) and
  the acceptance discipline (adversarial self-review + a regression test per
  confirmed finding, full gate green). Triggers: "add a test", "write a test",
  "how do I test this", "golden test", "determinism test", "fastify.inject",
  "conformance test", "flaky e2e", "strict mode violation", "getByText
  resolved to N elements", "regression test", "toBeCloseTo", "beta null flat
  series", "my test passes but is it enough". NOT for running the gate command
  (tyche-build-and-env), running conformance as a CLI tool
  (tyche-diagnostics-and-tooling), or proving a formula correct from first
  principles (tyche-proof-and-analysis-toolkit).
---

# Tyche — Validation & QA

This skill tells you **what counts as evidence** in Tyche and **how to add each
kind of test**. Tyche has FOUR test layers. A change is "done" only when the
layer(s) it touches have real tests AND the full gate is green.

> **Jargon, defined once.**
> - **Envelope** — every provider/data response is `{ data, provenance }`. A
>   number without provenance is a bug.
> - **Capability** — a typed feature key (`quotes`, `fundamentals`, …) a
>   provider declares it supports. 28 keys today (recount below).
> - **Conformance** — the check that a provider actually honors every capability
>   it declares (method resolves + envelope validates against the Zod schema).
> - **Golden test** — a fixed input mapped to a hand-computed expected output.
> - **Degenerate input** — an input too weak to support a real answer (flat
>   series, empty array, EPS ≤ 0). The correct answer is `null`, never `0`.
> - **Strict mode** — Playwright errors if a locator matches more than one
>   element. Most e2e flakes are strict-mode violations.
> - **The gate** — `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
>   The command itself is owned by **tyche-build-and-env**; this skill only tells
>   you which layers each step exercises.

---

## When NOT to use this skill

| You want to… | Use instead |
|---|---|
| Run the gate / know pnpm & node versions / why there's no build step | **tyche-build-and-env** |
| Run conformance / a matrix / a wiring audit as a shipped CLI tool | **tyche-diagnostics-and-tooling** |
| Prove a formula (Altman, Beneish, BSM, beta) correct from first principles | **tyche-proof-and-analysis-toolkit** and **financial-terminal-reference** |
| Add the actual data vertical (schema→capability→route→module) | **tyche-vertical-slice-campaign** |
| Triage a failing test / symptom→cause | **tyche-debugging-playbook** |
| Change schema/config/deploy or promote an experiment | **tyche-change-control** (route ALL behavior changes through it — never around it) |

This skill is the "how do I add and shape a test" reference. Everything else
above is a sibling.

---

## The four layers at a glance

| # | Layer | Runner | Lives in | Proves |
|---|---|---|---|---|
| 1 | Unit / contract | Vitest (node) | co-located `X.test.ts` | pure logic, schema round-trips, analytics math + null discipline |
| 2 | API smoke | Vitest + `fastify.inject` | `apps/api/src/app.test.ts` | routes return right status + `{data\|error, provenance}` |
| 3 | Provider conformance | Vitest + `checkProviderConformance` | each adapter's `*.test.ts` | a provider honors every capability it declares |
| 4 | e2e | Playwright (Chromium) | `tests/e2e/smoke.spec.ts` | the real UI acceptance scenario in a browser |

Layers 1–3 all run under one root Vitest process (`pnpm test` = `vitest run`,
node env). Layer 4 runs under Playwright (`pnpm test:e2e`) and is **excluded**
from Vitest (`vitest.config.ts` excludes `**/e2e/**`). No member has its own
`test` script — tests are collected centrally by the root
`vitest.config.ts` include globs (`packages/**` + `apps/**` `*.test.ts`).

---

## Layer 1 — Unit / contract tests (Vitest, node)

**Where:** co-located next to the source, `foo.ts` → `foo.test.ts` in the same
directory. Import `{ describe, it, expect } from 'vitest'`. Environment is
`node` (globals on) — no DOM, no browser.

### 1a. Contract round-trip tests

A contract test proves a Zod schema accepts good shapes and rejects bad ones,
and that the envelope wrapper round-trips. Pattern
(`packages/contracts/src/schemas.test.ts`):

```ts
it('accepts a well-formed quote', () => {
  expect(QuoteSchema.safeParse({ symbol:'AAPL', price:195.12, timestamp:'2026-06-28T13:45:00.000Z' }).success).toBe(true);
});
it('rejects a quote missing the timestamp', () => {
  expect(QuoteSchema.safeParse({ symbol:'AAPL', price:1 }).success).toBe(false);
});
it('wraps data with provenance', () => {
  expect(envelope(QuoteSchema).safeParse({ data:{…}, provenance:{…} }).success).toBe(true);
});
```

**The capability-sync guard (do not delete).** When you add a capability key you
edit TWO places — the `PROVIDER_CAPABILITY_KEYS` tuple AND the
`ProviderCapabilitiesSchema` object — in `packages/contracts/src/provider.ts`.
`schemas.test.ts` asserts they stay in sync **both directions**:

```ts
it('the keys array and the object schema stay in sync (both directions)', () => {
  expect(Object.keys(ProviderCapabilitiesSchema.shape).sort())
    .toEqual([...PROVIDER_CAPABILITY_KEYS].sort());
});
```

If you add a capability to only one, this test goes red. That is the point.

### 1b. Analytics golden / determinism tests — the signature pattern

`@tyche/analytics` is a pure, dependency-free, clock-free computation layer (its
only runtime dep is `@tyche/contracts`; no `Date.now`, no `Math.random`, no I/O
— purity as a design rule is owned by **tyche-architecture-contract**). That
makes every function a **pure function of its inputs**, so the test is: fixed
input → hand-computed output. Two halves, BOTH required:

**Half 1 — golden (fixed input → hand-computed output, `toBeCloseTo(x, 6)`).**
Build tiny fixtures with a helper, feed values whose answer you can compute by
hand, and assert to six decimals. From `marketBeta.test.ts`:

```ts
const c = (t: string, close: number): Candle =>
  ({ t: `${t}T00:00:00.000Z`, o: close, h: close, l: close, c: close });

it('recovers beta=2 / correlation=1 when the asset moves exactly twice the benchmark', () => {
  const bench = [c('2024-01-02',100), c('2024-01-03',110), c('2024-01-04',104.5), c('2024-01-05',106.59)];
  const asset = [c('2024-01-02',100), c('2024-01-03',120), c('2024-01-04',108),   c('2024-01-05',112.32)];
  const s = marketSensitivity(asset, bench, 'AAPL', 'SPY');
  expect(s.beta).toBeCloseTo(2, 6);
  expect(s.correlation).toBeCloseTo(1, 6);
  expect(s.rSquared).toBeCloseTo(1, 6);
  expect(s.alpha).toBeCloseTo(0, 6);   // asset = exactly 2× benchmark → zero alpha
});
```

Choose inputs where the math is analytic (asset = exactly k× benchmark ⇒
beta = k, ρ = 1, α = 0; `pe ≈ price/eps`). `toBeCloseTo(x, 6)` (six decimals)
is the house standard — floating point makes exact `toBe` brittle.

**Half 2 — degenerate input → NULL, NEVER a fabricated 0.** This is the
non-negotiable analytics invariant: a degenerate input must produce `null` (the
UI renders `—`), never a made-up `0`. Every analytics test file carries these
cases as first-class tests. From `marketBeta.test.ts`:

```ts
it('returns null stats for a flat benchmark (zero variance), never a fabricated 0-beta', () => {
  const s = marketSensitivity(asset, [c('…',50),c('…',50),c('…',50)], 'AAPL', 'SPY');
  expect(s.beta).toBeNull();
  expect(s.correlation).toBeNull();
  expect(s.upCapture).toBeNull();
});
it('is empty-safe', () => {
  const s = marketSensitivity([], [], 'AAPL', 'SPY');
  expect(s.observations).toBe(0);
  expect(s.beta).toBeNull();
});
```

Degenerate cases to always cover (match the function): empty array; a **flat
series** (zero variance → beta/correlation `null`); a denominator ≤ 0 (P/E `null`
when EPS ≤ 0); insufficient history (a short series must not fabricate a 3-year
return); an all-or-nothing scorecard missing one line item → score `null`
(Altman/Beneish report incomplete, never a partial number dressed as complete).
The mislabel/never-fabricate rules behind these live in
**financial-terminal-reference**; the correctness proof method lives in
**tyche-proof-and-analysis-toolkit** — this skill only says *test both halves*.

**Checklist — adding an analytics function test**
- [ ] `X.test.ts` co-located next to `X.ts`.
- [ ] At least one golden case: fixed input → hand-computed output via `toBeCloseTo(v, 6)`.
- [ ] Empty-input case (returns nulls / zero observations, no throw).
- [ ] Every degenerate branch the function guards (flat series, denom ≤ 0, missing line item) asserted `toBeNull()`.
- [ ] Alignment/ordering behavior if the function sorts or aligns on dates.

---

## Layer 2 — API smoke via `fastify.inject` (`app.test.ts`)

**Where:** `apps/api/src/app.test.ts`. It builds **one shared app in
`beforeAll`** on the mock provider, awaits `ready()`, drives routes with
`app.inject(...)`, and closes in `afterAll`. No network, no ports, temp data
dirs.

```ts
let app: FastifyInstance;
const dataDir = join(tmpdir(), `tyche-test-${randomUUID()}`);
beforeAll(async () => {
  app = await buildApp({ config: { dataDir, providers: ['mock'] } });
  await app.ready();
});
afterAll(async () => { await app.close(); });

it('serves a quote', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/quote/AAPL' });
  expect(res.statusCode).toBe(200);
  expect(res.json().data.symbol).toBe('AAPL');
});
```

**What every API test asserts:** the HTTP `statusCode` AND the parsed
`res.json()` envelope shape (`{ data, provenance }` on success;
`{ error:{ kind, message }, provenance? }` on error). For mutations
(`POST`/`DELETE`) round-trip through persistence: write, then read it back in a
later `inject` and assert it persisted.

**Cover, at minimum, for a new/changed route:**
- Every route group it belongs to (Health, Market, Research, User, Ai, Stream, and hosted Auth/Billing/Admin).
- **Capability handling** — a capability gap is **HTTP 200** with
  `error.kind:'capability_unavailable'`, never a 500. (The degrade-never-crash
  contract of `serveCapability` is owned by **tyche-architecture-contract**;
  here you *test* it: assert `statusCode === 200` and the error kind.)
- **Persistence round-trip** — POST then GET returns the stored record; a
  concurrent/compare-and-set path (alerts `markAlertTriggered`) fires exactly once.
- **The no-advice AI guard** (PRODUCT INVARIANT — the copilot never gives
  buy/sell/hold advice). Both a body-shape assertion and a decline assertion,
  verbatim from `app.test.ts`:

```ts
it('declines personalized advice', async () => {
  const res = await app.inject({ method:'POST', url:'/api/ai/chat',
    payload:{ messages:[{ role:'user', content:'Should I buy AAPL?' }], context:{ activeSymbol:'AAPL', provenance:[] } } });
  expect(res.json().message.content).toMatch(/can't provide personalized/i);
});
// and: expect(body.disclaimer).toMatch(/not personalized investment advice/i);
```

Never weaken or delete the no-advice tests. If you touch the copilot, these plus
`ai/copilot.test.ts` must stay green.

**Checklist — adding an API route test**
- [ ] Add the `it(...)` to the existing shared-app block in `app.test.ts`.
- [ ] Assert `statusCode` AND `res.json()` shape.
- [ ] Gap path → 200 + `capability_unavailable`; genuine provider throw → 502 `provider_error`.
- [ ] Mutation → audit + persistence round-trip (read it back).
- [ ] Touching the copilot → the two no-advice assertions above stay green.

---

## Layer 3 — Provider conformance

**The gate every adapter test uses.** `checkProviderConformance(provider)`
(`packages/data-adapters/src/conformance.ts`) walks every capability the
provider declares, calls the corresponding method, and `safeParse`s the result
against `envelope(Schema)`. A capability with no probe yet is reported as
`passed` (nothing to verify). It returns `{ provider, ok, checks[] }`.

Every real adapter test asserts conformance the same way
(`MockProvider.test.ts`, and Finnhub/Fred/Gdelt/SecEdgar/Stooq tests):

```ts
it('honors every declared capability with schema-valid envelopes', async () => {
  const report = await checkProviderConformance(new MockProvider({ referenceDate: fixedDate }));
  const failed = report.checks.filter((c) => !c.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);  // JSON in the msg names the failing capability
  expect(report.ok).toBe(true);
});
```

Same function is used by `PluginHost` to quarantine non-conformant operator
plugins (running it as a shipped/CLI tool is owned by
**tyche-diagnostics-and-tooling** — do not restate that here).

**How to add a conformance test / probe:**
1. New adapter → its `X.test.ts` constructs the provider and asserts
   `checkProviderConformance(provider)` → `report.ok === true`, failing checks
   `toHaveLength(0)`.
2. New capability → add a `Probe` (a `call` + the `envelope(Schema)` it must
   satisfy) to `buildProbes` in `conformance.ts`, keyed by the capability. Give
   it deterministic probe args (the existing ones use `AAPL` / `BTC-USD`,
   `BERKSHIRE`, `SPY`, `GDP`). Without a probe the capability is trusted blindly.
3. A provider that declares a capability but returns a bad envelope must make its
   test go red — that is the whole safety property.

---

## Layer 4 — e2e (Playwright, Chromium) — `tests/e2e/smoke.spec.ts`

**One spec file, Chromium only, `workers: 1`, `retries: 0`, `fullyParallel:
false`** (`playwright.config.ts`). Playwright boots two servers itself: the API
(`pnpm --filter @tyche/api start`, mock mode, port 4010, data dir `./.tyche-e2e`)
and the web dev server (port 5173), both `reuseExistingServer: true`. `baseURL`
is `http://localhost:5173`; each test does `await page.goto('/')`.

The acceptance scenario is: `⌘K` → type a command (`AAPL GP`) → a panel opens;
panels tile; workspaces save/restore across reload; each domain command renders
its panel and degrades (never crashes) on bad input. `retries: 0` means **a
flaky test is a broken test** — write for zero flake.

### STRICT-MODE E2E IDIOMS (this is how you avoid flakes)

Playwright strict mode fails a locator that matches >1 element
(`getByText resolved to N elements`). The rules, each with a real example:

| Rule | Do | Avoid |
|---|---|---|
| **Prefer a role + name over raw text.** | `getByRole('button', { name: 'Save', exact: true })`; `getByRole('columnheader', { name: 'Calls' })`; `getByRole('heading', { name: 'Beneish M-Score' })` | `getByText('Save')` / `getByText('Beneish M-Score')` — the string also appears in footnotes/labels |
| **Use `exact: true` on `getByText`/name** so a label isn't a substring of a longer one. | `getByText('Beta', { exact: true })`; `getByRole('button', { name: 'Last', exact: true })` | `getByText('Beta')` matches "Beta", "Beta (β)", "Downside beta"… |
| **Scope to the semantic role** when a word is both a header and a cell. | `getByRole('columnheader', { name: 'Strike' })`, `getByRole('cell', { name: '30Y' })` | `getByText('Strike')` |
| **Use a heading role for section titles** that also appear elsewhere. | `getByRole('heading', { name: 'Trailing return' })` | `getByText('Trailing return')` |
| **Add `.first()` only when you genuinely expect duplicates** (e.g. a legend chip + a table cell of the same ticker). | `getByText('AAPL · GP').first()` | `.first()` to paper over an ambiguous locator you could have scoped precisely |
| **Regex when you want a controlled partial** (filename, dynamic count). | `getByText(/^Max pain /)`, `toMatch(/^AAPL-options-.+\.csv$/)` | a bare substring that also matches other rows |
| **Run-unique names for anything the API persists across runs.** The e2e data dir persists between runs, so a fixed name accumulates rows and a name-matched locator resolves to many → strict-mode violation. | `` const forkName = `E2E fork ${Date.now()}` `` (see the LAYOUT test) | reusing `"E2E layout"` every run |
| **Assert on ARIA state, not styling, for toggles.** | `toHaveAttribute('aria-pressed', 'true')`, `toHaveAttribute('aria-selected', 'true')` | asserting a CSS class that can change |
| **Reach inputs by their label.** | `getByLabel('Command input')`, `getByLabel('Alert threshold')` | brittle CSS/nth selectors |

**Standard flow helper** used throughout the spec (type into the command bar):

```ts
async function runCommand(page: Page, command: string): Promise<void> {
  const input = page.getByLabel('Command input');
  await input.click(); await input.fill(command); await input.press('Enter');
}
```

**Every panel test asserts panel count** (`getByTestId('panel-frame')` →
`toHaveCount(n)`) so an opened panel is proven, and degradation tests assert the
count stays (e.g. a non-optionable symbol shows an empty-state, panel count goes
2 not 1-and-a-crash).

**Checklist — adding an e2e test**
- [ ] `test('…', async ({ page }) => { await page.goto('/'); … })` in `smoke.spec.ts`.
- [ ] Drive via `runCommand(page, '<SYMBOL> <CMD>')`; assert `panel-frame` count.
- [ ] Locators use role + `exact`/regex per the table above — never a bare substring.
- [ ] Anything persisted (workspace/screen/note names) uses a `${Date.now()}`-unique name.
- [ ] A degrade case (bad/unsupported symbol) asserts an empty-state, not a crash.
- [ ] Toggles asserted via `aria-pressed`/`aria-selected`, not CSS.

---

## Acceptance discipline: adversarial self-review + a regression test per finding

This is the project's signature review culture and it is **mandatory** before a
slice ships (the workflow is governed by **tyche-change-control**; the proof
methods behind a finding are in **tyche-proof-and-analysis-toolkit**):

1. **Adversarially self-review your own slice** through multiple lenses
   (correctness, security, concurrency, provenance, degrade-never-crash,
   never-mislabel-a-datum). Recurring bug classes to hunt: timing oracles,
   TOCTOU / lost-update on concurrent writes, cross-tenant/global-key isolation
   leaks + stored XSS, spoofable `X-Forwarded-For`, mixed-universe provider
   routing, SEC fiscal-frame quirks, signed-vs-gross math, and **mislabeling a
   datum** (using the wrong field for a metric).
2. **Every confirmed finding gets fixed WITH a regression test** — the test must
   FAIL on the pre-fix code and PASS after. Put it in the layer that owns the
   bug: analytics math → Layer 1 golden/null; route/status → Layer 2 inject;
   provider envelope → Layer 3 conformance; UI behavior → Layer 4 e2e. There is
   no "trust me, fixed" — a fix without a red-then-green test is not done.
3. **The full gate must be green before you push:** typecheck (all 8 workspaces,
   "8/8"), `vitest` (Layers 1–3), `build`, `test:e2e` (Layer 4). The exact
   command and toolchain are owned by **tyche-build-and-env**. If any of the four
   is red, the slice is not done. Culture is **fix forward** (no `git revert`),
   so a landed regression test is the thing that keeps a bug closed.

**"Is my test enough?" quick self-audit**
- Did I test the DEGENERATE input, not just the happy path? (null, not 0.)
- Does the test fail on the OLD code? (A test that passes before the fix proves nothing.)
- Am I asserting the ENVELOPE/provenance, not just the data value?
- For e2e: does the locator resolve to exactly one element on a persisted-data dir?

---

## Provenance & maintenance

Author: fable process, **2026-07-19**. Volatile facts are date-stamped with a
re-verification command. Tyche has known **doc drift** — trust CODE over docs and
recount rather than trusting any figure (including the ones below).

| Fact (as of 2026-07-19) | Value | Re-verify |
|---|---|---|
| Root test script | `pnpm test` = `vitest run` (node env) | `node -p "require('./package.json').scripts.test"` |
| e2e runner/config | Playwright, Chromium only, workers 1, retries 0 | `sed -n '1,47p' playwright.config.ts` |
| Vitest include/exclude (e2e excluded) | `packages/**`+`apps/**` `*.test.ts`; excludes `**/e2e/**` | `sed -n '9,22p' vitest.config.ts` |
| Provider capability keys | **28** | `node -e "const t=require('fs').readFileSync('packages/contracts/src/provider.ts','utf8');const m=t.match(/PROVIDER_CAPABILITY_KEYS = \[([\s\S]*?)\] as const/);console.log((m[1].match(/'/g)||[]).length/2)"` |
| DEFAULT_COMMANDS | **60** | `grep -c "cmd({" packages/terminal-kernel/src/commands.ts` |
| e2e test cases in smoke.spec | **63** | `grep -c "^test(" tests/e2e/smoke.spec.ts` |
| Vitest test files (Layers 1–3) | **97** | `find packages apps -name node_modules -prune -o -name '*.test.ts' -print \| grep -v node_modules \| wc -l` |
| Conformance entrypoint | `checkProviderConformance` in `packages/data-adapters/src/conformance.ts` | `grep -n "export async function checkProviderConformance" packages/data-adapters/src/conformance.ts` |
| Capability-sync guard | `schemas.test.ts` "stay in sync (both directions)" | `grep -n "stay in sync" packages/contracts/src/schemas.test.ts` |
| No-advice guard tests | `app.test.ts` "declines personalized advice" + `ai/copilot.test.ts` | `grep -rn "declines personalized\|can't provide personalized" apps/api/src` |
| Golden precision standard | `toBeCloseTo(x, 6)` | `grep -rn "toBeCloseTo" packages/analytics/src` |
| Shared-app inject harness | `beforeAll → buildApp({config:{dataDir,providers:['mock']}}) → ready()` | `sed -n '36,46p' apps/api/src/app.test.ts` |
| Doc-claimed counts are STALE | README says "24 capabilities / 41 commands / 520+ tests / 35 e2e" — do NOT trust | recount with the commands above |

**Recount rule:** any count you cite in code review or docs must be paired with
its recount command. Never hard-code a drifting number.
