---
name: tyche-external-positioning
description: >-
  How to talk about Tyche to the outside world: what is novel vs. known, what may/may not be
  claimed, pricing, non-goals, and the reproducibility/honesty bar. Load this BEFORE writing or
  editing any external-facing collateral — the landing page (marketing/landing.html), Show HN /
  Product Hunt / launch-thread copy, docs/LAUNCH.md, docs/BILLING.md, the README lead, a release
  announcement, a pricing statement, a competitor comparison, or the Gödel clean-room research
  under docs/research/godel/. Also load it whenever you must answer "can we say X about Tyche?",
  "how do we position against the incumbent terminal?", "what's our price / free tier?", "is this
  claim honest?", "what are our non-goals?", or when a feature/coverage claim needs to be checked
  against what the code actually ships (data-honesty). Triggers: positioning, marketing copy,
  landing page, launch, pricing, $29, TYCHE_PRICE_MONTHLY, clean-room, Gödel/Godel, competitor,
  "sells software not data", non-goals, "can we claim", data-honesty, overclaim.
---

# Tyche External Positioning

**What this skill is for:** authoring and reviewing anything the outside world reads — marketing
copy, the landing page, launch posts, pricing statements, competitor comparisons, the README lead,
and the clean-room research dossier. It is the single home for **positioning, differentiators,
pricing, the non-goals, the launch-collateral map, and the claim-honesty rule.**

**The one rule that outranks everything here:** a public claim about what Tyche *does* or *covers*
must match what the code actually ships. Marketing may be ambitious about the *delivery model*; it
may never be ambitious about *data coverage*. When in doubt, ship less claim.

---

## When NOT to use this skill (use the named sibling instead)

| You are actually doing… | Use this sibling instead |
|---|---|
| Changing schema/config/deploy, or promoting an experiment to shipped | **tyche-change-control** (every behavior change routes through it) |
| Understanding *why* the 5 product invariants exist / their history | **tyche-change-control** (owns invariant rationale) |
| Explaining the entitlement / keyless-vs-BYO-key mechanics, or any env var | **tyche-config-and-flags** (owns `TYCHE_*` vars, adapter roster, keyless/BYO wiring) |
| Fixing or citing the doc-drift register, or editing docs of record | **tyche-docs-and-writing** (owns the drift register + recount discipline) |
| Explaining the degrade-never-crash contract, capability-gap model, deps | **tyche-architecture-contract** |
| Explaining a formula (Altman/Piotroski/Beneish/beta/BSM) or a mislabel trap | **financial-terminal-reference** |
| Deciding whether an unproven idea is shippable / an open problem | **tyche-research-frontier**, **tyche-research-methodology** |

If the task is "make the product *do* something," you are in the wrong skill — route to
tyche-change-control. This skill only governs how you *describe* what already exists.

---

## 1. The identity (one line, memorize it)

> **Tyche is a keyboard-first, self-hostable financial *research* terminal that sells
> software and hosting — never data.**

Everything else is a consequence of that line. "Research terminal" (not trading), "self-hostable"
(not lock-in), "sells software + hosting, never data" (the wedge AND the legal bar — see §4).

Source of the identity: `docs/BUILD_MANUAL.md` §0 (lines 8–33) and `README.md` lead (lines 1–18).

---

## 2. The differentiated positioning — what is novel vs. what is known

**Known / not novel (never claim these as invented here).** The *feature surface* of a research
terminal is industry-standard and Bloomberg-derived: a command bar with a tolerant grammar, tiling
linked panels, watchlists/quote monitors, charting + historical prices, company financials + export,
filings viewer, news, estimates/ratings/holders, options chains + Greeks, screeners, an AI copilot.
Tyche implements these as **original** modules; it does not claim to have invented the category.
(Evidence: `docs/adr/0004-...md` "What Tyche WILL emulate (at the category level)".)

**Novel / the wedge = the DELIVERY MODEL, not the feature list.** Tyche cannot out-fund the
incumbent on licensed-data breadth, so it deliberately competes on a *different axis*. The
differentiators, each defensible against the benchmark:

| Differentiator | What it means for copy |
|---|---|
| **Keyboard-first** | ⌘K → type a command (`AAPL GP`, `ETH DEX`, `ECO GDP`) → a panel opens; tiling named workspaces. "At the speed of typing." |
| **Self-hostable, open-core (Apache-2.0)** | One-command `docker compose` self-host, free forever. No lock-in; "leave with everything." |
| **Crypto-first, keyless real data** | Live crypto depth, perp funding, on-chain DEX pools, macro series, SEC filings, global news — real, no account, no key. This is the "what's real and free" lead. |
| **Local-first / mock-by-default** | A fresh clone with zero keys runs the ENTIRE terminal on the deterministic mock provider. |
| **Provenance on everything** | Every datum carries source/mode/freshness; it renders in panel footers and rides into CSV exports. "Provenance on every single datum, down to the CSV exports." |
| **BYO-data / open SDK** | Live/premium data connects under the operator's *own* licenses behind capability flags; open module + provider SDK. |
| **Grounded, no-advice AI** | The copilot cites provenance and declines personalized buy/sell/hold guidance. |
| **Priced like SaaS** | $29/mo hosted, free self-host — "not a five-figure-a-year rental." |

The honest-posture itself ("sells software, not data") is treated as a differentiator, not a
disclaimer. (Evidence: `marketing/show-hn.md:11,37`; `README.md` lead; `docs/research/godel/FINAL_REPORT.md:15`.)

---

## 3. The benchmark: Gödel Terminal, and the pricing wedge

The clean-room benchmark target is **Gödel Terminal** (browser-native, command-driven, low-cost
Bloomberg alternative). Use these figures only with the caveat that sources conflict.

| Product | Public price (as researched) | Note |
|---|---|---|
| Bloomberg Terminal (single seat, 2026) | ~$31,980/yr (~$2,665/mo) | third-party sources |
| **Gödel Terminal** | **~$996/seat/yr** (also reported $118/mo, earlier $80/mo) | sources conflict — see below |
| **Tyche hosted** | **$29/mo** | free to self-host |

**The strategic conclusion you must not forget (verbatim intent, `docs/research/godel/product-positioning.md:46`):**
Tyche, with **no data budget, cannot win on licensed-data breadth at all.** So it competes on the
delivery model (self-hostable, local-first, mock-by-default, transparent provider adapters, open
SDK), never on "we have more/better data than the incumbent."

**Honesty guardrails when writing competitor copy:**
- Gödel's price is a **conflicting** figure ($80/mo → $118/mo → $996/yr across sources). Never
  state one number as settled fact; say "around $996/seat/yr (sources vary)" or cite the range.
- Benchmark **feature CATEGORIES only**. Never reproduce the competitor's UI, copy, screenshots,
  styling, layout, trade dress, private APIs, naming, or docs. (§5, the clean-room stance.)
- The incumbent is *ahead* on licensed-data breadth. Say so if the comparison invites it; Tyche is
  ahead on provenance, mock-by-default, self-host, and open SDK. (`docs/research/godel/FINAL_REPORT.md`.)

---

## 4. Pricing — the facts (single home)

| Fact | Value | Where |
|---|---|---|
| Hosted price (display) | **$29 / month** | `.env.example:193` `TYCHE_PRICE_MONTHLY=29`; `apps/api/src/env.ts:143` (falls back to `29`) |
| Self-host | **Free forever**, Apache-2.0, one `docker compose` | `README.md`, `marketing/product-hunt.md:46` |
| Trial | **14 days, no card** | `docs/BILLING.md:10` |
| Annual price | optional (`STRIPE_PRICE_ID_ANNUAL`, ~10× monthly = "2 months free") | `.env.example` |

**`TYCHE_PRICE_MONTHLY` is DISPLAY + admin MRR readout ONLY.** The Stripe price object is the source
of truth for what a customer is actually charged. Do not describe `TYCHE_PRICE_MONTHLY` as "the
price you pay"; it is the number shown on the pricing card. (`.env.example:193` comment;
config mechanics live in **tyche-config-and-flags**.)

**Entitlement one-liners (safe to state in marketing):** every account gets a 14-day trial → then
`trial` / `pro` / `expired`; an expired trial hits a paywall (HTTP 402) on terminal routes but
auth/billing/health/**data export** stay reachable; **nothing is deleted on lapse**; admin accounts
are never paywalled; billing **fails closed** (misconfigured = no paywall, never a fake "pro").
The *mechanics* of these (402 routing, fail-closed driver selection) are owned by
**tyche-config-and-flags** and **tyche-run-and-operate** — cross-reference, do not re-derive.

---

## 5. The clean-room stance (ADR-0001 + ADR-0004) — a hard rule

This is invariant #5 ("Clean-room") of the five product invariants. Restating the *rule* verbatim
is allowed; the *rationale/history* lives in **tyche-change-control**.

**The rule:** Benchmark against **publicly documented market-terminal feature *categories* only.
Never copy any proprietary product's UI, data, naming, or docs.**

Operationally, when producing any competitor-facing artifact:

- [ ] **Public information only.** No login-gated surfaces, no scraping app internals, no paywalls
      bypassed, no credentials, no reverse-engineering. (`docs/adr/0004-...md`.)
- [ ] **Categories, not copies.** Abstract the competitor's *feature categories* and
      industry-standard command mnemonics into **original** Tyche designs. Copy **no** UI, assets,
      screenshots, copy, styling, layout, trade dress, private APIs, or undocumented behavior.
- [ ] **No transcript hoarding.** Videos summarized to titles + claim-themes; no stored transcripts,
      short/no quotes.
- [ ] **Honest sourcing with reliability tiers.** Every factual claim cites a source with a tier
      (T1 official → T4 forum/sentiment). Conflicts (esp. pricing) are **recorded, not resolved by
      invention.**

The clean-room research already done lives in `docs/research/godel/` and is the model to follow.
Note `docs/research/godel/RESEARCH_BLOCKED.md`: direct page-fetch was egress-blocked, so all facts
came via WebSearch — disclose the same if you extend the research.

---

## 6. The non-goals — the hard boundary on every claim

These bound what may ever be claimed or built. If a proposed feature or claim touches one, it is
**out of scope by design** — do not soften, do not "phase-1 it in." (Source: `ROADMAP.md:96–106`;
each also enforced elsewhere in the codebase.)

| Non-goal | The line you hold in copy |
|---|---|
| **Order placement / brokerage linking** | "Tyche places no orders. It is **not a broker**." No `BROK`-style module, ever. |
| **Personalized buy/sell/hold advice** | "Research and educational analysis only." The AI declines and stays grounded. |
| **Bundled / resold / proprietary licensed market data** | "Live data is bring-your-own behind capability flags." Never advertise "real-time data included." |
| **Private-company data, community chat, expert-network contacts DB** | Outside a research-terminal core. Do not tease these. |
| **Latency-edge / "beat the market" marketing** | Data-dependent and advice-adjacent — never claim a speed/edge over the market. |

Hosted multi-user + billing **used to** be a non-goal and is now an explicit goal — it is the one
item that moved. The other five stand. If someone asks "why not add order placement / a data
bundle?", the answer is invariant + non-goal, not a roadmap conversation.

---

## 7. THE HONESTY RULE — never claim data you do not ship

This is the load-bearing rule of the whole skill. Marketing copy drifts ahead of the code; the
code is the source of truth. **Before publishing any capability or coverage claim, verify it against
what ships.**

**Known live drift (as of 2026-07-19) — do not copy a count from a doc:**
- Command count: docs/collateral say "40+" (`product-hunt.md`, `launch-thread.md`), "50+"
  (`marketing/landing.html:7`), README says "41 stable". **The code has 60.** Recount, never trust
  the doc figure: `grep -cE '^\s*cmd\(\{' packages/terminal-kernel/src/commands.ts` → 60.
- Capability count: docs say "24 typed capabilities". **The code has 28 keys.** Recount:
  `sed -n '10,39p' packages/contracts/src/provider.ts | grep -oE "'[a-zA-Z]+'" | wc -l` → 28.
- Adapter count: landing says "Eight real adapters" — this MATCHES, but the breakdown is
  **6 keyless-ish + 2 BYO-key**, NOT "7 keyless + Finnhub". Keyless-ish: Binance, Frankfurter,
  Dexscreener, GDELT, Stooq, plus SEC EDGAR (needs only a contact-email `SEC_EDGAR_USER_AGENT`).
  BYO-key: **Finnhub** (`FINNHUB_API_KEY`) and **FRED** (`FRED_API_KEY`, free) — landing.html:162
  itself says "FRED (macro) uses a free key". Yahoo/CCXT are disabled scaffolds. Roster owned by
  **tyche-config-and-flags**.

The **full doc-drift register** (every drifting claim + where the doc says it) is owned by
**tyche-docs-and-writing**. Cross-reference it before shipping a number; do not re-derive the whole
register here.

**Claim-honesty checklist (run before publishing external copy):**

- [ ] Every **coverage** claim ("real-time X", "covers Y market") names a *shipped* adapter or is
      hedged as "bring your own key." Cross-check the roster in **tyche-config-and-flags** /
      `DATA_PROVIDERS.md`.
- [ ] No claim implies Tyche **bundles or resells** licensed data. Live data connects under the
      operator's own licenses. (Invariant #2.)
- [ ] Any **count** (commands, capabilities, tests, adapters) was recounted against code TODAY, not
      copied from a doc. Pair every count you publish with its recount command in the source file.
- [ ] No **advice / order / brokerage / latency-edge** language crept in. (§6 non-goals.)
- [ ] The **"sells software + hosting, never data"** line survives — it is both the marketing wedge
      and the legal/entitlement bar. Removing or softening it is a doctrine violation.
- [ ] Provenance/"not financial advice" framing is preserved wherever data or analysis is described.
- [ ] Competitor pricing is hedged ("sources vary"), and no proprietary UI/copy/naming was
      reproduced. (§5.)

When a claim cannot be verified against shipped code, **cut it or hedge it.** An over-claim that a
user can disprove in the demo is worse than a modest true claim.

---

## 8. Launch-collateral map — where each thing lives

Edit the right file; keep the doctrine consistent across all of them.

| Artifact | Path | What it is |
|---|---|---|
| Landing page | `marketing/landing.html` | Hero, feature cards, pricing card ($29/mo), "The honest bit" block, FAQ. Self-contained HTML. |
| Show HN post | `marketing/show-hn.md` | Honest-posture playbook; title "Tyche – a financial research terminal that sells software, not data". |
| Product Hunt | `marketing/product-hunt.md` | Tagline "Keyboard-first market research, priced like SaaS". |
| Launch thread (X) | `marketing/launch-thread.md` | "Feels like the $25k/yr terminal, priced like a SaaS." |
| Beta invite email | `marketing/beta-invite-email.md` | Outreach copy. |
| Legal templates | `marketing/legal/{terms,privacy}-template.md` | Terms/privacy source; served pages are `apps/web/public/{terms,privacy,invite,reset,verify}.html`. |
| Assets | `marketing/{og.png,demo.gif}` | Open-graph image + demo animation. |
| Launch runbook | `docs/LAUNCH.md` | "Everything between 'the code is done' and 'strangers pay monthly'": 7-day launch + 30-day activation plan; `scripts/deploy.sh`; the read-only demo (`TYCHE_DEMO=true`) as top-of-funnel. |
| Billing doc | `docs/BILLING.md` | "Charges for software + hosting — never market data." Trial/pro/expired entitlement; fails closed; admins never paywalled. |
| README lead | `README.md:1–18` | The "what's real and free" lead, "Not financial advice" blockquote, clean-room statement. |
| Clean-room research | `docs/research/godel/` | Gödel benchmark dossier (see §3, §5). `FINAL_REPORT.md`, `product-positioning.md`, `RESEARCH_BLOCKED.md`, etc. |

**Consistency rule:** these files repeat the same doctrine (sells-software-not-data, $29/mo, no
advice, provenance, non-goals). If you change a positioning fact, change it in ALL of them in the
same PR, and route the change through **tyche-change-control** if it alters shipped behavior. A
claim that appears in one and contradicts another is a review failure.

---

## Provenance and maintenance

Verify VOLATILE facts (marked ⏱, dated 2026-07-19) before relying on them; positioning *doctrine*
(the invariants, non-goals, clean-room rule) is stable and lives in the sources cited inline.

| Fact | ⏱ Value (2026-07-19) | Re-verify with |
|---|---|---|
| Hosted price default | `29` | `grep -n TYCHE_PRICE_MONTHLY .env.example apps/api/src/env.ts` |
| Command count | 60 (docs drift to "40+/50+/41") | `grep -cE '^\s*cmd\(\{' packages/terminal-kernel/src/commands.ts` |
| Capability keys | 28 (docs drift to "24") | `sed -n '10,39p' packages/contracts/src/provider.ts \| grep -oE "'[a-zA-Z]+'" \| wc -l` |
| Real adapters | 8 (6 keyless-ish + 2 BYO-key: Finnhub, FRED); Yahoo/CCXT disabled | `sed -n '1,20p' DATA_PROVIDERS.md`; roster in **tyche-config-and-flags** |
| Gödel benchmark price | ~$996/seat/yr (sources conflict $80/$118/mo) | `grep -n 996 docs/research/godel/product-positioning.md` |
| Non-goals list | 5 stand; hosted+billing moved to a goal | `sed -n '96,110p' ROADMAP.md` |
| Landing "honest bit" line intact | present | `grep -n 'honest bit' marketing/landing.html` |
| Clean-room rule (invariant #5) | verbatim | `sed -n '31,32p' docs/BUILD_MANUAL.md` (and ADR-0001/0004) |
| Collateral files present | all listed in §8 | `ls marketing/ docs/LAUNCH.md docs/BILLING.md docs/research/godel/` |

**Drift-first discipline:** the docs are known to lag the code on counts. This skill trusts the CODE
and pairs every count with a recount command. If you cite a number without its recount command, you
have violated the honesty rule this skill exists to enforce. The authoritative drift register is
maintained by **tyche-docs-and-writing**.
