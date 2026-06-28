# Tyche architecture gap analysis (vs. Gödel-class competitor)

Maps the research findings onto Tyche's **actual** codebase (audited: `packages/{contracts,
terminal-kernel,data-adapters,module-sdk,ui,analytics}`, `apps/{api,web}`). Each gap is classified
**P0** (blocks reliable local foundation) · **P1** (required for a credible Gödel-class competitor) ·
**P2** (solo-operator differentiator) · **P3** (later polish) · **X** (intentionally out of scope).

Clean-room risk is **Low** for every gap: Tyche reaches the *category* with original
contracts/UI/code and never reproduces Gödel's docs, copy, or layout. (AI is "Low–Med" only because
it must stay no-advice + grounded.)

Tickets referenced below live in [`../../roadmap/tickets/`](../../roadmap/tickets/).

## P0 — Foundation hardening (blocks a reliable local foundation)

These include the **actionable findings from the foundation self-review** (the merged v0.1 PR).

| Gap | Why it matters | Code areas | Complexity | Milestone / ticket |
| --- | --- | --- | --- | --- |
| **No CI** (typecheck/test/build gate) | Regressions land silently; "green gate" not enforced | repo root, `.github/workflows` | S | M1 / `ci-hardening` |
| **`toWorkspace()` overwrites `createdAt`** on each save | Corrupts audit trail; violates schema intent (API preserves it, web doesn't) | `apps/web/src/state/workspaceStore.ts` | S | M1 / `fix-workspace-createdat` |
| **Unsafe cast in workspace JSON import/deserialize** | Imported/`localStorage` workspaces bypass `WorkspaceSchema` → can corrupt state | `apps/web/src/workspace/persistence.ts` | S | M1 / `validate-workspace-json` |
| **Docs/env drift** (`WEB_ORIGIN` vs `origin:true`; missing `API_HOST`/`AI_*` in README; provider env vars documented but unread) | Misleads self-hosters | `apps/api/src/app.ts`, `env.ts`, `README.md`, `.env.example` | S | M1 / `env-doc-accuracy` |
| **No numeric constraints on price/qty contracts** | Lets NaN/negative slip into UI math | `packages/contracts/src/market.ts` | S | M1 / `command-registry-validation` (extends contract validation) |
| **Command registry validation depth** | Catch bad command/module metadata at boot | `packages/terminal-kernel`, `module-sdk` | S | M1 / `command-registry-validation` |

**Design note:** all P0 items are local, test-backable, and do not require any provider. They are the
content of **Milestone 1**.

## P1 — Required for a credible competitor

| Gap | Gödel evidence | Code areas | Data/provider | Complexity | Milestone / ticket |
| --- | --- | --- | --- | --- | --- |
| **Real SEC EDGAR adapter** (replace mock `CF`) | `CF` EDGAR, from inception [T1] | `data-adapters` (new `SecEdgarProvider` impl), `api` | filings (public, UA header) | M | M2 / `sec-edgar-provider` |
| **Filing document viewer** | filings render in workspace [T1] | `apps/web/src/modules`, `ui` | filings | M | M2 / `filing-viewer` |
| **Quote monitor v2** (latency col, scale, columns) | `QM` ≤400, latency [T1] | `apps/web` QM, `ui/DataTable` | quotes/batch | M | M3 / `quote-monitor-v2` |
| **Watchlist tabs** (multiple named lists) | named lists [T1] | `apps/web`, `contracts/portfolio`, `api/persistence` | quotes | M | M3 / `watchlist-tabs` |
| **Batch import** | QM batch import [T1] | `apps/web` QM | search | S | M3 / `batch-import` |
| **Financials export** (Excel/CSV/JSON + provenance) | `FA` export [T1] | `apps/web` FA, `ui` | fundamentals | S | M4 / `financials-export` |
| **News filters + global TOP** | `N` filters, `TOP` [T1] | `contracts/news`, `api`, `apps/web` | news | M | M5 / `news-filters` |
| **Alert rules** (rule eval on stream) | alerts-adjacent | `contracts/alerts`, `api/stream`, `apps/web` | quotes/news | M | M5 / `alert-rules` |
| **Options chain UI** (data already in mock) | `OMON` [T1] | `apps/web`, `contracts/options` | options | M | M6 / `options-chain-mock-contract` |
| **Time & sales tape** (data already in mock) | `TAS` [T1] | `apps/web`, `api/stream` | trades | M | M6 / `tas-stream-contract` |
| **Estimates / Earnings / Ratings / Holders modules** | `EM/ERN/ANR/HDS` [T1] | `apps/web`, `contracts/fundamentals` | estimates/ratings/ownership | M | M7 / `estimates-contract`, `ratings-contract`, `holders-contract` |
| **AI context packet v2** (workspace + notes grounding, citations) | "AI Analyst" roadmap [T3] | `contracts/ai`, `api/ai`, `apps/web` | optional model | M | M9 / `ai-context-packet-v2` |

## P2 — Solo-operator differentiators

| Gap | Rationale | Code areas | Complexity | Milestone / ticket |
| --- | --- | --- | --- | --- |
| **FOCUS single-quote panel** | fast single-name watch | `apps/web` | S | M3 / `keyboard-shortcut-parity` (bundle) |
| **Multi-security comparison (HMS-class)** | normalized overlay | `apps/web`, `analytics` | M | M8 / `multi-security-comparison` |
| **World indices board** | `WEI` | `apps/web` | S | M8 / `world-indices` |
| **Notes / research journal** (local-first) | Tyche-original differentiator | `contracts`, `api/persistence`, `apps/web` | M | M10 / `notes-research-journal` |
| **Portfolio (read-only, manual/import, NO broker)** | `PORT` minus execution | `contracts/portfolio`, `api`, `apps/web` | M | M10 / `portfolio-analytics` |
| **Provider capability dashboard + entitlement warnings** | transparency differentiator | `apps/web`, `data-adapters` | S | M11 / `provider-capability-dashboard`, `data-entitlement-warnings` |
| **Local SQLite persistence adapter** | scale beyond JSON file | `apps/api/src/persistence` | M | M11 / `local-sqlite-persistence` |
| **User preferences / default command / pinned cmds** | parity + ergonomics | `contracts/workspace`, `apps/web` | S | M3 / `user-preferences-defaults` |
| **Window manager: active-ticker link propagation** | Gödel color-sync | `apps/web/src/workspace` | M | M3 / `window-manager-improvements` |
| **Docs/source provenance surfacing** | trust differentiator | `apps/web`, `ui` | S | M5 / `docs-source-provenance` |

## P3 — Later polish

- Screener (`EQS`) over the local cache; index membership (`MEMB`); all-quotes (`ALLQ`); option
  pricer (`OVME`) via `@tyche/analytics`; financial calculator (`CALC`).
- Charting: candlesticks + SMA/EMA/RSI overlays + intraday (`GIP`-class).
- Durable audit-log sink; keyboard-shortcut customization UI.

## X — Intentionally out of scope (non-goals)

- **Brokerage linking / order placement** (Gödel `BROK`) — Tyche places no orders, period.
- **Private-company data**, **teams/org billing**, **community chat** (`CHAT`), **expert-network
  contacts DB** — not a research-terminal core; product/data-asset scope.
- **Latency-edge marketing** ("beat the market by 30s") — licensed-data-dependent and advice-adjacent.

## Cross-cutting architectural observations

1. **The capability model is the right spine.** Every gap above maps cleanly to an existing
   `ProviderCapability` + a `ModuleDefinition`. Adding a feature = implement capability in an adapter +
   add a module; no architectural rework needed. This validates ADR-0002/0003.
2. **Mock-first paid off.** Several P1 modules (options, trades, estimates, ratings, holders) are
   **data-ready** in `MockProvider` — only UI is missing — so they're cheaper than they look.
3. **Provenance is a moat.** Gödel's public materials don't emphasize per-datum provenance/freshness;
   Tyche does it everywhere. Keep extending (errors, exports, AI citations).
4. **The real competitive unlock is one real adapter.** Shipping **SEC EDGAR** (public, no key) turns
   Tyche from "mock demo" into "actually useful for filings research" — the highest-leverage P1.
