---
name: tyche-research-frontier
description: >-
  The labeled catalog of OPEN research/product frontiers where Tyche could advance beyond the
  current state of the art — each one grounded in a REAL repo asset, with the first three concrete
  steps (exact files) and a falsifiable "you-have-a-result-when" milestone. Load this when someone
  asks "what should we build next to get ahead?", "where can Tyche beat the incumbent terminal?",
  "what's the moat / differentiator we can deepen?", "is there a research angle here?", "what's an
  ambitious next project?", "what would make forensic analytics / provenance / crypto depth / the
  plugin SDK a real edge?", or when scoping a multi-week initiative rather than a routine slice.
  Everything here is labeled OPEN or CANDIDATE — these are ambitions, NOT shipped facts and NOT
  approved work. Triggers: frontier, moat, differentiator, "beyond SOTA", "get ahead", research
  direction, ambitious project, forensic analytics, cross-sectional screening, provenance diffing,
  reproducible snapshots, on-chain depth, plugin ecosystem, "what should we build next".
---

# Tyche Research Frontier

**What this skill is:** a curated, evidence-grounded list of OPEN problems where Tyche has a
*specific asset* that makes advancing past today's state-of-the-art (SOTA) tractable. Each candidate
is a scoping starting point: a shortfall in the incumbent, the Tyche asset, the first three steps in
THIS repo, and a falsifiable milestone that tells you whether the idea is real.

**What this skill is NOT:** it is not a roadmap, not a backlog, and not approval to build anything.
Every candidate below is labeled **OPEN** (problem is unsolved) or **CANDIDATE** (a proposed
approach). None of it is shipped. Turning a candidate into accepted, shippable work is a *different*
discipline — see the routing table below.

> **Jargon, defined once.**
> - **SOTA** = state of the art: the best current publicly-documented capability of comparable tools.
> - **The incumbent / benchmark** = the publicly-documented competitor category Tyche benchmarks
>   against clean-room (the "Gödel Terminal", ~$996/seat/yr). We benchmark *feature categories only*
>   — never copy UI, data, naming, or docs (product invariant #5).
> - **Keyless** = a data source that works with zero API keys or accounts (e.g. Binance, Dexscreener,
>   ECB/Frankfurter). Tyche's crypto/FX depth runs keyless out of the box.
> - **Forensic analytics** = descriptive accounting-quality / distress / earnings-manipulation
>   *screens* (Altman Z, Piotroski F, Beneish M) computed from filings — educational, never advice.
> - **Provenance** = the `{ provider, providerMode, capability, retrievedAt, freshness, … }` metadata
>   that rides on every datum (product invariant #3). A number without provenance is a bug.
> - **Capability** = a typed data kind a provider can serve (`quotes`, `filings`, `dexPools`, …).
> - **Falsifiable milestone** = a concrete, checkable outcome that would *disprove* the idea if not
>   met. "Users like it" is not falsifiable; "computes Piotroski F for the mock universe and matches
>   a hand-worked fixture to 6 decimals" is.

---

## When NOT to use this skill — use the named sibling instead

| If you are… | Use this sibling, not this skill |
|---|---|
| Turning a candidate into an accepted, evidence-backed, shippable result (the evidence bar, idea lifecycle, "is it shippable yet?") | **tyche-research-methodology** |
| Deciding whether an idea is *allowed* / how to say it externally / whether it hits a non-goal | **tyche-external-positioning** |
| Needing the domain math itself (Altman/Piotroski/Beneish/beta/BSM formulas, mislabel traps) | **financial-terminal-reference** |
| Actually executing the add-a-vertical / add-an-adapter build recipe, step by step | **tyche-vertical-slice-campaign** |
| Writing the correctness proof (golden fixtures, determinism, adversarial self-review) for a slice | **tyche-proof-and-analysis-toolkit** |
| **Changing any system behavior** — schema, config, deploy, promoting an experiment | **tyche-change-control** (always; never route around it) |
| Doing a routine bug fix, a one-panel feature, or ordinary triage | **tyche-debugging-playbook** / the normal slice flow |

**Load-bearing rule (restated, non-negotiable):** *any workflow that changes system behavior MUST
route through **tyche-change-control**.* This skill only helps you pick and frame a frontier. The
moment you write code, a schema, config, or a doc-of-record, you are in change-control's territory,
and the five product invariants (research-only; never resell data; provenance on everything; mock
always works; clean-room) still bind. This skill never overrides them.

---

## How to read a candidate

Every entry has exactly four fields. Do not adopt a candidate that is missing any of them.

1. **Shortfall** — why today's SOTA/benchmark falls short *for a specific target user*.
2. **Tyche asset** — the specific, real, in-repo thing that makes this tractable for Tyche and hard
   for a paid terminal to match (verify the file exists before you rely on it).
3. **First three steps** — the exact files/dirs to touch first, in order.
4. **Falsifiable milestone** — the checkable "you have a result when…".

Then: take it to **tyche-research-methodology** for the evidence bar, and route the actual build
through **tyche-change-control**.

---

## Family A — Forensic analytics over FREE SEC data (the moat)

**The moat in one line:** a paid terminal *charges* for accounting-quality and valuation screens;
Tyche *derives* them from free SEC filings (EDGAR filings index + XBRL company-facts) with zero data
licensing. The frontier is to **broaden the forensic suite and make it cross-sectional** — screen the
whole free universe, not one ticker at a time.

**Verify the assets before using this family:**
- Pure forensic functions already exist in `packages/analytics/src/scoring.ts`
  (`altmanZScore`, `piotroskiFScore`, `beneishMScore`, `fundamentalScorecard`) and
  `packages/analytics/src/valuationHistory.ts` (`valuationHistory`). Recount:
  `grep -c '^export function' packages/analytics/src/scoring.ts`.
- Real free fundamentals come from `packages/data-adapters/src/stubs/SecEdgarProvider.ts`
  (keyless; needs only a descriptive `SEC_EDGAR_USER_AGENT`; serves the `fundamentals` capability
  over `data.sec.gov/api/xbrl/companyfacts`). Verify: `grep -n 'companyfacts' packages/data-adapters/src/stubs/SecEdgarProvider.ts`.
- Analytics is a **pure layer**: no network, no capability, no route — it consumes already-fetched
  contract arrays in `useMemo`. An analytics-only feature adds NO capability/route/apiClient. (This
  design rule is owned by **tyche-architecture-contract**; the purity proof by **tyche-proof-and-analysis-toolkit**.)

### A1 — CANDIDATE: cross-sectional forensic screening over the free universe
- **Shortfall:** a value/quality analyst on a solo budget can get a single company's distress or
  quality score, but cannot *rank a universe* by it without an expensive terminal. Tyche's screener
  today filters only on `price, changePercent, marketCap, volume, sector, assetClass` — no
  accounting-quality fields at all. Verify: `sed -n '13,21p' packages/contracts/src/screener.ts`.
- **Tyche asset:** the forensic functions in `scoring.ts` already compute per-ticker Piotroski/Altman/
  Beneish from free XBRL; the screener plumbing (`packages/analytics/src/screen.ts` `applyScreen`,
  contract `packages/contracts/src/screener.ts`, `screener` capability) already exists. The gap is
  wiring a computed forensic field into `ScreenField`.
- **First three steps:**
  1. `packages/contracts/src/screener.ts` — extend `ScreenFieldSchema` with a forensic field (e.g.
     `piotroskiF`) and add it to `Schemas` per the contracts-first recipe.
  2. `packages/analytics/src/screen.ts` — teach `applyScreen` (and the row-building path that feeds
     it) to populate the new field from `piotroskiFScore` over each candidate's statements.
  3. `packages/analytics/src/scoring.test.ts` + a new `screen` fixture — golden test: a hand-worked
     two-company universe ranks in the known order; a company with `<2` annual periods yields `null`
     (never a fabricated score) and sorts to the gap state, not to zero.
- **Falsifiable milestone:** `EQS`-style screen over the mock universe returns companies ranked by
  Piotroski F, every score carries provenance, and companies with insufficient history render the gap
  state (null) — proven by a fixture asserting the exact ranking and the null case. If any degenerate
  input produces a fabricated `0`, the candidate has failed its own bar.

### A2 — CANDIDATE: broaden the forensic suite (new descriptive screens)
- **Shortfall:** the incumbent bundles many proprietary quality/red-flag scores; a free tool that
  stops at three screens looks thin to a fundamentals-first user.
- **Tyche asset:** `scoring.ts` is the proven pattern (all-or-null components, zone bands, no advice
  language). A new screen is a new pure function following the same shape — no data plumbing needed if
  the inputs are already-fetched `FinancialStatement[]`.
- **First three steps:**
  1. `financial-terminal-reference` — pull the exact formula + the mislabel traps for the chosen
     screen (e.g. accruals ratio, Sloan) BEFORE coding. Do not derive the math here.
  2. `packages/analytics/src/scoring.ts` (or a new sibling module barrelled in
     `packages/analytics/src/index.ts`) — implement it all-or-null, with an educational-only docstring.
  3. Co-located `*.test.ts` — fixed input → hand-computed output (`toBeCloseTo(x,6)`) + degenerate-null
     cases.
- **Falsifiable milestone:** the new score matches a hand-worked example to 6 decimals and returns
  `null` (not `0`, not a guess) whenever any required line item is missing — asserted by a co-located
  test that runs green under `pnpm test`.

---

## Family B — Provenance-first research (reproducibility as a feature)

**The line:** every datum already carries `provider + providerMode + capability + retrievedAt +
freshness (+ cacheHit)`. No paid terminal exposes this. The frontier is to *use* that metadata for
things a black-box terminal structurally cannot: **provenance-aware diffing** and **reproducible
research snapshots**.

**Verify the assets:**
- The provenance shape lives in `packages/contracts/src/provenance.ts` (`DataProvenance`,
  `Envelope<T>`). Verify fields: `grep -n 'retrievedAt\|freshness\|cacheHit\|providerMode' packages/contracts/src/provenance.ts`.
- Provenance already rides into exports: `apps/web/src/modules/export.ts`
  (`provenanceCsvHeader`, `financialsToJson`). Verify: `grep -n 'provenanceCsvHeader' apps/web/src/modules/export.ts`.

### B1 — CANDIDATE: reproducible research snapshots
- **Shortfall:** an analyst who screenshots a paid terminal cannot prove *what the numbers were and
  where they came from* at a point in time; a compliance-minded or citation-minded researcher needs a
  reproducible record. Incumbents don't expose provenance at all.
- **Tyche asset:** every response is already an `Envelope<T>` with `retrievedAt` + `freshness`, and the
  export path already stamps provenance headers. A snapshot is the union of the envelopes behind a
  workspace, serialized with their provenance.
- **First three steps:**
  1. `packages/contracts/src/provenance.ts` — define a `ResearchSnapshot` schema (a list of
     `{capability, symbol, data, provenance}`) via the contracts-first recipe; register in `Schemas`.
  2. `apps/web/src/modules/export.ts` — add a snapshot serializer reusing `provenanceCsvHeader` /
     `financialsToJson` so every row keeps its `retrievedAt` + `provider`.
  3. A co-located test asserting round-trip: serialized snapshot re-parses under the Zod schema and
     preserves every provenance field.
- **Falsifiable milestone:** exporting a snapshot of a mock-mode workspace produces a file where every
  datum is paired with its `provider/mode/retrievedAt/freshness`, and re-importing it validates against
  the contract schema with zero dropped provenance fields. If any datum loses provenance, invariant #3
  is violated and the candidate fails.

### B2 — CANDIDATE: provenance-aware diffing
- **Shortfall:** "the number changed" is useless without "…because the source/mode/freshness changed."
  A paid terminal can't tell you *why* a figure moved between two pulls; it has no provenance to diff.
- **Tyche asset:** `retrievedAt`, `freshness`, `providerMode`, and `cacheHit` on every envelope make a
  meaningful diff possible — you can distinguish "value changed" from "same value, fresher pull" from
  "provider switched from mock to public."
- **First three steps:**
  1. `packages/analytics/src/` — add a pure `diffSnapshots(a, b)` module (no I/O; deterministic;
     barrel it in `index.ts`) that pairs data by `{capability, symbol}` and classifies each pair.
  2. `packages/contracts/src/provenance.ts` — model the diff-result shape if it crosses a boundary
     (only if surfaced via API; a pure-analytics diff stays contract-local).
  3. Co-located `*.test.ts` — fixtures for value-changed, freshness-changed, and provider-changed cases.
- **Falsifiable milestone:** given two snapshots of the same symbols, the diff classifies each field as
  `value-changed | freshness-changed | provider-changed | unchanged`, proven by a fixture covering all
  four — and is fully deterministic (no wall-clock; `Date.now(` count stays 0 in the module).

---

## Family C — Crypto-first KEYLESS depth (beat equity-first terminals where they're thin)

**The line:** equity-first terminals treat crypto as an afterthought; Tyche serves **live crypto
market structure keyless** — order book, trades, perp funding (Binance) and on-chain DEX pools
(Dexscreener) with zero keys. The frontier is **deeper on-chain / market-structure analytics** an
equity-first terminal does not ship.

**Verify the assets:**
- `packages/data-adapters/src/BinanceProvider.ts` serves `orderBook, trades, fundingRates` (keyless).
  Verify: `grep -n 'orderBook\|trades\|fundingRates' packages/data-adapters/src/BinanceProvider.ts`.
- `packages/data-adapters/src/DexscreenerProvider.ts` serves `dexPools` (keyless).
- These are *already-fetched* capabilities, so a new analytic over them is **pure** (Family-A rules).

### C1 — CANDIDATE: order-book / market-microstructure analytics
- **Shortfall:** a crypto-native researcher on a budget can't get depth-imbalance / liquidity-profile
  analytics without a specialist paid tool; an equity-first terminal doesn't ship them at all.
- **Tyche asset:** the `orderBook` and `trades` capabilities already deliver the raw book/prints
  keyless; the pure-analytics layer is the proven place to compute a descriptive microstructure
  readout (e.g. bid/ask depth imbalance, spread, liquidity-at-distance).
- **First three steps:**
  1. `financial-terminal-reference` — confirm the exact microstructure definitions and their
     degenerate/null cases (thin book, one-sided book) before coding.
  2. `packages/analytics/src/` — new pure module over the order-book / trades contract types, barrelled
     in `index.ts`; all-or-null on degenerate books, educational-only docstring.
  3. Wire into an existing crypto module in `apps/web/src/modules/` via `useMemo` (no new capability),
     plus a co-located analytics test.
- **Falsifiable milestone:** for a fixed order-book fixture the analytic returns the hand-computed depth
  imbalance and spread to 6 decimals, and returns `null` for a one-sided or empty book — asserted by a
  co-located test. If it fabricates a value for an empty book, it fails.

### C2 — CANDIDATE: perp-funding / basis analytics across the keyless universe
- **Shortfall:** funding-rate context (regime, percentile, cross-venue basis) is a paid-tool feature;
  equity-first terminals ignore perps entirely.
- **Tyche asset:** `fundingRates` is already a live keyless capability on Binance; historical candles
  are keyless too, so a descriptive funding-regime readout needs no new data plumbing.
- **First three steps:**
  1. `packages/analytics/src/` — pure module computing funding statistics (mean/percentile/regime band)
     from the `fundingRates` contract type; barrel in `index.ts`.
  2. Co-located `*.test.ts` with a fixed funding series → hand-computed percentile + null-on-empty.
  3. Surface in a crypto module in `apps/web/src/modules/` via `useMemo`; if a new command is needed,
     follow the module-wiring checklist (**tyche-vertical-slice-campaign** owns the executable recipe).
- **Falsifiable milestone:** the readout reproduces a hand-computed funding percentile for a fixed
  series and nulls cleanly on an empty series, proven by a co-located deterministic test.

---

## Family D — Open module/plugin SDK, conformance-gated (a third-party ecosystem)

**The line:** the module/provider SDK is open (Apache-2.0) and operator-installed provider plugins are
already **conformance-gated** — a plugin that fails its capability probes is *quarantined*, never
served. The frontier is turning that gate into a real **third-party capability ecosystem**: documented,
discoverable, safe-to-install community adapters and modules.

**Verify the assets:**
- The plugin host quarantines non-conformant plugins: `apps/api/src/plugins/PluginHost.ts` (+ its test
  asserting `status === 'quarantined'` when conformance fails). Verify:
  `grep -n 'quarantine\|conformance' apps/api/src/plugins/PluginHost.test.ts`.
- Plugins are local/installed only — Tyche never downloads code — and status is visible at
  `GET /api/plugins` (`apps/api/src/routes/health.ts`). Verify: `grep -n '/api/plugins' apps/api/src/routes/health.ts`.
- Conformant plugins slot ahead of the mock fallback via `registerBefore('mock', …)`
  (`packages/data-adapters/src/providerRegistry.ts`). The SDK contract is documented in `MODULE_SDK.md`
  and `DATA_PROVIDERS.md` ("Adding a provider" recipe).

### D1 — CANDIDATE: a documented, conformance-certified plugin authoring path
- **Shortfall:** a paid terminal's extension surface is closed or gatekept commercially. Tyche's is
  open and conformance-gated, but there is no self-serve "author a certified plugin" path, so the
  ecosystem can't grow beyond the core team.
- **Tyche asset:** `checkProviderConformance` (`packages/data-adapters/src/conformance.ts`) is the
  objective pass/fail gate; `PluginHost` already quarantines failures; `MODULE_SDK.md` documents the
  contract. The certification is *already computable* — it just isn't packaged for outsiders.
- **First three steps:**
  1. `MODULE_SDK.md` + `DATA_PROVIDERS.md` — write the "author a third-party adapter/module and prove
     it conformant" runbook (route this doc change through **tyche-change-control** + **tyche-docs-and-writing**).
  2. `packages/data-adapters/src/conformance.ts` — expose a standalone conformance-check entry a plugin
     author can run against their own adapter before submitting (reuse `checkProviderConformance`; do
     not weaken the probes).
  3. A fixture plugin under a test path that (a) passes conformance and registers, and (b) fails and is
     quarantined — mirroring the existing `PluginHost.test.ts` cases, proving the gate holds for
     third-party code.
- **Falsifiable milestone:** a documented external author can run one command that returns a green/red
  conformance verdict per declared capability, and a deliberately-malformed sample plugin is quarantined
  (never served) with a reason matching `/conformance/i`. If a non-conformant plugin can ever serve a
  route, the gate is broken and the candidate fails.

---

## Proposing a NEW frontier candidate

Add one only if you can fill all four fields with repo-grounded evidence:

- [ ] **Shortfall** names a *specific target user* and *why the incumbent/SOTA fails them* — not a
      vague "we could be better."
- [ ] **Tyche asset** points at a real file/dir you have verified exists (paste the `grep`/`ls`).
- [ ] **First three steps** are exact existing files/dirs in this repo, in order.
- [ ] **Falsifiable milestone** is checkable and could *disprove* the idea — includes the degenerate/null
      case, because "never fabricate a datum" is the house rule.
- [ ] It does not hit a **non-goal** (orders/brokerage, personalized advice, bundled/resold data,
      private-company/chat/expert-network data, latency-edge marketing). Confirm against
      **tyche-external-positioning**.
- [ ] Label it **OPEN** or **CANDIDATE**. It is not a fact and not approved until it clears
      **tyche-research-methodology** and is built through **tyche-change-control**.

---

## Provenance and maintenance

All facts below are **VOLATILE** — re-verify with the paired command before relying on them.
Date-stamped **2026-07-19**.

| Fact (as of 2026-07-19) | Re-verify with |
|---|---|
| `packages/analytics/src` has 22 barrelled pure modules incl. `scoring.ts`, `valuationHistory.ts`, `screen.ts`, `seasonality.ts`, `marketBeta.ts`, `performance.ts`, `eightK.ts` | `grep -c 'export \*' packages/analytics/src/index.ts` ; `ls packages/analytics/src/*.ts` |
| Forensic functions live in `scoring.ts` (`altmanZScore`, `piotroskiFScore`, `beneishMScore`, `fundamentalScorecard`) | `grep -n '^export function' packages/analytics/src/scoring.ts` |
| `ScreenField` today = `price, changePercent, marketCap, volume, sector, assetClass` (no forensic fields) — the A1 gap | `sed -n '13,21p' packages/contracts/src/screener.ts` |
| Screener plumbing = `applyScreen` in `packages/analytics/src/screen.ts` + `screener` capability | `grep -n 'applyScreen' packages/analytics/src/screen.ts` ; `grep -n 'screener' packages/contracts/src/provider.ts` |
| Free SEC fundamentals via keyless `SecEdgarProvider` over XBRL company-facts (`SEC_EDGAR_USER_AGENT` only) | `grep -n 'companyfacts\|fundamentals' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| Provenance shape (`retrievedAt`, `freshness`, `providerMode`, `cacheHit`) in `provenance.ts` | `grep -n 'retrievedAt\|freshness\|cacheHit\|providerMode' packages/contracts/src/provenance.ts` |
| Export path stamps provenance (`provenanceCsvHeader`, `financialsToJson`) | `grep -n 'provenanceCsvHeader\|financialsToJson' apps/web/src/modules/export.ts` |
| Binance keyless crypto depth = `orderBook, trades, fundingRates` | `grep -n 'orderBook\|trades\|fundingRates' packages/data-adapters/src/BinanceProvider.ts` |
| Dexscreener keyless `dexPools` | `grep -n 'dexPools' packages/data-adapters/src/DexscreenerProvider.ts` |
| Plugins conformance-gated / quarantined; visible at `GET /api/plugins`; slot via `registerBefore('mock',…)` | `grep -n 'quarantine\|conformance' apps/api/src/plugins/PluginHost.test.ts` ; `grep -n '/api/plugins' apps/api/src/routes/health.ts` ; `grep -n 'registerBefore' packages/data-adapters/src/providerRegistry.ts` |
| Conformance gate = `checkProviderConformance` | `grep -n 'checkProviderConformance' packages/data-adapters/src/conformance.ts` |
| 28 typed capability keys (docs may say "24" — DOC DRIFT; trust the code) | `grep -cE "^  '[a-zA-Z]+'," packages/contracts/src/provider.ts` |
| 60 commands in `DEFAULT_COMMANDS` (docs may say "41" — DOC DRIFT; trust the code) | `grep -c '^  cmd(' packages/terminal-kernel/src/commands.ts` |
| Non-goals (orders, advice, bundled data, private/chat data, latency marketing) | `sed -n '96,106p' ROADMAP.md` (and **tyche-external-positioning**) |
| SDK contract docs | `MODULE_SDK.md`, `DATA_PROVIDERS.md` ("Adding a provider") |

**Sibling skills referenced (verify present):** `ls .claude/skills/` — this skill cross-references
`tyche-research-methodology`, `tyche-external-positioning`, `financial-terminal-reference`,
`tyche-vertical-slice-campaign`, `tyche-proof-and-analysis-toolkit`, `tyche-architecture-contract`,
`tyche-docs-and-writing`, and `tyche-change-control`.

**Everything in the catalog is OPEN/CANDIDATE.** These are ambitions grounded in real assets, not
shipped features and not approved work. Advancing any of them changes system behavior — route it
through **tyche-change-control**, and prove it via **tyche-research-methodology**.
