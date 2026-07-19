---
name: tyche-proof-and-analysis-toolkit
description: >-
  The prove-it-don't-eyeball-it methods for Tyche. Load this WHENEVER you are about to claim a
  number, a fix, or a diff is correct — before you write "should be right", "looks correct",
  "tested", or "safe". Concrete triggers: writing or reviewing an @tyche/analytics helper
  (marketSensitivity/valuationHistory/seasonality/altmanZScore/piotroskiFScore/beneishMScore/
  performanceStats/eightKEvents) and needing to prove it; mapping an upstream vendor field
  (SEC EDGAR XBRL tag, Binance/FRED field) into a contract line item and asking "is this the
  RIGHT concept or a near-miss?"; the words "shares outstanding", "total liabilities", "P/E",
  "beta", "mislabel", "double-count", "treasury stock"; running the adversarial self-review pass
  before a push ("red-team my diff", "did I break an invariant", "is this claim true"); or proving
  a bug fix actually fixes (reproduce → patch → regression test fails-before/passes-after). Use it
  when the deliverable is a PASSING golden test or a GREEN gate, never a "looks-right" judgement.
---

# Tyche proof & analysis toolkit

Tyche's core engineering value is **measurable correctness**. A financial number that "looks
right" is a bug waiting to be shipped. This skill is the set of first-principles recipes the
departing expert used to *prove* correctness before every push. Each recipe ends in something you
can run and watch go green — a golden test, a null assertion, a regression test, a refuted claim —
never a subjective "seems fine".

Four methods, each with a worked example lifted from this repo's history:

1. **Golden determinism test** — prove an analytics function correct with a hand-derivable input.
2. **Mislabel-detection** — prove an adapter maps the *right* upstream concept, not a near-miss.
3. **Adversarial self-review** — enumerate your diff's claims and try to refute each before push.
4. **Prove-the-fix** — reproduce, patch, show the regression test red-before / green-after.

Jargon, defined once:
- **Golden test**: a test with a *fixed synthetic input whose answer you computed by hand*, so a
  wrong implementation cannot pass. Not a snapshot of whatever the code happened to output.
- **Degenerate input**: an input that has no meaningful answer (empty series, flat series, EPS ≤ 0).
  Tyche's rule: return `null` / empty, never a fabricated `0`.
- **Mislabel**: giving an output field a name that claims a concept the upstream datum does not
  actually mean (calling shares *issued* "shares outstanding").
- **`toBeCloseTo(x, 6)`**: vitest assertion — value equals `x` to 6 decimal places. The standard
  precision for Tyche golden numbers.

---

## When to use this skill — and when NOT to

| Situation | Use |
|---|---|
| Proving an `@tyche/analytics` helper computes the right number | **THIS skill** (Method 1) |
| Proving a vendor field maps to the right contract concept | **THIS skill** (Method 2) |
| Pre-push red-team of your own diff / claims | **THIS skill** (Method 3) |
| Proving a bug fix truly closes the bug | **THIS skill** (Method 4) |
| You need the *domain formula itself* (Altman weights, Beneish M constant, BSM) | `financial-terminal-reference` — do not re-derive formulas here |
| You need test-runner mechanics (how vitest/Playwright are wired, adding a test file) | `tyche-validation-and-qa` |
| You want the *settled story* of a past bug (what happened, why) | `tyche-failure-archaeology` |
| You are changing schema/config/deploy/promoting an experiment | `tyche-change-control` — **route through it, never around it** |
| You need the design *rationale* for analytics purity or degrade-never-crash | `tyche-architecture-contract` |
| Symptom→fix triage for a live failure | `tyche-debugging-playbook` |

This skill owns the *proof method*. The formulas being proven, the test plumbing, and the
historical narrative live in the siblings above — cross-reference, don't duplicate.

---

## Method 1 — Golden determinism test (prove an analytics function correct)

Tyche's analytics layer (`packages/analytics`) is **pure**: no clock, no network, no I/O, one
dependency (`@tyche/contracts`). That purity is *why* it is provable — same input always gives the
same output. (The purity design rule and its enforcement live in `tyche-architecture-contract`.)
Exploit it: feed an input you can solve on paper, assert the exact answer.

### The recipe

1. **Build a fixed synthetic input whose answer you can hand-derive.** Use the tiny candle helper
   the tests already use — a flat OHLC bar at one close:
   ```ts
   const c = (t: string, close: number): Candle =>
     ({ t: `${t}T00:00:00.000Z`, o: close, h: close, l: close, c: close });
   ```
2. **Choose the input so the math is trivial to check by hand.** e.g. an asset that moves *exactly*
   2× the benchmark → beta must be 2, correlation must be 1, alpha must be 0.
3. **Assert the exact numbers with `toBeCloseTo(x, 6)`.** Six decimals: tight enough that a wrong
   formula fails, loose enough to absorb float noise.
4. **Add the degenerate-input NULL assertions as first-class cases** — flat series → `null`, empty →
   empty/zero stats, EPS ≤ 0 → P/E `null`. A degenerate input must render `—` in the UI, which
   means the function must return `null`, **never a fabricated `0`**.
5. **Co-locate the test** as `X.test.ts` beside `X.ts`. Run just that file:
   ```bash
   npx vitest run packages/analytics/src/<name>.test.ts
   ```

### Worked example — `marketSensitivity` (beta)

Real test: `packages/analytics/src/marketBeta.test.ts:8-22`. Benchmark returns are
`[+0.10, −0.05, +0.02]`; the asset's closes are built so its returns are *exactly* twice the
benchmark's. Hand-derivation: if `r_asset = 2·r_bench` with zero noise, then slope β = 2, Pearson
correlation = 1, R² = 1, intercept α = 0, up/down capture = 2. The test asserts precisely that:

```ts
expect(s.beta).toBeCloseTo(2, 6);
expect(s.correlation).toBeCloseTo(1, 6);
expect(s.rSquared).toBeCloseTo(1, 6);
expect(s.alpha).toBeCloseTo(0, 6);   // return = 2×benchmark exactly → zero alpha
expect(s.upCapture).toBeCloseTo(2, 6);
```

The degenerate half (`marketBeta.test.ts:34-57`): a **flat benchmark** (zero variance) → `beta`,
`correlation`, `upCapture` all `toBeNull()` — "never a fabricated 0-beta"; a **flat asset** → same;
**empty** input → `observations: 0`, `beta: null`. The implementation earns those nulls at
`marketBeta.ts:104-105`: `if (n < 2 || stddev(rb) === 0 || stddev(rs) === 0) return base;` where
`base` has every stat pre-set to `null`.

### Worked example — `valuationHistory` (P/E, P/S, bands)

Real test: `packages/analytics/src/valuationHistory.test.ts:32-64`. Two annual statements
(EPS 6 on a $150 fiscal-date close; EPS 5 on $100) give hand-checkable multiples:

```ts
expect(p24.pe).toBeCloseTo(25, 6);          // 150 / 6
expect(p24.ps).toBeCloseTo(12.5, 6);        // 150 / (1200/100)
expect(v.peBand).toEqual({ min: 20, avg: 22.5, max: 25 });
```

Degenerate case (`:57-64`): a loss year (`eps: -2`) → `p.pe` is `null` ("never negative"), while
`p.ps` stays defined, and `peBand.avg` is `null` (no valid P/E to average). The guard lives at
`valuationHistory.ts:59-60`: `posRatio(a, b)` returns `null` when `b <= 0` — **P/E is null on
EPS ≤ 0, never a negative or fabricated multiple.**

### The three degenerate archetypes (assert all that apply)

| Archetype | Expected output | Example guard |
|---|---|---|
| Empty series `[]` | empty/zero stats, `firstDate: null` | `performance.ts` `if (n === 0) return emptyStats(...)`; `seasonality` → 12 null months |
| Flat / zero-variance series | whole bundle `null` | `marketBeta.ts:104-105` |
| Non-positive denominator (EPS ≤ 0, div by 0) | that ratio `null` | `valuationHistory.ts:59-60` `posRatio` |
| All-or-nothing forensic score (missing line item) | score `null`, `complete: false` | `scoring.ts:74-76` (Altman), `:250-251` (Beneish) |
| Unknown enum/code | echo the code, `known: false` | `eightK.ts:131-132` `Item ${code}` |

**The invariant these prove:** *never fabricate on degenerate input.* If your function can return a
number where the data doesn't support one, that is the bug — write the null test that catches it.

> Formulas (Altman weights, Beneish 8 indices + M-constant −4.84, Piotroski 9 signals, up/down
> capture): see `financial-terminal-reference`. This skill only shows how to *prove* an
> implementation of them.

---

## Method 2 — Mislabel-detection (prove an adapter maps the right concept)

An adapter turns an upstream vendor datum (an SEC XBRL tag, a Binance field) into a named contract
line item. The failure mode is subtle: the mapping *runs*, the number *looks plausible*, but the
field name claims a concept the datum doesn't actually mean. Tyche's hardest-won rule:

> **Never silently mislabel a datum.** A field named `sharesOutstanding` must BE shares
> outstanding — not a near-miss that happens to be the same order of magnitude.

### The recipe

For every output field your adapter produces, run this three-line check:

1. **Name the exact upstream concept** the vendor tag encodes (read the vendor's definition, not the
   tag's spelling). e.g. XBRL `CommonStockSharesIssued` = shares *issued* = outstanding **+ treasury
   stock held back**.
2. **Name the contract concept** the output field claims (`sharesOutstanding` = shares *currently
   held by investors*).
3. **Confirm they are the SAME concept, not a near-miss.** If issued ≠ outstanding whenever treasury
   stock > 0, the mapping is wrong even though both are "share counts". Pick the tag that means
   exactly the claimed concept, or leave the field `null`.

If a near-miss is the only source available: **do not ship it under the honest name.** Drop the
field, or add a disclosed-simplification comment naming the residual difference (see LVGI below).

### Worked example — shares outstanding is NOT shares issued

`packages/data-adapters/src/stubs/SecEdgarProvider.ts:967-969` (a *real* adapter despite the
`stubs/` folder name):

```ts
// Only the truly-outstanding concept — never fall back to CommonStockSharesIssued,
// which includes treasury stock and would be mislabeled as "Shares outstanding".
const sharesOutstanding = series(['CommonStockSharesOutstanding'], 'shares');
```

The near-miss (`CommonStockSharesIssued`) was **dropped from the fallback list**, not used, because
issued = outstanding + treasury. Using it would inflate the count and silently corrupt every
per-share figure (EPS, P/E, P/S, book value/share) downstream.

### Worked example — LVGI must be totalLiabilities/totalAssets (no double-count)

`packages/analytics/src/scoring.ts:225-228`, Beneish M-Score leverage index:

```ts
// LVGI: total liabilities ÷ total assets — a clean, double-count-free proxy for Beneish's
// (current liabilities + long-term debt) numerator (the mapped totalDebt already includes the
// current portion that currentLiabilities also carries, so adding them would double-count it).
const lvgi = ratio(ratio(tlT, taT), ratio(tlP, taP));
```

The near-miss here is **arithmetic, not naming**: Beneish's LVGI numerator is
`currentLiabilities + longTermDebt`. But Tyche's mapped `totalDebt` already includes the *current
portion of long-term debt*, which `currentLiabilities` also contains — so `totalDebt +
currentLiabilities` double-counts that slice. The fix: use `totalLiabilities / totalAssets`, an
equivalent leverage measure with no overlap, and *disclose the simplification in a comment* so the
next reader knows it is a deliberate proxy, not a bug.

### Mislabel-detection checklist (run per output field)

- [ ] I read the vendor's *definition* of the source tag, not just its name.
- [ ] The output field name states exactly the concept the datum encodes (no near-miss).
- [ ] Composite fields (sums/ratios) do not double-count an overlapping component.
- [ ] Any accepted approximation carries a comment naming the residual difference.
- [ ] There is a test or fixture asserting the mapped value for a known input.

> The catalogue of Tyche's known upstream traps (SEC fiscal-frame quirks, treasury stock, current
> portion of LT debt) lives in `financial-terminal-reference`; the *stories* of when each was caught
> live in `tyche-failure-archaeology`.

---

## Method 3 — Adversarial self-review (run before EVERY push)

This is the project's signature ritual: 19 commits in history reference an "adversarial" review
pass. The method is not "read your diff again" — it is **enumerate the claims your diff makes, then
actively try to refute each one against the real files.** A claim that survives refutation ships; a
claim that fails gets fixed **with a regression test**, never silently.

### The recipe

1. **List every CLAIM your diff makes.** A claim is any promise the code implies. Cover these lenses:

   | Lens | The claim to refute |
   |---|---|
   | Correctness | "This number equals the formula for all inputs, including degenerate ones." |
   | Security | "No timing oracle, no enumeration, fails closed, leaks no internals." |
   | Contract shape | "Response is `{data, provenance}` / `{error:{kind,message}, provenance?}` with the right HTTP code." |
   | Provenance label | "Every number carries accurate provenance; the freshness tier is truthful." |
   | Isolation | "No cross-tenant / global-key leak; keys namespaced by user id." |
   | Doc accuracy | "COMMANDS.md / CHANGELOG / counts match the code I just changed." |

2. **For each claim, construct the input or state that would make it FALSE**, then check the real
   file. Examples of refutation attempts that have found real bugs here:
   - *Correctness:* "What does this return on an empty / flat series?" → forced the null-bundle guard.
   - *Security (timing):* "Does an unknown email take a different code path / time than a known one?"
     → password-reset enumeration oracle (`74c7005`).
   - *Isolation:* "Is this cache/audit key global? Two users, same key — do they collide?" →
     workspace-mirror cross-account load, `/api/audit` cross-tenant leak (`6ebe6ef`).
   - *Routing:* "Does this batch call assume one provider serves the whole list?" → mixed-universe
     watchlist bug (`6ebe6ef`).
   - *Provenance:* "Could this route return a real number with a `mock`/`local` provenance, or a gap
     with no provenance?" → capability-gap must still carry provenance.

3. **Verdict per claim:**
   - Survives refutation (you tried and could not break it against the real code) → **ships**.
   - Fails → **fix it, and add a regression test that fails on the old code** (Method 4).

4. **Only then run the full gate** (see `tyche-build-and-env` for the canonical command):
   ```bash
   pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
   ```

### Worked example — the alerts hardening pass (`dc8d8f2`, `TKT-013`)

The feature claimed "an alert fires once when its condition becomes true." Adversarial refutation
asked: *"Two SSE connections evaluate the same rule on the same tick — can both fire it?"* Against
the real code, yes — a read-then-write with an `await` between was a lost-update / double-fire
window. Fixed with a **compare-and-set** `markAlertTriggered` (synchronous active-check + flip
*before* the await) and a regression test. The mechanics of that CAS live in `tyche-failure-
archaeology`; the *method* is what matters here: the claim was refuted by naming a concrete
concurrent state, not by re-reading the diff.

### What this is NOT

- Not a lint pass. Lint proves style; adversarial review proves *claims*.
- Not optional. Every merged slice in this repo got one. A diff without a refuted claim list is not
  ready to push.
- Not a substitute for change-control. If your diff changes schema/config/deploy behavior, the
  review happens *inside* the `tyche-change-control` workflow, not around it.

---

## Method 4 — Prove-the-fix (reproduce → patch → red-before/green-after)

Culture note: this repo **fixes forward — it has never used `git revert`.** A fix is only proven
when a test that FAILS on the broken code PASSES on the fixed code. "I think this fixes it" is not
a fix.

### The recipe

1. **Reproduce.** Write a test (or a `fastify.inject` route test for API bugs) that reproduces the
   bug with a concrete input. Run it and **watch it fail** — that red is your proof the bug is real
   and the test actually exercises it.
   ```bash
   npx vitest run <path-to-new-or-changed-test-file>
   ```
2. **Patch** the source.
3. **Re-run the same test and watch it pass** — green. Red-before/green-after is the whole proof.
4. **Keep the regression test.** It is the guard that the bug never returns. Name it after the
   symptom ("returns null stats for a flat benchmark, never a fabricated 0-beta").
5. **Run the full gate** before push (Method 3, step 4).

### Why red-before matters

A regression test that was written *after* the fix and never observed to fail is worthless — it may
pass for the wrong reason and never actually cover the bug. The discipline is: **see it red, then
see it green.** If you cannot make the test fail on the old code, you have not reproduced the bug.

### Applies to analytics AND to routes

- Analytics: co-located `X.test.ts`, `npx vitest run packages/analytics/src/X.test.ts`.
- API routes: `fastify.inject` against the shared app in `apps/api/src/app.test.ts`
  (`buildApp({config:{dataDir, providers:['mock']}})` → `app.inject({method,url,payload})` → assert
  `res.statusCode` + `res.json()`). No network — mock provider + a temp data dir. Test-layer details
  (fixtures, the shared-app pattern, e2e/Playwright) live in `tyche-validation-and-qa`.

---

## The one-line summary of the whole skill

> Success is always **measurable**: a passing golden, an earned `null`, a refuted claim, a green
> gate. It is **never** "looks right". If you cannot point at something that went from red to green
> (or would go red if the code were wrong), you have not proved anything yet.

---

## Provenance & maintenance

All facts verified read-only against the repo on **2026-07-19** (HEAD on branch
`claude/financial-terminal-foundation-49spvm`). Volatile facts below are date-stamped with a
re-verification command. Counts in this repo are known to drift from prose docs — **always recount,
never trust a stale figure** (this discipline is itself documented at `docs/BUILD_MANUAL.md:1383`).

| Fact (as of 2026-07-19) | Re-verify with |
|---|---|
| `marketBeta.test.ts` golden asserts beta≈2/corr≈1/α≈0 at lines 8-22 | `sed -n '8,22p' packages/analytics/src/marketBeta.test.ts` |
| Flat/empty null cases at `marketBeta.test.ts:34-57` | `sed -n '34,57p' packages/analytics/src/marketBeta.test.ts` |
| `valuationHistory.test.ts` P/E≈25 golden + EPS≤0 null at lines 32-64 | `sed -n '32,64p' packages/analytics/src/valuationHistory.test.ts` |
| P/E null guard `posRatio` at `valuationHistory.ts:59-60` | `sed -n '59,60p' packages/analytics/src/valuationHistory.ts` |
| Beta null-bundle guard at `marketBeta.ts:104-105` | `sed -n '104,105p' packages/analytics/src/marketBeta.ts` |
| Altman all-or-null at `scoring.ts:74-76`; Beneish at `:250-251` | `sed -n '74,76p;250,251p' packages/analytics/src/scoring.ts` |
| 8-K unknown-code echo at `eightK.ts:131-132` | `sed -n '131,132p' packages/analytics/src/eightK.ts` |
| Shares-issued mislabel guard at `SecEdgarProvider.ts:967-969` | `sed -n '967,969p' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| LVGI double-count comment at `scoring.ts:225-228` | `sed -n '225,228p' packages/analytics/src/scoring.ts` |
| 19 commits reference an "adversarial" review | `git log -i --grep=adversarial --oneline \| wc -l` |
| Repo has never used `git revert` | `git log -i --grep=revert --oneline \| wc -l` (expect 0) |
| Analytics barrel = 22 `export *` modules (pure, one dep `@tyche/contracts`) | `grep -c 'export \* from' packages/analytics/src/index.ts` |
| Full local gate command | `grep -n 'typecheck && ' CONTRIBUTING.md docs/BUILD_MANUAL.md` |
| Single-file test run works via `npx vitest run <path>` | `npx vitest run packages/analytics/src/marketBeta.test.ts` |
| Capability-key/object sync test at `schemas.test.ts:56` | `sed -n '56,59p' packages/contracts/src/schemas.test.ts` |
| vitest pinned `^2.1.8` (resolved 2.1.9 at verify time) | `grep vitest package.json` |

Cross-referenced siblings (facts owned elsewhere — do not restate their detail here):
`financial-terminal-reference` (domain formulas + upstream-trap catalogue), `tyche-validation-and-qa`
(test-layer mechanics), `tyche-failure-archaeology` (settled bug narratives), `tyche-change-control`
(any behavior-changing workflow), `tyche-architecture-contract` (analytics-purity design rule,
degrade-never-crash contract), `tyche-build-and-env` (the gate command + toolchain versions).
