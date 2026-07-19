---
name: tyche-research-methodology
description: >-
  The epistemics of turning a hunch into an accepted change in Tyche — the EVIDENCE BAR, the
  predict-then-measure habit, the idea lifecycle, and the analytics-vs-new-adapter shippability
  decision. Load this when you are about to propose or defend a change and need to know what
  counts as PROOF here, not how to run the loop. Trigger phrases/situations: "I have a hypothesis
  / a hunch / an idea for a feature", "is this good enough to ship?", "how do I prove this is
  correct?", "the number looks wrong but I'm not sure", "should I build a new data adapter or do
  this with analytics?", "what should I build next?", "where do good ideas come from here", "my
  fix passed the test, are we done?", "the reviewer found a counterexample", "one case still
  doesn't fit my explanation", "should I revert this?", "is this a dead end?", deciding between
  a deterministic analytics feature and a live real-data adapter you cannot test from this
  environment, or writing a change up as archaeology instead of shipping it. NOT for the
  change-control loop mechanics or Definition of Done (use tyche-change-control), proof RECIPES
  and commands (use tyche-proof-and-analysis-toolkit), the list of open problems (use
  tyche-research-frontier), or the settled history of past bugs (use tyche-failure-archaeology).
---

# Tyche Research Methodology — the discipline of proof

This skill owns the **epistemics**: what counts as evidence in Tyche, how you convert a hunch
into a change that survives, and the one shippability judgment unique to this environment
(deterministic analytics vs. a live adapter you cannot verify from here). It does **not** own the
mechanics of landing the change — that is `tyche-change-control`.

Read this before you argue "this is correct" or "this is ready." A wrong belief that ships is more
expensive here than a slow one that doesn't: this project has **0 `git revert` commits in 230**
(verified below). You cannot undo a mistake cleanly — you fix it forward, in public, with a test.
So the bar to *believe* something is high on purpose.

> **Jargon, defined once.**
> - **Slice** — one small, single-concern change shipped as one PR.
> - **Adversarial review / refutation** — a deliberate pass that tries to BREAK your own change
>   (multiple lenses/agents), not confirm it. The dominant ritual here.
> - **Degenerate / negative case** — an input where the honest answer is "no answer": empty data,
>   a flat series, zero/negative earnings, a missing line item. The output must be `null`/`—`, never
>   a fabricated number.
> - **Golden test** — a test with a hand-computed expected value written BEFORE the code is trusted.
> - **Analytics-over-verified-data** — a feature computed by `@tyche/analytics` from data an
>   *existing* capability already fetched; deterministic, no new network path.
> - **Provenance** — the `{provider, mode, capability, freshness, retrievedAt, …}` stamp on every
>   datum. "A number without provenance is a bug" (product invariant #3).

---

## When NOT to use this skill — route to the sibling instead

| Your actual need | Correct skill |
|---|---|
| The change-control LOOP, the Definition of Done checklist, commit trailers, how a slice merges | `tyche-change-control` |
| The 5 product invariants (rationale + enforcement) | `tyche-change-control` |
| Copy-pasteable PROOF recipes (golden test, determinism check, mislabel detection, how to run an adversarial review) | `tyche-proof-and-analysis-toolkit` |
| The list of OPEN problems + first steps + falsifiable milestones | `tyche-research-frontier` |
| The settled chronicle of what broke before and why | `tyche-failure-archaeology` |
| A specific financial FORMULA or a known mislabel trap (Altman, Piotroski, Beneish, beta, BSM) | `financial-terminal-reference` |
| The executable add-a-vertical / add-an-adapter step list | `tyche-vertical-slice-campaign` |
| The dependency spine, capability-gap model, degrade-never-crash contract | `tyche-architecture-contract` |
| Positioning, differentiators, non-goals, pricing | `tyche-external-positioning` |

This skill answers only: *what is proof, what is ready, and where do good ideas come from.*

---

## Part 1 — The Evidence Bar

A change is *believed* only when **one mechanism explains ALL the observations at once** — the
happy path AND every degenerate/negative case — AND that mechanism has survived a deliberate
attempt to refute it. Two half-explanations are not an explanation.

### Rule 1a — One mechanism must cover the negative cases too

The tell of a real explanation here is that it predicts the *boring* outcomes: the empties, the
flats, the zeros. Analytics code is written this way on purpose — the degenerate case is a
first-class result, not an afterthought:

- `packages/analytics/src/marketBeta.ts:104-105` — "degenerate input must render '—', never a
  fabricated 0": `if (n < 2 || stddev(rb) === 0 || stddev(rs) === 0) return base;` where `base`
  has every stat `null`. A beta of exactly 0 from a flat series is a *bug disguised as data*.
- `packages/analytics/src/scoring.ts:75,251` — Altman/Beneish are all-or-null: the score is
  `complete ? round2(sum) : null`. A partial checklist is never inflated to a full score.
- P/E is `null` when EPS ≤ 0 (`valuationHistory.ts` `posRatio`, denom ≤ 0), never a negative
  multiple; an unknown 8-K item code echoes `Item {code}`, never an invented label.

**Test of your explanation:** state what your mechanism predicts for the empty input, the flat
input, the zero-denominator input. If your explanation only accounts for the case that first
caught your eye, it is a *hunch*, not a mechanism. Keep digging until one story covers all of them.

### Rule 1b — Survive adversarial refutation before it ships

This is the load-bearing ritual of the project. Every non-trivial slice gets a pass that tries to
break it; findings are confirmed by refutation (not by vote-to-confirm), and each confirmed defect
is fixed **with a regression test in the same class of change**.

Verified signal (commands in Provenance):
- **19 commits reference "adversarial" review; 17 reference "harden"** — roughly one hardening
  pass per feature area.
- `6ebe6ef` body states the method verbatim: *"A multi-agent adversarial review (find -> 3-vote
  refutation) surfaced these confirmed defects; each is fixed with a regression test."*
- `74c7005` ("harden password reset"): *"4-lens review, 19 confirmed findings, 2 HIGH."*
- `dc8d8f2` ("harden TKT-013 from adversarial review (19 findings)").

**Recurring defect classes the adversarial pass keeps catching** (so pre-empt them in your own
review — full chronicle in `tyche-failure-archaeology`):

| Class | One-line trap |
|---|---|
| Timing oracle | account-conditional work on the response path leaks which emails exist (`74c7005`) |
| TOCTOU / lost-update | check-then-write across an `await`; two writers race (`dc8d8f2`, `6ebe6ef`) |
| Isolation leak | a global key / non-admin route exposes another tenant's data (`6ebe6ef`) |
| Spoofable proxy header | `trustProxy:true` lets a client rotate XFF to dodge the rate limiter (`5c357ea`) |
| Provider routing over mixed universes | one batch call for a mixed watchlist 502s the equities (`6ebe6ef`) |
| Real-vendor frame quirk | SEC frames fiscal-year-end by *calendar* quarter → empty AAPL/MSFT balance sheets (`d63f764`) |
| Signed-vs-gross math | portfolio weights on net exposure blank a balanced long/short book |
| **Mislabel** | using the wrong datum under the right name (treasury-inclusive share count; LVGI double-counting LT debt) |

The last one has its own commandment, repeated across commit bodies: **never silently mislabel a
datum.** If you are not certain the field means what you are about to call it, that is a defect at
the evidence bar even if the number "looks right."

### Rule 1c — The bar is one mechanism, adversarially tested, that predicts the negatives

Checklist before you claim a change is *correct*:

```
[ ] One mechanism explains the happy path AND every degenerate/negative case.
[ ] I stated what it predicts for empty / flat / zero-denominator inputs — and that matches.
[ ] I ran an adversarial pass that TRIED to break it (not confirm it).
[ ] Each thing the pass found is either fixed-with-a-test or written down as a known limit.
[ ] No datum is labeled as something I cannot prove it is (no silent mislabel).
[ ] Every number it produces carries provenance.
```

---

## Part 2 — Predict the number BEFORE you run it

The habit that separates evidence from coincidence: **write down the value you expect, then
measure.** A test that only asserts "it didn't throw" proves nothing; a test that asserts a
hand-computed number proves the mechanism.

This is how the analytics layer is verified — **158 `toBeCloseTo` assertions across the analytics
tests** (verified below), each a pre-committed expected value:

- `marketBeta.test.ts` feeds an asset that moves *exactly 2×* the benchmark and asserts
  `beta ≈ 2, correlation ≈ 1, rSquared ≈ 1, alpha ≈ 0, upCapture ≈ 2` — you can compute those by
  hand, so the test catches any drift.
- `valuationHistory.test.ts` asserts `pe ≈ 25 (= 150/6)`, `ps ≈ 12.5`, `peBand = {min:20, avg:22.5,
  max:25}` — arithmetic you did on paper first.

**Predict-then-measure procedure:**

1. Before writing/running, state the expected output for a *known* input — ideally one you can
   compute by hand (a doubling series, a fixed price/earnings pair).
2. State the expected output for at least one degenerate input (empty → all `null`; flat → `null`,
   not `0`).
3. Write the assertion with the pre-computed value (`toBeCloseTo(x, 6)` for floats).
4. *Then* run it. If it passes on the first try with a number you didn't pre-compute, you have not
   yet proven anything — pre-compute it.

If your prediction and the measurement disagree, **do not "fix" the test to match the code** until
you know which one is wrong. The disagreement is the discovery. (This is exactly how the SEC
fiscal-frame bug `d63f764` was found: the expected balance sheet was non-empty; the measured one
was empty; the *code* was wrong, not the expectation.)

Determinism is a precondition for predict-then-measure, and it is enforced structurally in
analytics: `Date.now(` and `Math.random(` appear **0 times** in `packages/analytics/src`; the only
`new Date(...)` calls parse timestamps *from the data*, never the wall clock. If your computation
reads the clock or a RNG, you cannot predict its number — pull that non-determinism out first.

---

## Part 3 — The idea lifecycle (epistemics; mechanics live in tyche-change-control)

A hunch has exactly two honest endings here. There is no third "we tried it and quietly rolled it
back" ending — **the project has never used `git revert` (0 of 230 commits).**

```
                     ┌─────────────────────────────────────────────┐
   hunch  ───────►   │  frame it as ONE gated slice (single concern) │
                     └───────────────────┬─────────────────────────┘
                                         │
                       predict-then-measure + adversarial self-review
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                                 ▼
   (A) it survives the evidence bar               (B) it fails the evidence bar
        │                                               │
        ▼                                               ▼
   MERGE with a regression test                    FIX FORWARD or DOCUMENT as a
   in the same PR                                   dead-end (archaeology / open
                                                    question) — never revert
```

### Ending A — it survives: merge as one slice + a regression test

The unit of change is **one concern per slice**, and the regression test ships *in the same PR* as
the fix. Every hardening commit above pairs each finding with its test. The two mandatory
extension points (`commands.ts`, `components.ts`) and the e2e smoke spec are the highest-churn
files precisely because "add the feature" and "add the test that pins it" happen together. The
loop that lands the slice (branch, gate, DoD, trailers) is owned by `tyche-change-control` — follow
it there.

### Ending B — it fails: fix forward, or write it up as a dead-end

You never `git revert`. Two sub-endings:

- **Fix forward.** A later commit *corrects* the earlier one, in the open. Canonical example:
  `6ebe6ef` (a hardening pass) added `clearMirror()` on a failed workspace save; that raced page
  navigation and *lost users' layouts*. The remedy was **not** a revert — `ab560f4`
  (*"don't roll back the optimistic workspace mirror on a failed save"*) removed the harmful
  behavior forward and re-derived the real fix: cross-account safety comes from **namespacing the
  key by user id, not from clearing.** One mechanism (namespacing) replaced a wrong one (clearing);
  both are visible in history.
- **Document the dead-end.** If a direction doesn't pan out, it becomes a written record, not a
  silent deletion. The project deletes almost nothing — **exactly 1 file has ever been deleted**
  (`PriceChart.tsx`, a planned supersede, not a failure) — and leaves **0 `// TODO`/`FIXME`/`HACK`
  in `.ts`/`.tsx` source** (verified). Debt is not a code comment; it is either fixed forward or
  recorded as a prose open-question in docs. The one live example is
  `docs/BUILD_MANUAL.md:1382` (the bearer-token `===`-vs-`timingSafeEqual` question) — an honest
  open decision, written down, not hidden in a TODO. Settled dead-ends live in
  `tyche-failure-archaeology`; unresolved ones live in `tyche-research-frontier`.

**Corollary — a passing test is not the finish line.** "My fix is green" only means Ending A's
*first* gate cleared. The change is not believed until it has also been through the adversarial
pass (Part 1b) and carries its own regression test.

---

## Part 4 — The shippability decision unique to this environment

You will constantly face this fork: **compute it from data we already have (analytics), or reach
for a new live data source (adapter)?** In *this* environment the answer is weighted, because the
live upstream of a real adapter **cannot be exercised from here** — you can prove an adapter's
*shape*, but not its *live behavior*.

### The decision, stated

> **Prefer analytics-over-existing-verified-data (deterministic, provable) over a new real adapter
> whose LIVE path cannot be confirmed from this environment.** A new adapter may still ship — but
> only behind conformance + mock parity, with its real path explicitly LABELED as unverified-from-here.

Why this is legitimate and not a cop-out: an analytics-only feature is **fully provable** here. It
adds no capability, no route, no apiClient — it reuses data an existing capability already fetched
and is verified by a co-located golden test (predict-then-measure, Part 2). Structural proof it is
self-contained: `@tyche/analytics`'s only runtime dependency is `@tyche/contracts` (verified). This
is why recent work deliberately pivoted to forensic analytics over free SEC data
(Altman/Piotroski/Beneish, valuation multiples) — it is a *differentiator you can actually prove
from here*, not merely assert.

### Decision table

| | Analytics-over-verified-data | New real adapter |
|---|---|---|
| New capability key / route / apiClient? | **No** — reuses existing data | Yes — full vertical |
| Provable from THIS environment? | **Yes, deterministically** (golden test) | Shape only; live behavior **not** confirmable here |
| How it's verified | co-located `X.test.ts`, hand-computed values, degenerate-null cases | `checkProviderConformance` (envelope safeParse) + **mock parity** |
| Real path status when merged | n/a | **must be labeled** "real path unverified from this env" |
| Preferred when both would work? | **Yes** | Only when the data genuinely cannot be derived |

### If you do ship a new adapter, the non-negotiables

Even preferred-against, an adapter can be correct to ship (some data simply isn't derivable). It
then MUST clear the same structural bar every existing adapter cleared — details and the exact step
list are in `tyche-vertical-slice-campaign` and `tyche-architecture-contract`; the *epistemic*
requirements are:

```
[ ] Conformance-gated: every declared capability passes checkProviderConformance
    (method call + envelope(Schema).safeParse). A non-conformant provider is quarantined.
[ ] Mock parity: a deterministic mock implementation ships in the SAME PR (invariant #4 —
    a fresh clone with zero keys must run the whole terminal). This is the part you CAN prove here.
[ ] Degrade-never-crash: a missing capability is an HTTP-200 gap with provenance, never a 500.
[ ] Real path LABELED: because you cannot exercise the live upstream from here, say so — in the
    PR body and any provenance/notes — rather than claiming live behavior you did not observe.
    (This is predict-then-measure honesty: you predicted the shape; you did not measure the feed.)
```

The one thing you must never do to make an adapter "shippable" is soften an invariant: no bundled
or resold data, no advice, provenance on everything. Those are owned by `tyche-change-control`.

---

## Part 5 — Where good ideas historically came from

Two well-worn sources. Mine these before inventing from scratch.

### Source A — the clean-room competitive research pass (ADR-0004)

Ideas here are *earned from public evidence*, not guessed. `docs/adr/0004-public-competitor-
research-clean-room-roadmap.md` (Status: Accepted, 2026-06-28) records a **public, source-backed
research pass** on the closest public benchmark (Gödel Terminal), translated into an **original**
roadmap — *category* benchmarking only, never copied UI/data/naming (invariant #5, clean-room).
Its charter, verbatim: *"To replace guesswork with evidence."* The dossier is `docs/research/godel/`.

Use this when asked "what should we build?": look at the *documented category* a public benchmark
covers, then design an *original* Tyche answer that plays to the wedge (self-host, mock-by-default,
provenance-everywhere, BYO-data, open SDK, no-advice). What you may NOT do is reproduce a
proprietary product's UI, copy, API, or trade dress. If a research idea needs the live web and the
environment blocks egress, that is recorded too (`docs/research/godel/RESEARCH_BLOCKED.md`) — an
honest "couldn't verify," not a fabricated finding.

### Source B — churn hotspots as pain signals

Files touched over and over are telling you where the friction — and therefore the next good
idea — lives. Extension-point churn hotspots from `git log --name-only | sort | uniq -c | sort -rn`
(a curated view, not a strict top-N — CHANGELOG.md/COMMANDS.md/app.test.ts also rank high):

| Touches | File | What the churn signals |
|---|---|---|
| 64 | `tests/e2e/smoke.spec.ts` | every command adds an assertion — the e2e surface is the product's spine |
| 47 | `packages/terminal-kernel/src/commands.ts` | the command registry — mandatory extension point #1 |
| 43 | `apps/web/src/modules/components.ts` | the web module registry — mandatory extension point #2 |
| 22 | `packages/data-adapters/src/MockProvider.ts` | mock parity is touched on nearly every data feature |
| 19 | `packages/analytics/src/index.ts` | the analytics barrel — where the recent differentiator work lands |

Read this two ways: (1) a hotspot is where *effort concentrates*, so a well-placed improvement
there pays off broadly; (2) a hotspot is a *fragility signal* — if the same file keeps getting
hardened, the abstraction underneath may be asking for a better shape. (Recount before citing; see
Provenance.)

---

## Provenance & maintenance

Date-stamp: **2026-07-19**. Re-verify volatile facts with the paired command (read-only). Evidence
priority when sources disagree: **deployed/CI > executable code > ops docs > architecture docs >
README/roadmap.** Known doc drift: docs say "24 capabilities / 41 commands"; the CODE has 28 / 60.
Trust the code and recount.

| Fact (as of 2026-07-19) | Re-verify (read-only) |
|---|---|
| **19** commits reference "adversarial" review | `git log -i --grep='adversarial' --oneline \| wc -l` |
| **17** commits reference "harden" | `git log -i --grep='harden' --oneline \| wc -l` |
| **0** `git revert` commits | `git log -i --grep='revert' --oneline \| wc -l` |
| **230** commits total on the dev branch | `git rev-list --count HEAD` |
| **1** file ever deleted (`PriceChart.tsx`, a planned supersede) | `git log --diff-filter=D --summary \| grep -c delete` |
| **0** `TODO`/`FIXME`/`HACK` in `.ts`/`.tsx` source | `grep -rEn "TODO\|FIXME\|HACK" packages apps --include="*.ts" --include="*.tsx" \| grep -v node_modules \| grep -v .test.` |
| `6ebe6ef` body = "find -> 3-vote refutation … each is fixed with a regression test" | `git show -s --format='%b' 6ebe6ef \| head -3` |
| `74c7005` = "4-lens review, 19 confirmed findings, 2 HIGH" | `git show -s --format='%b' 74c7005 \| grep -i lens` |
| `d63f764` = SEC fiscal-frame fix (empty AAPL/MSFT balance sheets) | `git log --oneline \| grep d63f764` |
| `ab560f4` = fix-forward that removed the harmful mirror rollback | `git log --oneline \| grep ab560f4` |
| **158** `toBeCloseTo` assertions in analytics tests | `grep -rn "toBeCloseTo" packages/analytics/src --include="*.test.ts" \| wc -l` |
| analytics runtime dep = **only** `@tyche/contracts` | `node -e "console.log(require('./packages/analytics/package.json').dependencies)"` |
| `Date.now(`/`Math.random(` = **0** in analytics src (determinism) | `grep -rEn "Date\.now\(\|Math\.random\(" packages/analytics/src --include="*.ts" \| grep -v .test.` |
| marketBeta null-on-degenerate guard | `grep -n "never a fabricated 0\|stddev(rb) === 0" packages/analytics/src/marketBeta.ts` |
| scoring all-or-null (Altman/Beneish `complete ? … : null`) | `grep -n "complete ?" packages/analytics/src/scoring.ts` |
| **28** capability keys (drift: docs say 24) | `node -e "const s=require('fs').readFileSync('packages/contracts/src/provider.ts','utf8');const m=s.match(/PROVIDER_CAPABILITY_KEYS\s*=\s*\[([^\]]*)\]/s);console.log((m[1].match(/'[a-zA-Z]+'/g)).length)"` |
| **60** commands in DEFAULT_COMMANDS (drift: docs say 41) | `node -e "const s=require('fs').readFileSync('packages/terminal-kernel/src/commands.ts','utf8');const b=s.match(/DEFAULT_COMMANDS[^=]*=\s*\[([\s\S]*)\];/);console.log((b[1].match(/\bcmd\(/g)).length)"` |
| ADR-0004 "replace guesswork with evidence" (Status: Accepted) | `sed -n '1,20p' docs/adr/0004-public-competitor-research-clean-room-roadmap.md` |
| Churn top files (smoke.spec 64, commands.ts 47, components.ts 43) | `git log --format= --name-only \| sort \| uniq -c \| sort -rn \| head` |
| The canonical gate command | `grep -n "pnpm typecheck && pnpm test && pnpm build" CONTRIBUTING.md docs/BUILD_MANUAL.md` |
| Definition of Done location (owned by tyche-change-control) | `grep -n "Definition of Done" docs/BUILD_MANUAL.md` (→ line 1331) |

**Sibling cross-references used above (do not re-derive their facts here):**
`tyche-change-control` (loop, DoD, 5 invariants, commit trailers) · `tyche-proof-and-analysis-toolkit`
(proof recipes/commands) · `tyche-research-frontier` (open problems) · `tyche-failure-archaeology`
(settled chronicle) · `financial-terminal-reference` (formulas, mislabel traps) ·
`tyche-vertical-slice-campaign` (add-a-vertical/adapter steps) · `tyche-architecture-contract`
(spine, capability-gap, degrade-never-crash) · `tyche-external-positioning` (wedge/non-goals).
