---
name: tyche-change-control
description: >
  The spine of how any behavior change ships in Tyche — classify, gate, review, commit, and release.
  Load this BEFORE you write or ship a change and whenever you are about to: run the local gate, write a
  commit message, add commit trailers, configure git author identity, open a PR, decide if a change needs
  an ADR, cut a release / bump the version / tag, touch the CHANGELOG's Unreleased section, or ask "is this
  change allowed?" Also load it when you hit these phrases/symptoms: "how do I ship this", "what's the
  Definition of Done", "one concern per PR", "adversarial self-review", "sync with origin/main",
  "ff-only merge", "Conventional Commits", "Co-Authored-By Claude", "Claude-Session trailer",
  "commits show Unverified", "can I revert this", "add a TODO", "the five invariants", "no advice / no
  orders", "never resell data", "provenance on everything", "mock mode must work", "clean-room". ANY
  workflow that changes system behavior (schema, config, deploy, promoting an experiment) routes THROUGH
  this skill. NOT for the mechanics of the gate command itself (that is tyche-build-and-env), test layers
  (tyche-validation-and-qa), CHANGELOG prose rules (tyche-docs-and-writing), or the settled bug history
  (tyche-failure-archaeology).
---

# Tyche Change Control

This is the **process spine**. Every change to Tyche's behavior — a new command, a schema field, a config
flag, a deploy, promoting an experiment to a real feature — passes through the loop, gates, and rules
below. Read this first; then dive into the sibling skill for the layer you are touching.

**Jargon, defined once:**
- **Slice** — one small, self-contained concern shipped as one PR. Not two features. Not "and while I was
  there…".
- **The gate** — the four local checks that must pass before a PR: typecheck, test, build, e2e.
- **Envelope** — every data payload crossing a boundary is `{ data, provenance }` (or `{ error, provenance? }`).
- **Capability** — a named data ability (e.g. `quotes`, `fundamentals`) a provider declares; modules request
  a capability, never a specific provider.
- **Provenance** — the attribution stamp on every datum: provider, mode, freshness, retrievedAt, license…
- **ADR** — Architecture Decision Record, a numbered markdown file in `docs/adr/` recording a decision.
- **Adversarial self-review** — a distinct second read of your own diff that hunts for the failure you did
  not test, not the read that wrote the code.

---

## When to use — and when NOT to

**Use this skill when** you are about to change behavior and need to know: is it allowed, how is it gated,
how do I commit it, does it need an ADR, how do I cut a release.

**Route elsewhere — do NOT re-derive here:**

| You actually need… | Go to sibling |
|---|---|
| The exact gate command + toolchain versions + why libraries have no build step | **tyche-build-and-env** |
| Which test layer to add, how to write `fastify.inject` / conformance / e2e tests | **tyche-validation-and-qa** |
| CHANGELOG prose rules, Keep-a-Changelog format, the doc-drift register | **tyche-docs-and-writing** |
| The settled chronicle of past bugs (what happened, why) | **tyche-failure-archaeology** |
| Symptom → fix triage for a failing thing right now | **tyche-debugging-playbook** |
| The dependency spine, capability-gap model, degrade-never-crash contract | **tyche-architecture-contract** |
| Every env var + default + adapter roster | **tyche-config-and-flags** |
| The step-by-step executable recipe to add a data vertical or adapter | **tyche-vertical-slice-campaign** |
| Dev/deploy/hosted operation, persistence, backup/restore | **tyche-run-and-operate** |

This skill owns the **rules and rhythm**. The siblings own the **mechanics**.

---

## 0. The five product invariants — the top non-negotiables

Source of truth: `docs/BUILD_MANUAL.md:16-33`. **Any change that violates one is wrong, no matter how useful
it looks.** These are the identity of the product; restating them verbatim is expected, re-deriving or
"improving" them is not. Each has a *rationale* — know it, because that is what tells you whether an edge
case violates the invariant.

### 1. Research-only
> No buy/sell/hold advice, no order placement, no order routing. The AI copilot declines personalized
> advice; the portfolio is read-only tracking.

**Rationale.** Tyche is a *research* terminal, not a broker. Giving advice or placing orders pulls it into
regulated broker-dealer / investment-adviser territory a solo operator cannot lawfully occupy. Enforced in
code: `apps/api/src/ai/copilot.ts` (`ADVICE_PATTERN` regex + `NO_ADVICE_DISCLAIMER` attached to **every**
copilot response), tested in `copilot.test.ts` and `app.test.ts`. No broker/order/routing module exists
anywhere — verify by absence.
**A change violates it if** it adds a "should I buy?" answer, an order button, a brokerage link, or drops
the disclaimer.

### 2. Never bundle or resell market data
> Live sources connect under the OPERATOR'S licenses — keyless public sources (Binance, ECB/Frankfurter,
> Dexscreener) or the operator's own free credentials (SEC EDGAR User-Agent, FRED key). No paid feed is
> ever shipped, marked up, or proxied.

**Rationale.** Market data is almost always licensed; redistributing it is the liability a solo dev would
violate. Tyche's whole wedge is "sells software + hosting, never data." Enforced: real adapters gate on the
*operator's* credentials in `providerRegistry.ts`; BYO-key values (Finnhub, FRED) are sent only as request
params and **never** appear in provenance.
**A change violates it if** it ships a paid feed's data, proxies a licensed source, or bakes a vendor key
into the product.

### 3. Provenance on everything
> Every provider response is an `Envelope<T> = { data, provenance }`; provenance renders in panel footers
> and rides into CSV exports as comment headers. **A number without provenance is a bug.**

**Rationale.** Trust is the product. A datum you cannot attribute is worthless in research and dangerous in
export. Enforced: `packages/contracts/src/provenance.ts` (the `Envelope` type), the conformance suite
(`conformance.ts` safeParses `envelope(Schema)`), and route helpers (`serveCapability`/`gapProvenance` stamp
even gaps and errors).
**A change violates it if** a new provider method returns raw data instead of `Envelope<T>`, or an export
drops the provenance header.

### 4. Mock mode always works
> A fresh clone with zero keys must run the ENTIRE terminal on the deterministic mock provider. Every new
> capability ships with a mock implementation **in the same PR**.

**Rationale.** Contributors (human and AI) and evaluators must run the whole product with no accounts, no
keys, no network. The mock provider is deterministic and seeded; it is always registered as the fallback
(`createProviderRegistry` always appends `MockProvider` last).
**A change violates it if** a feature only works with a real key, or a new capability lands without its mock
implementation in the same PR.

### 5. Clean-room
> Benchmark against publicly documented market-terminal feature *categories* only. Never copy any
> proprietary product's UI, data, naming, or docs.

**Rationale.** Tyche is a lawful original competitor. Copying trade dress, UI, or proprietary APIs is legal
risk. Recorded in ADR-0001 and ADR-0004. Benchmark *categories* (what a feature does), never a specific
product's implementation.
**A change violates it if** it reproduces a proprietary terminal's layout, naming, copy, or undocumented API.

> These reappear as blocking per-PR checks in `BUILD_MANUAL.md` Appendix A and in the Definition of Done
> below. If a slice touches one, say so explicitly in the PR body and prove it still holds.

---

## 1. The operating loop — follow it every time

Source: `docs/BUILD_MANUAL.md:44-52`. This is how work ships here, every time, no exceptions.

```
1. SYNC          git fetch origin main
                 git merge --ff-only origin/main
2. SCOPE         one small slice — one concern, one PR. Write/adjust tests WITH the change.
3. GATE          run the full local gate (typecheck 8/8 → test → build → e2e when UI).
4. SELF-REVIEW   adversarial self-review of your own diff (see §5).
5. COMMIT        Conventional Commits subject + what/why body + verification note + trailers (see §3).
6. PR            push, open a DRAFT PR describing what + why, let CI confirm.
7. CI            wait for the `verify` + `e2e` check-runs green.
8. MERGE         merge to main (`Merge pull request #NNN`, no squash).
9. RE-SYNC       sync again; update any docs your change made stale (this manual included).
```

**Why `--ff-only`.** `git merge --ff-only origin/main` refuses to create a merge commit — if your branch has
diverged it fails loudly instead of silently entangling history. History here is linear-forward by design.

> The exact gate command and what each step means lives in **tyche-build-and-env**. Do not restate it; run it.
> One-line reminder: `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.

**One concern per PR** is load-bearing, not aspiration. The two mandatory extension points
(`packages/terminal-kernel/src/commands.ts` and `apps/web/src/modules/components.ts`) plus the single e2e
spec and `CHANGELOG.md` are touched by nearly every feature — keeping slices small is what keeps those files
reviewable.

---

## 2. Git author identity — keep commits Verified

Before committing, set the author identity for this repo so commits attribute to Claude and stay Verified:

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
```

Confirmed against history: feature commits are authored by `Claude <noreply@anthropic.com>` (run
`git log -1 --format='%an <%ae>'` on the dev branch). Merge commits show the human maintainer as author.

---

## 3. Commit message convention — exact

Every feature/fix commit has three parts: a Conventional Commits subject, a what+why body ending in a
verification note, and two verbatim trailers.

**Subject** — `type(scope): subject`, imperative, lowercase after the colon.
- Types seen in history: `feat` (dominant), `fix`, `docs`, `test`, `release`, `perf`, `ci`, `chore`.
- Scopes are terminal-domain tags: `analytics`, `edgar`, `equities`, `chart`, `insd`, `fts`, `web`, `api`,
  `auth`, `data`, `dcf`, `alerts`, etc.

**Body** — long prose explaining *what* changed and *why*, ending with a **verification note** that states
how you proved it (e.g. "Unit + e2e tested", "verified: save-restore test 5x + full suite 44/44").

**Trailers** — a blank line, then these two lines **verbatim** (copy exactly, do not alter the display name
or the URL):

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QrzKSMMQgHPcHQzFp1w5Xo
```

Full example (real commit shape):

```
feat(analytics): add trailing valuation-multiple history to GP

Compute trailing P/E and P/S per annual fiscal year from existing
fundamentals + historicalPrices, with percentile bands. Returns null
when earnings were zero or negative — never a fabricated or negative
multiple.

Reuses the existing keyless fundamentals + historicalPrices capabilities
with no new capability, route, or API client. Unit + e2e tested.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QrzKSMMQgHPcHQzFp1w5Xo
```

Merge commits carry **no** trailers: subject `Merge pull request #NNN from …`, feature subject as body.
Squash merge is **not** used — the feature commit and the merge commit both appear in history.

---

## 4. The Definition of Done — the gate checklist

Source of truth: `docs/BUILD_MANUAL.md:1331` (recount the checkboxes — **12** at the date below). A slice is
done **only when ALL hold**. Copy this into the PR and tick it:

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

**Warning: no lint enforces the invariants.** There is no ESLint rule that a route returns `{data}/{error}`
or that a provider method returns `Envelope<T>`. These are held only by the conformance suite, review, and
this checklist (`BUILD_MANUAL.md:1384`). A weaker model *can* silently regress them — so the DoD is not
ceremony, it is the enforcement.

---

## 5. Adversarial self-review — the signature ritual

The dominant change-control ritual here. After a feature works and the gate is green, do a **distinct**
second pass over your own diff whose only job is to find the failure you did not test. This is not the read
that wrote the code.

Method:
1. Enumerate every claim your diff makes — security, contract, provenance, docs.
2. Try to **refute each** against the real files.
3. Every confirmed finding is fixed **with a regression test**, not just patched.

History shows this pass has repeatedly caught real defects across recurring classes: timing oracles,
TOCTOU / lost-update on concurrent writes, cross-tenant / global-key isolation leaks, spoofable
`X-Forwarded-For` voiding rate limits, provider-routing over mixed symbol universes, real-vendor data-frame
quirks (SEC fiscal frames), signed-vs-gross financial math, and analytics hidden behind a live-feed
dependency. The one rule that unifies them: **never silently mislabel a datum.**

> The full settled chronicle of these bugs — what happened and why — lives in **tyche-failure-archaeology**.
> Do not re-derive it here; this skill only tells you the review pass is mandatory and how to run it.

---

## 6. ADRs — when a decision needs a record

ADRs live in `docs/adr/` as `NNNN-title.md`. There are **4**, all **Status: Accepted**:

| ID | Title | Core decision |
|----|-------|---------------|
| 0001 | Clean-room terminal foundation | Build an original, lawful competitor — no copied UI/assets/APIs. |
| 0002 | Provider capability model | Modules request a *capability*, not a provider; degrade, never crash. |
| 0003 | Command registry & module SDK | Pure, unit-testable parser → execute → effects; two cooperating registries. |
| 0004 | Public competitor research & clean-room roadmap | Public source-backed benchmark → original roadmap; clean-room boundaries held. |

**Add a new ADR when** you make a decision a future contributor would otherwise have to reverse-engineer
(CONTRIBUTING.md:103) — a significant architectural choice, a new invariant, a change to how a subsystem is
structured. Copy the shape of an existing ADR (context → decision → status → consequences), number it next
in sequence, set `Status: Accepted`, and land it in the **same PR** as the change it describes. The DoD line
"architectural choice → new ADR" is the trigger.

Do **not** write an ADR for a routine feature that follows existing patterns — those are just slices.

---

## 7. Cutting a release

Source: `CONTRIBUTING.md:35-43`. Releases are milestone tags, not npm publishes (the workspace is private).

```
1. In CHANGELOG.md: move the `Unreleased` bullets under a new heading
      ## X.Y.Z — YYYY-MM-DD · "name"
   and leave `_Nothing yet._` under `## Unreleased`.
2. Bump `version` in the root package.json.
3. Merge to main, then tag the MERGE commit:
      git tag vX.Y.Z && git push origin vX.Y.Z
```

The `Release` workflow (`.github/workflows/release.yml`, triggered on `v*` tags) then:
- re-runs the gate (`gate` job — typecheck/test/build; note: **no e2e** in the release gate),
- extracts the matching `## X.Y.Z` section from `CHANGELOG.md` as release notes,
- **fails loudly if the CHANGELOG has no section for the tag** (the workflow errors: "No CHANGELOG section
  found for $version — add '## $version — …' before tagging."),
- creates the GitHub Release and publishes the self-host image to `ghcr.io/<owner>/tyche:vX.Y.Z` + `:latest`.

Current state: root `package.json` is `0.3.0`; the only tag is `v0.3.0`. CHANGELOG headings today:
`Unreleased` / `0.3.0 "The parity release"` / `0.2.0 "The SaaS release"` / `0.1.0 foundation`.

> The prose rules for *what* goes in a CHANGELOG bullet (Keep-a-Changelog style, one bullet per
> command/capability with rationale) live in **tyche-docs-and-writing**. This skill owns only the release
> *mechanics*.

---

## 8. Culture — two hard rules

**No reverts, ever. Fix forward.** `git revert` has never been used in this history. Mistakes are corrected
with a `fix(...)` commit that lands the fix **with a regression test**, not by reverting. If a merged change
is wrong, ship a forward fix — do not `git revert`. (The codebase has deleted exactly one file in its whole
history, a planned supersede; it *extends*, it does not tear down.)

**No `// TODO` / `FIXME` / `HACK` / `XXX` in `.ts` / `.tsx` source.** There are zero of these markers in
source code. Debt is either fixed forward now or recorded as a prose open-question in a doc (the one live
example is `docs/BUILD_MANUAL.md:1382`, the bearer-token `===`-vs-`timingSafeEqual` question). Adding a
`// TODO` to code violates the observed norm — either do the work or write the open question in the doc.

---

## Provenance and maintenance

Written **2026-07-19** against dev branch `claude/financial-terminal-foundation-49spvm`
(`origin/main` = `0ac92ee`). Re-verify volatile facts before relying on them:

| Fact (as of 2026-07-19) | Re-verify with |
|---|---|
| Five product invariants at `BUILD_MANUAL.md:16-33` | `sed -n '16,33p' docs/BUILD_MANUAL.md` |
| Definition of Done at `BUILD_MANUAL.md:1331`, **12** checkboxes | `grep -n "Definition of Done" docs/BUILD_MANUAL.md`; `sed -n '1333,1355p' docs/BUILD_MANUAL.md \| grep -c '^\[ \]'` |
| Operating loop at `BUILD_MANUAL.md:44-52` | `sed -n '44,52p' docs/BUILD_MANUAL.md` |
| Commit trailers verbatim (2 lines) | `git log -1 --format='%B' origin/claude/financial-terminal-foundation-49spvm \| tail -4` |
| Author identity `Claude <noreply@anthropic.com>` on feature commits | `git log -1 --format='%an <%ae>'` |
| Gate command | `sed -n '32p' CONTRIBUTING.md` (owned by tyche-build-and-env) |
| ADRs: **4**, all `Status: Accepted` | `ls docs/adr/`; `grep -ri status docs/adr/*.md` |
| Release fails loudly without a CHANGELOG section | `grep -n "No CHANGELOG section found" .github/workflows/release.yml` |
| Root version `0.3.0`; only tag `v0.3.0` | `node -p "require('./package.json').version"`; `git tag` |
| CHANGELOG headings | `grep -n "^## " CHANGELOG.md` |
| Zero `// TODO`/`FIXME`/`HACK` in source | `grep -rEn "TODO\|FIXME\|HACK\|XXX" --include=*.ts --include=*.tsx packages apps` (only `'XXXX'` MIC placeholders, no real markers) |
| No `git revert` in history | `git log -i --grep="revert" --oneline` (empty) |
| Capability count = **28** keys (docs may say 24 — trust code) | `grep -A40 "PROVIDER_CAPABILITY_KEYS = \[" packages/contracts/src/provider.ts \| grep -c "  '"` |
| Command count = **60** (docs may say 41 — trust code) | `grep -c "^  cmd(" packages/terminal-kernel/src/commands.ts` |

**Known doc drift** (trust the code, pair any count with a recount): docs cite "24 capabilities" and "41
stable commands"; the code has 28 capability keys and 60 commands. The DoD block is called "13-gate" in some
handoff notes but contains **12** checkboxes — recount rather than trust the label. Test-count figures
("520+", "35 e2e") drift and are unverified here.
