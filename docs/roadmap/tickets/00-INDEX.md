# Tyche implementation ticket backlog

30 clean-room implementation tickets derived from the
[Gödel research dossier](../../research/godel/) and the
[competitive roadmap](../../research/godel/tyche-competitive-roadmap.md). Each ticket is grounded in
real Tyche file paths/contracts and is **original implementation** (category benchmarking only — no
competitor UI/copy/docs reproduced). Status: all **proposed**.

| Ticket | Title | Prio | Milestone |
| --- | --- | :--: | :--: |
| [TKT-001](./TKT-001-ci-hardening.md) | CI pipeline (typecheck + test + build) | P0 | M1 |
| [TKT-002](./TKT-002-fix-workspace-createdat.md) | Preserve workspace `createdAt` on save | P0 | M1 |
| [TKT-003](./TKT-003-validate-workspace-json.md) | Validate imported/restored workspace JSON | P0 | M1 |
| [TKT-004](./TKT-004-env-doc-accuracy.md) | Align env/docs (CORS, README table) | P0 | M1 |
| [TKT-005](./TKT-005-command-registry-validation.md) | Deepen command/module/contract validation | P0 | M1 |
| [TKT-006](./TKT-006-sec-edgar-provider.md) | Real SEC EDGAR provider (filings) | P1 | M2 |
| [TKT-007](./TKT-007-filing-viewer.md) | In-panel filing document viewer | P1 | M2 |
| [TKT-008](./TKT-008-quote-monitor-v2.md) | Quote monitor v2 (columns, latency, scale) | P1 | M3 |
| [TKT-009](./TKT-009-watchlist-tabs.md) | Multiple named watchlist tabs | P1 | M3 |
| [TKT-010](./TKT-010-batch-import.md) | Batch import symbols into a watchlist | P1 | M3 |
| [TKT-011](./TKT-011-financials-export.md) | Financials export (CSV/JSON) with provenance | P1 | M4 |
| [TKT-012](./TKT-012-news-filters.md) | News filters + global TOP feed | P1 | M5 |
| [TKT-013](./TKT-013-alert-rules.md) | Alert rules on the quote stream | P1 | M5 |
| [TKT-014](./TKT-014-options-chain-mock-contract.md) | Options chain module + Greeks UI | P1 | M6 |
| [TKT-015](./TKT-015-tas-stream-contract.md) | Time & sales streaming tape | P1 | M6 |
| [TKT-016](./TKT-016-estimates-contract.md) | Estimates matrix (EM) module | P1 | M7 |
| [TKT-017](./TKT-017-ratings-contract.md) | Analyst ratings (ANR) module | P1 | M7 |
| [TKT-018](./TKT-018-holders-contract.md) | Institutional holders (HDS) module | P1 | M7 |
| [TKT-019](./TKT-019-multi-security-comparison.md) | Multi-security comparison (HMS-class) | P2 | M8 |
| [TKT-020](./TKT-020-world-indices.md) | World indices board (WEI) | P2 | M8 |
| [TKT-021](./TKT-021-user-preferences-defaults.md) | Preferences: default + pinned commands | P2 | M3 |
| [TKT-022](./TKT-022-keyboard-shortcut-parity.md) | Configurable keyboard shortcut parity | P2 | M3 |
| [TKT-023](./TKT-023-window-manager-improvements.md) | Link-group ticker sync + focus cycling | P2 | M3 |
| [TKT-024](./TKT-024-ai-context-packet-v2.md) | AI context packet v2 (citations) | P1 | M9 |
| [TKT-025](./TKT-025-notes-research-journal.md) | Notes / research journal (local-first) | P2 | M10 |
| [TKT-026](./TKT-026-provider-capability-dashboard.md) | Provider capability dashboard | P2 | M11 |
| [TKT-027](./TKT-027-data-entitlement-warnings.md) | Data entitlement / licensing warnings | P1 | M11 |
| [TKT-028](./TKT-028-docs-source-provenance.md) | Provenance on every panel + export | P2 | M5 |
| [TKT-029](./TKT-029-local-sqlite-persistence.md) | Local SQLite persistence adapter | P2 | M11 |
| [TKT-030](./TKT-030-portfolio-analytics.md) | Portfolio analytics (read-only, no broker) | P2 | M10 |

**Totals:** 5×P0 · 15×P1 · 10×P2. Build order follows the milestones; M1 is the foundation-hardening
gate (and absorbs the actionable findings from the v0.1 self-review).
