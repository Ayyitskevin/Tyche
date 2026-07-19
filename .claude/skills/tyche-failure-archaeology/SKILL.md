---
name: tyche-failure-archaeology
description: >-
  The settled chronicle of Tyche bugs already fought and fixed, and dead-ends already ruled out — so
  no one re-fights a battle that is over. Load this BEFORE you "discover" what looks like a new bug, or
  when you are tempted to re-add a reverted behavior, re-open a closed design question, or build a data
  vertical someone already investigated. Trigger phrases/situations: "why was this done this way",
  "should we add timingSafeEqual / constant-time compare here", "the alert fired twice / double-fired",
  "concurrent writes / lost update / TOCTOU", "one tenant can see another's data", "stored XSS in notes /
  markdown links", "X-Forwarded-For / rate limit is being bypassed", "AAPL/MSFT balance sheet is empty",
  "SEC fundamentals returns nothing", "portfolio weights are all blank / wrong for a long-short book",
  "shares outstanding looks too high", "the Beneish/LVGI number is off", "should we roll back the
  workspace mirror on a failed save", "let's add 13D/13G activist stakes / FINRA short interest /
  filing-triggered alerts", "why is there no git revert", "why was PriceChart deleted". If you want the
  LIVE symptom→fix triage for an ACTIVE incident, use tyche-debugging-playbook instead; this skill is the
  history, not the ambulance.
---

# tyche-failure-archaeology

**The chronicle so no one re-fights a settled battle.** Each entry is written as
**SYMPTOM → ROOT CAUSE → EVIDENCE (commit/file) → STATUS**. When something looks broken, or a "new" idea
feels obvious, check here first: the odds are high it was already fought, fixed, and locked with a
regression test — or already investigated and deliberately *not* built.

This skill is **read-only history**. It does not change system behavior and does not authorize you to.
Any actual change (schema, config, deploy, promoting an experiment) MUST route through
**tyche-change-control** — never around it.

---

## When to use this skill

- You found a bug and want to know if it is a *known, already-fixed class* before you "fix" it again.
- You are about to add a defensive behavior (constant-time compare, cache rollback, retry) and want to
  know whether it was tried and removed.
- You want the rationale behind a surprising piece of code (why `===` here but `timingSafeEqual` there;
  why the workspace mirror is *never* cleared on a failed save).
- You are proposing a new data vertical (13D/13G, short interest, filing alerts) and need to know the
  prior reasoning.

## When NOT to use this skill — route to the correct sibling instead

| If you actually need… | Use this sibling instead |
|---|---|
| LIVE triage of an ACTIVE incident (symptom → what to check → fix) | **tyche-debugging-playbook** |
| The change-control / adversarial-review *discipline itself* (how to review, gate, merge) | **tyche-change-control** |
| The financial FORMULAS + mislabel hazards in depth (Altman/Piotroski/Beneish/beta math, which SEC fact to use) | **financial-terminal-reference** |
| The degrade-never-crash capability-gap MODEL, dependency spine, analytics-purity design rule | **tyche-architecture-contract** |
| Every env var / flag / default | **tyche-config-and-flags** |
| Dev/deploy/hosted operation, persistence, backup/restore | **tyche-run-and-operate** |
| Test layers, how to add a regression test | **tyche-validation-and-qa** |
| Open problems + what to build next (the frontier) | **tyche-research-frontier** |

This skill owns only the **settled past**: what happened, why, where the proof is, and what is closed.
It does NOT restate the formulas, the model, or the live runbook — it points at the sibling that does.

---

## How to read an entry

```
SYMPTOM     what a user / test / operator observes
ROOT CAUSE  the real defect, not the surface
EVIDENCE    fix commit hash + the file the fix lives in (re-verify with `git show <hash>`)
STATUS      CLOSED (fixed + regression test) | SETTLED (a decision, do not reopen) |
            CANDIDATE/OPEN (investigated, deliberately not built — reasoning recorded)
```

Every commit hash below was verified to exist on the dev branch with `git show <hash>` on 2026-07-19.
To read the full body and diff of any entry: `git show <hash>`.

---

## Part 1 — Recurring bug CLASSES (each CLOSED with a fix commit)

These are the classes that bit Tyche more than once in spirit. Treat each as a **checklist item** when
you touch adjacent code — a new adapter, a new stored-data route, a new concurrent writer.

### 1.1 TIMING ORACLES — non-constant-time secret compares leak information

- **SYMPTOM:** Password-reset request latency (and a persist-failure 500-vs-200) differed for real vs
  non-existent accounts, so an attacker could enumerate which emails exist despite an always-200 body.
- **ROOT CAUSE:** Account-conditional work (`issueResetToken()` → a full `users.json` write for real
  accounts only) ran **on the response path**; and secret comparisons that branch on content are
  timing-observable.
- **FIX:** `74c7005` `fix(auth): harden password reset (adversarial review findings)` — move ALL
  account-conditional work off the response path, reply `200` first. Sibling secret compares use
  `node:crypto` `timingSafeEqual` (length-check then constant-time): see `apps/api/src/saas/users.ts`
  (lines ~186, 247, 291), `apps/api/src/saas/sessions.ts:34`, `apps/api/src/saas/billing.ts:68`,
  `apps/api/src/saas/invites.ts:132`.
- **STATUS: CLOSED.** For the general "which SEC fact / which formula" mislabel hazards, and the security
  bar wording, see **financial-terminal-reference** / **tyche-change-control**.
- **KNOWN, DELIBERATE INCONSISTENCY (do not "fix" without change-control):** the **self-host** bearer
  guard `apps/api/src/security/auth.ts:27` compares with plain `token === config.authToken`, NOT
  `timingSafeEqual`. This is a *documented open question*, not an oversight — `docs/BUILD_MANUAL.md:1382`
  asks whether it is an accepted tradeoff for the coarse foundation guard. **STATUS: OPEN.** If you want
  to change it, that is a change-control decision, not a drive-by patch.

### 1.2 TOCTOU / LOST-UPDATE on concurrent writes

- **SYMPTOM:** An alert fired twice; two concurrent connections both "won"; concurrent same-email signups
  created duplicate users; a single-use reset token could be redeemed twice.
- **ROOT CAUSE:** Check-then-act with an `await` in the gap. The state was read, an async op ran, then the
  write happened — two callers interleave and both pass the check.
- **FIX (alerts):** `dc8d8f2` `fix(alerts): harden TKT-013 from adversarial review (19 findings)` —
  **compare-and-set** `markAlertTriggered(id, firedAt, deactivate)` returns a boolean "I won"; fire only
  on `true`. Implemented in `apps/api/src/persistence/FilePersistence.ts:193` and
  `SqlitePersistence.ts:226` (synchronous atomic CAS). Regression: `persistence.test.ts:89-100`,
  `FilePersistence.test.ts:38-43` — second call returns `false`.
- **FIX (token / signup TOCTOU):** `74c7005` (claim the reset token **synchronously before any await**);
  `6ebe6ef` (`UserRegistry.create` reserves the email synchronously before the scrypt hash).
- **STATUS: CLOSED.** Rule: any "fire once" / "claim once" path must be a compare-and-set that the caller
  gates on, never a read-then-write across an await.

### 1.3 CROSS-TENANT / GLOBAL-KEY ISOLATION LEAKS + STORED XSS

- **SYMPTOM:** In hosted mode, one signed-in tenant could read `GET /api/audit` (the *global* audit trail
  — every account's emails + activity); on a shared browser, one account could load and re-save another's
  workspace; imported markdown notes with `javascript:`/`data:` hrefs executed as stored XSS.
- **ROOT CAUSE:** Global (non-namespaced) keys and missing scheme allow-listing. The `localStorage`
  workspace mirror used a **single global key**; `/api/audit` had no tenant/role gate; note link hrefs
  were rendered verbatim.
- **FIX:** `6ebe6ef` `fix: harden confirmed defects from adversarial review` — `/api/audit` is admin-only
  in hosted mode; markdown hrefs allow-listed to `http(s)`/`mailto` (unsafe schemes render as inert
  text); the workspace mirror is **namespaced by user id** (`apps/web/src/workspace/persistence.ts:24`,
  regression `persistence.test.ts:93`).
- **STATUS: CLOSED.** Rule: isolation comes from **namespacing the key by user id**, never from clearing a
  shared key (see the settled dead-end in Part 2.1 — the "clear it" reflex caused data loss).

### 1.4 SPOOFABLE X-FORWARDED-FOR voids rate limits

- **SYMPTOM:** In hosted mode, a client rotating the leftmost `X-Forwarded-For` value per request got a
  fresh rate-limiter bucket every time, voiding the sole brute-force control on auth.
- **ROOT CAUSE:** Fastify `trustProxy: true` trusts the *entire* XFF chain, so a client-supplied leftmost
  hop becomes the "client IP".
- **FIX:** `5c357ea` `fix(api): close the auth rate-limit X-Forwarded-For spoofing bypass (hosted)` —
  trust **exactly** `trustProxyHops` hops (`trustProxy: hosted ? trustProxyHops : false`); the Caddy
  reverse proxy **overwrites** (not appends) XFF; new env `TYCHE_TRUST_PROXY_HOPS` (default 1). For the
  env var itself see **tyche-config-and-flags**.
- **STATUS: CLOSED.** Rule: never `trustProxy: true` behind an untrusted edge; trust a hop-exact count and
  make the edge reset the header.

### 1.5 PROVIDER-ROUTING over mixed universes

- **SYMPTOM:** Enabling a venue adapter (binance/frankfurter) `502`'d or blanked an entire equity
  watchlist; and an active operator plugin never actually served its capabilities.
- **ROOT CAUSE:** (a) `/api/quotes` resolved `batchQuotes` for the *whole list at once* against a single
  provider, so one provider that could not serve every symbol failed the batch. (b) Provider plugins were
  registered **after** the always-appended mock fallback, so mock answered first and the plugin never ran.
- **FIX:** `6ebe6ef` — group symbols **per serving provider** and merge (mirroring the SSE hub);
  plugins register **before** the mock fallback via `ProviderRegistry.registerBefore`.
- **STATUS: CLOSED.** Rule: batch calls must be grouped by which provider `servesSymbol`; conformant
  plugins slot ahead of the always-last mock fallback. Routing/model detail lives in
  **tyche-architecture-contract**.

### 1.6 SEC FISCAL-FRAME quirks → empty AAPL/MSFT balance sheets

- **SYMPTOM:** `AAPL` and `MSFT` returned an **empty balance sheet**; off-calendar filers produced
  duplicate/misaligned FA columns and off-by-one year labels; a non-JSON WAF/maintenance HTML `200`
  threw and bypassed the graceful-empty path.
- **ROOT CAUSE:** Annual balance-sheet instants were hardcoded to the `CY####Q4I` frame, but SEC frames a
  fiscal-year-end instant by the **calendar quarter of the year-end** — `Q3I` for a September year-end
  (AAPL), `Q2I` for June (MSFT), only `Q4I` for December filers. The annual period key was also derived
  inconsistently (frame calendar year vs fiscal `fy`).
- **FIX:** `d63f764` `fix(data): correct SEC fundamentals period selection (adversarial review)` — accept
  any `CY####Q[1-4]I` FY-end instant (gated `fp==='FY'`); key every annual fact by the **calendar year of
  its period END**; guard `res.json()` so a non-JSON body becomes a `ProviderError`, not a crash.
  Adapter: `packages/data-adapters/src/stubs/SecEdgarProvider.ts`.
- **STATUS: CLOSED.** Rule: never assume `Q4I` for a fiscal-year balance instant. Formula/field mapping
  detail belongs to **financial-terminal-reference**.

### 1.7 SIGNED-VS-GROSS portfolio math

- **SYMPTOM:** A balanced long/short book blanked **every** portfolio weight; the positions table hid a
  user's own holdings whenever the price feed hiccuped.
- **ROOT CAUSE:** Weights denominated on **signed net exposure** (Σ marketValue) — which nets to ~0 for a
  hedged book — instead of **gross exposure** (Σ|marketValue|); and the positions table was gated on the
  live quote feed rather than the durable portfolio fetch.
- **FIX:** `0798746` `fix(m10/tkt-030): address adversarial review — gross weights, quote-decoupled
  holdings, edge cases` — weights denominate on gross exposure; positions render from the durable
  portfolio fetch (not the quote stream); reject zero-qty; CSV header detection off the first significant
  row.
- **STATUS: CLOSED.** Rule: portfolio weights are `|marketValue| / Σ|marketValue|`; never hide a user's
  own stored data behind a price-provider hiccup.

### 1.8 The DATA-MISLABEL class — never silently mislabel a datum

The project's single most-repeated unwritten rule: **never present a datum as something it is not.**
Two concrete instances are locked in code with explanatory comments:

| Mislabel | Wrong source | Correct source | Evidence |
|---|---|---|---|
| **Shares outstanding** | `CommonStockSharesIssued` — *includes treasury stock*, so it overstates the true float | `CommonStockSharesOutstanding` only; never fall back | comment + guard `packages/data-adapters/src/stubs/SecEdgarProvider.ts:967-969`; introduced with `9f46078` |
| **Beneish LVGI (leverage index)** | double-counted the current portion of long-term debt | `totalLiabilities ÷ totalAssets` — a clean, double-count-free proxy | `packages/analytics/src/scoring.ts:225-228,247`; introduced with `e79c58a` |

- **STATUS: CLOSED (both).** The *formula-level* hazards (which XBRL tag, which ratio, degenerate-input
  nulls) are owned in depth by **financial-terminal-reference** — do not re-derive them here.

---

## Part 2 — Settled DECISIONS / dead-ends (do not reopen without change-control)

### 2.1 The removed optimistic-mirror rollback (data-loss + flaky e2e)

- **WHAT HAPPENED:** The hardening pass `6ebe6ef` added `clearMirror()` on a `{ok:false}` workspace save,
  intending it as a safety rollback. It **caused data loss**: a Save-then-reload aborts the in-flight
  `saveWorkspace` fetch → `fetchEnvelope` returns `{ok:false}` → `clearMirror()` deletes the mirror
  **before** the page unloads → restore finds nothing → the user's just-made layout is lost. It also
  made the "opens panels, saves, restores after reload" e2e **flaky** (flaked even on a docs-only PR).
- **RESOLUTION:** `ab560f4` `fix(web): don't roll back the optimistic workspace mirror on a failed save`
  — **keep the optimistic write and the failure toast, but NEVER roll the mirror back.** Cross-account
  safety comes from **namespacing the key by user id** (Part 1.3), not from clearing. Verified: save-
  restore test 5× + full suite 44/44. Current code: `apps/web/src/workspace/persistence.ts`.
- **STATUS: SETTLED.** Do not re-add a `clearMirror()`/rollback-on-failed-save. If you think you need one,
  read `git show ab560f4` first — this exact reflex already cost a user's layout.

### 2.2 The one file ever deleted — PriceChart.tsx

- **WHAT HAPPENED:** `apps/web/src/modules/PriceChart.tsx` (a single close-line chart) was deleted in
  `6e19f0b` `feat(m14/tkt-036): advanced charting — candlesticks + SMA/EMA/RSI on GP`, superseded by
  `apps/web/src/modules/AdvancedChart.tsx` (configurable line/OHLC + SMA/EMA/RSI, dependency-free canvas).
- **STATUS: SETTLED — a planned supersede, not a failure.** This is the **only** file ever deleted in the
  repo's history (`git log --diff-filter=D --summary | grep -c "delete mode"` → 1 on 2026-07-19). The
  codebase **extends, it does not delete.** If you are about to delete a file, that is unusual — justify
  it as a clean supersede and route through **tyche-change-control**.

---

## Part 3 — Ruled-out data verticals (CANDIDATE / OPEN — reasoning recorded)

These appear as *attractive keyless gaps* in the competitive research (`docs/research/godel/`), but were
**deliberately not built** in the current egress-restricted environment (the live SEC/FINRA upstreams are
not reliably reachable, which is also why recent work pivoted to analytics-over-existing-data). They are
**not settled-closed** — they are parked with reasons. Do not present any of them as "just wire it up."

| Vertical | Where it is proposed | Why it is CANDIDATE/OPEN (not built) |
|---|---|---|
| **13D/13G activist / 5%+ beneficial-owner stakes** ("who holds >5% of X") | `docs/research/godel/2026-bloomberg-gap-analysis.md:99,178` | The issuer-submissions / filing feed is **filer-indexed** (by the filer, not by the subject company), so answering "who holds >5% of company X" is **not cheaply reachable** — it needs a cross-filer harvest + body-parse of stake %, not one index fetch. **STATUS: OPEN.** |
| **FINRA short interest (days-to-cover, % of float)** | `2026-bloomberg-gap-analysis.md:98` | The full-market consolidated short-interest file's availability/format is **uncertain** in this environment; the semi-monthly file is not confirmed parseable end-to-end here. **STATUS: CANDIDATE.** |
| **Filing-triggered alerts (new 8-K / Form 4 / 10-K)** | `2026-bloomberg-gap-analysis.md:71,177` | Joining EDGAR's newest-filings stream to the ALERT engine is **too broad an infra build** for the value — a polling + dedup + fan-out service, not a slice. **STATUS: CANDIDATE.** |

If you want to actually build one of these, that is a **frontier decision** — take it to
**tyche-research-frontier** (what to build next) and **tyche-change-control** (the gate). Do not treat the
research doc's "missing / keyless" labels as a green light; the egress reality above is the reason they
are still on the shelf.

---

## Part 4 — The culture that produced this chronicle

Two facts explain *why* the history is clean, and they are norms you must uphold:

- **No `git revert`, ever — fix forward.** `git log -i --grep='revert' --oneline | wc -l` → **0** on
  2026-07-19. Mistakes are corrected with a `fix(...)` commit that carries a regression test, never by
  reverting. (Even the removed rollback in Part 2.1 was a *forward* `fix`.)
- **Adversarial-review cadence is the signature.** Every merged slice gets a multi-lens / multi-agent
  adversarial self-review; each confirmed finding is fixed **with** a regression test. On 2026-07-19:
  **19** commits reference "adversarial" (`git log -i --grep='adversarial' --oneline | wc -l`) and **17**
  reference "harden" (`git log -i --grep='harden' --oneline | wc -l`). Almost every entry in Part 1 came
  out of one of these passes. The *discipline* (how to run the review, gate, and merge) is owned by
  **tyche-change-control** — this skill only records the *outcomes*.
- **No `// TODO`/`FIXME`/`HACK` in `.ts`/`.tsx` source.** Debt is fixed forward or recorded as a prose
  open-question in docs (e.g. the auth `===` question, `docs/BUILD_MANUAL.md:1382`). Adding a `// TODO`
  to code violates the observed norm.

---

## Part 5 — How to add a new entry to this chronicle

When an adversarial review or incident closes a *new* class of bug, append it here so it is never
re-fought. Keep entries in the SYMPTOM → ROOT CAUSE → EVIDENCE → STATUS shape.

1. Land the fix + regression test through **tyche-change-control** first (this skill records history; it
   does not authorize changes).
2. Add an entry under Part 1 (a bug class) or Part 2 (a decision/dead-end). Cite the **fix commit hash**
   and the **file** the fix lives in.
3. If the fix touches a formula/field mapping, put the *formula* detail in **financial-terminal-reference**
   and only cross-reference it here.
4. If it is a live-triage recipe (symptom → check → fix), that belongs in **tyche-debugging-playbook**, not
   here. This skill is the settled past; the playbook is the present.
5. Re-verify the hash exists (`git show <hash>`) before you commit the entry.

---

## Provenance and maintenance

Verified on **2026-07-19** against the dev branch (`claude/financial-terminal-foundation-49spvm`). Every
VOLATILE fact below is paired with a one-line re-verification command. Evidence priority when sources
disagree: deployed/CI evidence > executable code > ops docs > architecture docs > README/roadmap.

| Fact (as of 2026-07-19) | Re-verify with |
|---|---|
| Fix commits exist: `74c7005 dc8d8f2 6ebe6ef 5c357ea d63f764 0798746 ab560f4 6e19f0b 9f46078 e79c58a` | `for h in 74c7005 dc8d8f2 6ebe6ef 5c357ea d63f764 0798746 ab560f4 6e19f0b 9f46078 e79c58a; do git show -s --oneline $h; done` |
| `timingSafeEqual` used for hosted secret compares (users/sessions/billing/invites) | `grep -rn timingSafeEqual apps/api/src --include=*.ts` |
| Self-host bearer guard still compares with plain `===` (the OPEN question) | `grep -n '=== config.authToken' apps/api/src/security/auth.ts` |
| The bearer-`===` open question is still recorded in the manual | `sed -n '1382p' docs/BUILD_MANUAL.md` |
| `markAlertTriggered` compare-and-set exists in both persistence impls | `grep -rn markAlertTriggered apps/api/src/persistence` |
| Workspace mirror is namespaced by user id (not cleared) | `grep -n 'namespaced by the signed-in user' apps/web/src/workspace/persistence.ts` |
| Shares-outstanding mislabel guard (never `CommonStockSharesIssued`) | `sed -n '967,969p' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| LVGI = totalLiabilities ÷ totalAssets (double-count-free) | `grep -n 'LVGI' packages/analytics/src/scoring.ts` |
| `TYCHE_TRUST_PROXY_HOPS` env drives hop-exact trustProxy | `grep -rn 'TRUST_PROXY_HOPS' apps/api/src` |
| Exactly ONE file ever deleted (PriceChart.tsx); AdvancedChart is its successor | `git log --diff-filter=D --summary \| grep 'delete mode'` ; `ls apps/web/src/modules/AdvancedChart.tsx` |
| Zero `git revert` commits (fix-forward culture) | `git log -i --grep=revert --oneline \| wc -l` (expect 0) |
| **19** "adversarial" + **17** "harden" fix commits — recount, do not trust the number | `git log -i --grep=adversarial --oneline \| wc -l` ; `git log -i --grep=harden --oneline \| wc -l` |
| Ruled-out verticals (13D/13G, FINRA SI, filing alerts) are research-doc gaps, not shipped features | `grep -n '13D\|short interest\|Filing-triggered' docs/research/godel/2026-bloomberg-gap-analysis.md` |

**Drift warning:** the repo has known doc-vs-code drift (docs say "24 capabilities / 41 commands"; code has
**28** capability keys in `packages/contracts/src/provider.ts` and **60** in `DEFAULT_COMMANDS`). Trust the
CODE. If you ever cite a count in a new entry, pair it with its recount command — never hard-code a drifting
figure. (Recounts: capability keys `sed -n '10,39p' packages/contracts/src/provider.ts`; commands via
`DEFAULT_COMMANDS` in `packages/terminal-kernel/src/commands.ts`.)
