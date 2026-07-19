---
name: tyche-docs-and-writing
description: >-
  Maintain Tyche's docs of record and house style, and fix the known doc drift.
  Load this when you are about to edit README.md, ARCHITECTURE.md,
  docs/BUILD_MANUAL.md, COMMANDS.md, DATA_PROVIDERS.md, MODULE_SDK.md,
  SECURITY.md, CHANGELOG.md, ROADMAP.md, or docs/adr/; when a code change needs
  a matching doc/CHANGELOG/ADR update in the SAME PR; when the manual and the
  code disagree and you must decide which wins; when you need to know which doc
  OWNS a fact; when you write a CHANGELOG entry, cut a release note, or author an
  ADR; when a doc quotes a count (capabilities, commands, tests) and you suspect
  it drifted; or when you hit stale claims like "24 capabilities", "41 commands",
  "adapters ship disabled", or version 0.3.0 vs 0.1.0. Triggers: "update the
  docs", "which doc owns this", "add a changelog entry", "write an ADR",
  "the manual is out of date", "recount", "doc drift", "is this count right".
  NOT for the commit/trailer convention or cutting a tagged release (that is
  tyche-change-control); NOT for running the recount script itself
  (tyche-diagnostics-and-tooling).
---

# Tyche docs & house style

You maintain the **docs of record** — the files a future engineer trusts instead
of the departing expert. The prime directive of this repo's documentation:

> **When the manual and the code disagree, the code is truth. Fix the manual in
> the SAME PR that changes the code.**
> — `docs/BUILD_MANUAL.md:5-6` (repeated in the manual footer, line 1614)

Docs here are not decoration. They are load-bearing: `BUILD_MANUAL.md` is the
canonical handbook new engineers execute from, `COMMANDS.md` is the command
reference, `DATA_PROVIDERS.md` is the entitlement contract. A wrong doc sends a
junior or a Sonnet-class model down a wrong path — that is worse than a missing
doc. Treat every number and path you write as a claim you must verify.

Everything in Tyche is verifiable from source. Never write a count, path, flag,
or version into a doc from memory — open the file or run the recount first.

---

## 1. The doc set — who owns what

Edit the doc whose **ownership** matches the fact. Do not restate a fact in a
second doc; link to the owner. Root files are at `/home/user/Tyche/`.

| Doc | Owns (the fact that lives HERE) | Do NOT put here |
|---|---|---|
| `README.md` | First-contact pitch: what Tyche is, the "not financial advice" + clean-room blockquote, quickstart, what's real & free. | Deep architecture, per-command detail, config internals. |
| `ARCHITECTURE.md` | The monorepo spine — 8 workspace members, dependency rules, kernel/provider/module design at a system level. | Step-by-step how-to (that is BUILD_MANUAL), env vars. |
| `docs/BUILD_MANUAL.md` | **Canonical handbook.** The 5 invariants (verbatim §0, lines 16–33), conventions, security posture bar, Definition of Done (line 1331), the sequenced backlog, open questions. The one doc that says "code is truth." | Nothing is off-limits, but keep counts recount-able (see §5). |
| `COMMANDS.md` | The command reference — grammar, yellow keys, every command + example. Mirrors `DEFAULT_COMMANDS`. | Provider/capability internals. |
| `DATA_PROVIDERS.md` | The provider/capability model, the adapter roster, BYO-key/entitlement story, "adding a provider" recipe. | AI, auth, billing. |
| `MODULE_SDK.md` | The module contract (`ModuleDefinition`, `ModulePanelProps`), the 2-step "adding a module" recipe. | Kernel parser internals. |
| `SECURITY.md` | Security bar, auth/hosted model, entitlements & data-licensing responsibility, audit events, secrets policy, vuln reporting. | Feature docs. |
| `CHANGELOG.md` | User-visible change history (see §3). | Design rationale (that is an ADR). |
| `ROADMAP.md` | Done vs next, milestones, the hard **non-goals** list. | Anything shipped-and-stable (that graduates to the other docs). |
| `docs/adr/` | One **Architecture Decision Record** per irreversible design decision (see §4). | Transient status. |
| `CONTRIBUTING.md` | "How to add things", the local gate command, release-cutting steps. | (Owned jointly with change-control — see below.) |

Also present, narrower scope: `docs/BILLING.md`, `docs/LAUNCH.md`,
`docs/PLUGINS.md`, `docs/research/` (clean-room competitor dossiers), `marketing/`.
For positioning/marketing copy, see **tyche-external-positioning**.

**Jargon, defined once:**
- **Doc of record** — the single doc that OWNS a fact; other docs link to it, never re-state it.
- **ADR** — Architecture Decision Record; a short numbered file capturing a decision + its rationale so nobody re-litigates it.
- **Drift** — a doc figure (a count, version, adapter status) that was true when written but the code moved on. Tyche has known drift; §5 is your worklist.
- **Recount** — deriving a drift-prone number from source instead of trusting the doc.

---

## 2. The CARDINAL RULE — code is truth, fix the manual in the same PR

`docs/BUILD_MANUAL.md:5-6` and its footer (`:1614`) both state it. Operate it
like this:

1. **You changed behavior a doc describes?** The doc edit ships in the **same
   PR**, not a follow-up. The Definition of Done encodes this:
   `.env.example + docs (+ CHANGELOG/ADR) updated` is a checkbox on every slice
   (`BUILD_MANUAL.md:1331` DoD; owned in full by **tyche-change-control**).
2. **A doc contradicts the code and you are NOT changing that code?** The code
   wins. Either fix the doc in your PR (preferred, if it is in scope) or, if it
   is a bigger stale area, log it as a drift target (§5) — never "fix" the code
   to match a stale doc.
3. **Evidence order when sources conflict** (highest wins):
   deployed/CI config > executable code > ops docs (BUILD_MANUAL/SECURITY) >
   architecture docs > README/ROADMAP. A README sentence never overrides
   `provider.ts`.

The manual is honest about its own weakness: its "State of the Project" chapter
(around `BUILD_MANUAL.md:1410-1417`) is itself STALE (it says 45/41 commands,
24 capabilities, "Five real adapters"). Even the canonical handbook drifts —
which is exactly why you recount (§5) instead of trusting any prose figure.

---

## 3. CHANGELOG discipline

`CHANGELOG.md` header (lines 3–4): *"Format loosely follows Keep a Changelog;
versions are milestones, not npm releases (the workspace is private)."* So it is
**Keep-a-Changelog-loose**, not strict.

Structure (verified `grep "^## " CHANGELOG.md`):
```
## Unreleased                              (line 6)
## 0.3.0 — 2026-07-02 · "The parity release"   (line 493)
## 0.2.0 — 2026-07-01 · "The SaaS release"     (line 552)
## 0.1.0 — foundation                          (line 592)
```

Rules for a normal PR (every user-visible change touches this file — it is one
of the top-churn files in the repo):

- **Prepend under `## Unreleased`.** Newest bullets go at the top of the
  Unreleased section. Use bold-led bullets that name the command/capability and
  its rationale, matching the existing house voice (e.g.
  `- **`PORT` risk panel** — a **Risk** toggle …`).
- **Group with `###` subsections** when a batch has a theme (the current
  Unreleased block is `### Analytics depth — Phase 1`).
- **Leave the placeholder after a cut.** Convention is to leave `_Nothing yet._`
  under `## Unreleased` immediately after a release is cut. (Right now Unreleased
  is populated because a phase is in flight — that is expected mid-cycle.)
- **Cut-release heading format:** `## X.Y.Z — YYYY-MM-DD · "name"`.
- **It is surfaced in-app.** The `CHANGELOG` command (aliases `CHANGES`,
  `WHATSNEW`; title *"What's new"*; `moduleId: 'changelog'`;
  `packages/terminal-kernel/src/commands.ts:59`) renders release history inside
  the terminal. Sloppy CHANGELOG prose ships to users — write it like copy.

**Commit SUBJECTS are Conventional Commits** (`type(scope): subject`) — but the
full commit/trailer convention and the mechanics of **cutting a tagged release**
(move Unreleased → dated heading, bump `package.json`, tag, `release.yml`) are
owned by **tyche-change-control**. Do not re-derive them here.

---

## 4. ADR authoring

An ADR records a decision a future contributor would otherwise waste time
reverse-engineering (or worse, silently reverse). Existing ADRs
(`docs/adr/`, all `Status: Accepted`, dated `2026-06-28`):

| ID | Title |
|----|-------|
| 0001 | Clean-room terminal foundation |
| 0002 | Provider capability model |
| 0003 | Command registry and module SDK |
| 0004 | Public competitor research & clean-room roadmap |

**When to add one:** a design choice with lasting consequences that is not
obvious from the code — a new pluggable-driver boundary, a data-modeling
decision, a security tradeoff, a clean-room boundary. If a future engineer might
"fix" it by undoing it, it needs an ADR. (Note: DoD requires *"architectural
choice → new ADR"* — `BUILD_MANUAL.md` shipping-rhythm section.)

**File + header format** (copy an existing ADR; verified `docs/adr/0001…:1-4`):
```
# NNNN — Short title

- Status: Accepted        # Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context
Why this decision was needed.

## Decision
What we chose.

## Consequences
What this makes easy / hard / off-limits.
```
- Filename: `NNNN-kebab-title.md`, next number in sequence (0005 next).
- Never delete or edit a decided ADR's meaning; supersede it with a new ADR and
  set the old one's Status to `Superseded by ADR-XXXX`. (History culture: this
  repo fixes forward and never reverts — same spirit for ADRs.)

---

## 5. The DRIFT REGISTER + RECOUNT DISCIPLINE

The manual documents the discipline at **`docs/BUILD_MANUAL.md:1383`**:

> counts drift as slices land; a builder should recount
> (`vitest run` / `playwright list` / `DEFAULT_COMMANDS`) rather than trust the
> doc figure.

**Rule: never trust a count in prose. Recount from source before you cite it,
and pair any count you write with its re-verification command.**

The recount **script** lives in **tyche-diagnostics-and-tooling**
(`.claude/skills/tyche-diagnostics-and-tooling/scripts/recount.sh`) — run it,
don't re-implement it. It prints, from source of truth:
`PROVIDER_CAPABILITY_KEYS`, `DEFAULT_COMMANDS`, `moduleComponents`, vitest test
files, e2e specs — plus a sanity check that commands == modules.

### Current known drift (your maintenance worklist)

Verified against the repo on 2026-07-19. These are **drift to fix**, labeled so
you do not propagate them. Trust the CODE column.

| Doc claims | Code truth (verified) | Where the stale claim is | Re-verify |
|---|---|---|---|
| "24 typed capabilities" | **28** keys | `README:114`; `BUILD_MANUAL:345,1410`; ADR-0002; `DATA_PROVIDERS.md` | `bash .claude/skills/tyche-diagnostics-and-tooling/scripts/recount.sh` (PROVIDER_CAPABILITY_KEYS) |
| "41 stable commands" (also "45", "40+", "50+") | **60** commands | `README`; `BUILD_MANUAL:1417`; marketing | same script (DEFAULT_COMMANDS) |
| Mock "declares 22 of 24" | **26 of 28** (all EXCEPT `bonds`, `portfolio`) | `BUILD_MANUAL:1410` | read `MOCK_CAPABILITIES` in `packages/data-adapters/src/MockProvider.ts` (`grep -c ': true' → 26`) |
| "adapters ship disabled" (`Yahoo/SecEdgar/Fred/Ccxt`) | **8 real adapters** shipped; only `yahoo`/`ccxt` are no-op stubs | `SECURITY.md:25` (STALE) | read the adapter list in `DATA_PROVIDERS.md` + `packages/data-adapters/src/` |
| root version `0.3.0` | 8 members still `0.1.0`; `Dockerfile:29` ARG default `0.1.0` | version skew | `grep '"version"' package.json packages/*/package.json apps/*/package.json` |
| "520+ tests / 35 e2e" | not asserted; recount (currently 97 `.test.ts` files, 1 e2e spec) | `README`; `BUILD_MANUAL` | recount script (vitest / e2e rows) — do NOT hard-code |

**How to recount each figure by hand** (if the script is unavailable):

```bash
# capabilities (28): quoted entries in the as-const tuple
awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next} /\] as const;/{f=0} f' \
  packages/contracts/src/provider.ts | grep -cE "^\s*'"

# commands (60): one cmd({ per registered command
grep -c '^  cmd({' packages/terminal-kernel/src/commands.ts

# web modules (60, must equal commands): lazy() entries
grep -cE "^\s+'?[a-zA-Z0-9-]+'?: lazy\(" apps/web/src/modules/components.ts

# versions (skew): root vs members
grep '"version"' package.json packages/*/package.json apps/*/package.json
```

**When you write a count into a doc**, immediately follow the doctrine: either
omit the raw number in favor of "see `DEFAULT_COMMANDS`", or write it with the
recount command beside it so the next reader can re-verify. Do not add a naked
number that will silently rot.

### Fixing a drift item (checklist)

1. Recount the true value from source (above).
2. Edit the stale doc line(s) to match — and search for the SAME number
   elsewhere (`grep -rn "24 " docs README.md`), because these counts appear in
   multiple docs.
3. If the number is inherently drift-prone, replace it with a pointer to the
   source of truth rather than a fresh hard-coded number.
4. Land the fix in a PR whose subject follows Conventional Commits
   (`docs: correct capability count 24→28`) — commit/trailer mechanics via
   **tyche-change-control**. A pure-docs change still runs the local gate.

---

## 6. House style checklist

- Imperative, concrete, verifiable. Every path, flag, count is copy-checkable.
- Never invent a number — recount (§5).
- Prefer tables/checklists over prose for anything a reader will act on.
- Match existing voice: bold-led bullets in CHANGELOG; `NNNN — Title` ADRs.
- Docs move WITH code, same PR (§2). No "I'll doc it later."
- Do not leave `// TODO`/`FIXME`/`HACK` in `.ts`/`.tsx` — this repo has zero in
  source; open questions go as prose in `BUILD_MANUAL.md` "Open questions", not
  as code markers.
- Clean-room: never copy a proprietary product's naming, UI, or docs into any
  Tyche doc (invariant #5; ADR-0001/0004).

---

## 7. When NOT to use this skill — go here instead

| Your task | Correct skill |
|---|---|
| The commit subject/body/trailer convention, or cutting a tagged release | **tyche-change-control** |
| Actually running the recount / conformance / wiring-audit scripts | **tyche-diagnostics-and-tooling** |
| The dependency spine, capability-gap model, degrade-never-crash contract (as design facts, not doc text) | **tyche-architecture-contract** |
| Domain formulas / financial definitions the docs describe | **financial-terminal-reference** |
| Env vars, flags, adapter keyless/BYO-key roster (the values, not the doc) | **tyche-config-and-flags** |
| Marketing/positioning copy, non-goals framing, pricing | **tyche-external-positioning** |
| Test layers, adding a test, e2e idioms | **tyche-validation-and-qa** |
| The gate command, toolchain versions, no-build-step | **tyche-build-and-env** |

Any workflow that changes system behavior (schema/config/deploy/promoting an
experiment) routes through **tyche-change-control** — never around it. This skill
covers only the DOCS about those things.

---

## Provenance & maintenance

Volatile facts are date-stamped `2026-07-19` and paired with a one-line
re-verification command. Re-verify before relying on any of them.

| Fact (as of 2026-07-19) | Value | Re-verify |
|---|---|---|
| Cardinal rule "code is truth, fix manual same PR" | `docs/BUILD_MANUAL.md:5-6`, footer `:1614` | `sed -n '5,6p;1614p' docs/BUILD_MANUAL.md` |
| Recount discipline location | `docs/BUILD_MANUAL.md:1383` | `grep -n "recount" docs/BUILD_MANUAL.md` |
| Capabilities count | **28** | `bash .claude/skills/tyche-diagnostics-and-tooling/scripts/recount.sh` |
| Commands count | **60** (== 60 web modules) | recount.sh |
| Mock capabilities | **26 of 28** (all EXCEPT `bonds`, `portfolio`) | read `MOCK_CAPABILITIES`, `packages/data-adapters/src/MockProvider.ts` (`grep -c ': true' → 26`) |
| Real adapters shipped | **8** (+ `yahoo`,`ccxt` no-op stubs) | adapter list in `DATA_PROVIDERS.md`; `ls packages/data-adapters/src/{,stubs/}*Provider.ts` |
| Version skew | root `0.3.0`; 8 members + Dockerfile ARG `0.1.0` | `grep '"version"' package.json packages/*/package.json apps/*/package.json; grep -n VERSION Dockerfile` |
| SECURITY.md "ship disabled" is STALE | `SECURITY.md:25` | `sed -n '25p' SECURITY.md` |
| CHANGELOG headings | Unreleased/0.3.0/0.2.0/0.1.0 | `grep -n "^## " CHANGELOG.md` |
| CHANGELOG in-app command | `CHANGELOG` / "What's new" / `moduleId: changelog` | `sed -n '59,68p' packages/terminal-kernel/src/commands.ts` |
| ADRs | 0001–0004, all `Status: Accepted`, `docs/adr/` | `ls docs/adr/; grep -n "Status:" docs/adr/*.md` |
| Doc set (root) | README, ARCHITECTURE, COMMANDS, DATA_PROVIDERS, MODULE_SDK, SECURITY, CHANGELOG, ROADMAP, CONTRIBUTING | `ls *.md docs/*.md docs/adr/` |

Sibling cross-references (verify names against
`ls /home/user/Tyche/.claude/skills/`): tyche-change-control,
tyche-diagnostics-and-tooling, tyche-architecture-contract,
financial-terminal-reference, tyche-config-and-flags,
tyche-external-positioning, tyche-validation-and-qa, tyche-build-and-env.
