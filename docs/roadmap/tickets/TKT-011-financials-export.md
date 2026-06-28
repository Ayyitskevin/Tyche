# TKT-011 — Financials export (CSV/JSON) with provenance

**Priority:** P1  ·  **Milestone:** M4  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Source: https://godelterminal.com/docs/commands/fa — public `FA` command surfaces income/balance/cash-flow statements with Q/Y toggle and an export (Excel/JSON) affordance. Category-benchmark only; cited for the *feature class* "exportable standardized financials", not any reproduced UI or copy.
- Dossier: `docs/research/godel/workflow-teardown.md` §6 "Financial-statement export" — names the Tyche translation explicitly: "Tyche already stamps provenance; exports should embed it. Ticket `financials-export`." This ticket implements that.
- Dossier: `docs/research/godel/tyche-gap-analysis.md` — gap row "Financials export (Excel/CSV/JSON + provenance)" → `apps/web` FA + `ui`, capability `fundamentals`, size S, "M4 / `financials-export`".
- Dossier: `docs/research/godel/command-taxonomy.md` §"FA" / §"Export" and `command-taxonomy.json#FA.exportBehavior` confirm export is part of the `FA` feature class (export Excel/JSON).

## Problem
`FinancialsModule` (`apps/web/src/modules/FinancialsModule.tsx`) renders standardized income/balance/cash-flow statements from `FinancialStatement[]` (`packages/contracts/src/fundamentals.ts`) with provenance already wired via `useReportProvenance`. But the matrix a user has on screen cannot leave the app: there is no way to pull statements into a spreadsheet or a JSON pipeline. `HistoryTableModule` (`apps/web/src/modules/HistoryTableModule.tsx`) already solves the same shape for candles (`toCsv` + Blob download), so the gap is a concrete, copyable internal pattern — but the financials export must additionally carry provenance, which the history export does not.

## User story
As a solo operator, I want to export the financial-statement matrix I'm viewing as CSV or JSON with a provenance header, so that I can drop standardized numbers into a model or share them while preserving where the data came from and how fresh it is.

## Technical design
Contracts-light, capability-respecting, reuse the existing in-app download pattern; no new provider method.
1. New shared, pure helper module `apps/web/src/modules/export.ts` (web-app utility, framework-free, unit-testable):
   - `financialsToCsv(statements: FinancialStatement[], type: StatementType, provenance: DataProvenance | null): string` — pivots line items to rows × fiscal periods (columns), matching the on-screen matrix in `FinancialsModule` (metric label per row, `fiscalYear ?? fiscalDate.slice(0,4)` per column, value pulled by `li.key`). Prepends commented provenance header lines (`# provider=…`, `# providerMode=…`, `# capability=fundamentals`, `# retrievedAt=…`, `# freshness.tier=…`, `# asOf=…`) so the CSV is self-describing. CSV-escape labels (quote + double inner quotes) since labels can contain commas.
   - `financialsToJson(statements, type, provenance): string` — `JSON.stringify({ provenance, statements: filtered }, null, 2)`; the JSON embeds the full `DataProvenance` object rather than a flattened header.
   - `downloadText(filename, mime, contents)` — extract the Blob/`URL.createObjectURL`/anchor-click/`revokeObjectURL` dance currently inlined in `HistoryTableModule.download`. Reusing this keeps one download codepath.
2. Refactor `HistoryTableModule.download` to call the shared `downloadText` (its `toCsv` stays local; no behavior change). This is the "reuse the HistoryTable CSV pattern" step — promote the mechanism, don't duplicate it.
3. In `FinancialsModule.tsx`, add an export control to the existing toolbar header row (alongside the Income/Balance/Cash Flow toggle), gated on `financials.data` being present (same guard pattern as `HistoryTableModule`'s `history.data &&`). Two buttons "CSV" / "JSON" (or one button + small menu) that call `financialsToCsv/Json(statements, type, financials.provenance)` then `downloadText` with filenames `${symbol}-${type}-financials.csv|json`. Use the same neutral button styling already in the file (`border-zinc-700 … hover:bg-zinc-800`).
4. Export reflects the currently selected `type` (income/balance/cash_flow) and the `period: 'annual'` already fetched; no extra fetch. Provenance passed is the live `financials.provenance` from `useApiData`.

## Affected packages / apps
- `apps/web` — `src/modules/export.ts` (new), `src/modules/FinancialsModule.tsx` (export buttons), `src/modules/HistoryTableModule.tsx` (refactor to shared `downloadText`).
- No changes to `apps/api`, `packages/terminal-kernel`, `packages/data-adapters`, or `packages/ui` (the export is client-side over an already-fetched envelope).

## Data contracts
No new or changed Zod types. Consumes existing `FinancialStatement` / `StatementLineItem` / `StatementType` (`packages/contracts/src/fundamentals.ts`) and `DataProvenance` (`packages/contracts/src/provenance.ts`). The provenance header/JSON is a serialization of the existing `DataProvenance`, not a new contract.

## Provider capabilities
Required: `fundamentals` (already gating `FA`/`FinancialsModule`). No new `ProviderCapability` key. Works in **mock mode**: `MockProvider` already returns `financials`, so export produces real CSV/JSON with `providerMode: 'mock'` / `freshness.tier: 'mock'` in the header — no keys needed. In **BYO mode** the same code embeds the real provider's provenance. Capability gap (`fundamentals` missing) means no `financials.data`, so the export buttons never render — consistent with the existing `EmptyState` path.

## UI / module behavior
- Export buttons appear only when statements have loaded (`financials.data` truthy); hidden during loading/empty/error/capability-gap, so there is nothing to export-on-nothing.
- The empty/error/capability-gap states are unchanged (`ModuleBody` + `missingCapabilities`), so capability gaps still render the graceful `EmptyState` and never crash.
- Exported file always begins with provenance (CSV: commented `# …` header lines; JSON: top-level `provenance` object), satisfying the "provenance on every output" constraint for derived artifacts.
- On-panel provenance display (`ProvenanceBadge`/`FreshnessBadge` via `reportProvenance`) is unchanged.

## Testing plan
- Unit (`apps/web/src/modules/export.test.ts`, new): `financialsToCsv` pivots line items to period columns, escapes labels containing commas, and emits the provenance header lines; `financialsToJson` parses back to `{ provenance, statements }` with the selected `type` only; both handle `provenance: null` (mock-less) without throwing.
- Unit (`apps/web/src/modules/FinancialsModule.test.tsx`): export buttons render only when data is present; clicking triggers `downloadText` (mock the helper / `URL.createObjectURL`) with the expected filename and selected `type`.
- Unit (`apps/web/src/modules/HistoryTableModule.test.tsx`): existing CSV download still works after refactor to shared `downloadText` (no regression).
- e2e (`apps/web` Playwright, financials flow): `AAPL FA` → toggle a statement type → click CSV/JSON; assert a download is triggered (Playwright `waitForEvent('download')`) and the suggested filename matches `${symbol}-${type}-financials.*`.

## Acceptance criteria
- [ ] `FinancialsModule` shows CSV and JSON export controls only when statement data is loaded; they export the currently selected statement type.
- [ ] Exported CSV begins with provenance header lines and JSON embeds a top-level `provenance` object; both reflect the live `financials.provenance` (or degrade gracefully when `null`).
- [ ] The download mechanism is shared (`downloadText`) and reused by both `FinancialsModule` and the refactored `HistoryTableModule`; no duplicated Blob/anchor code.
- [ ] Mock mode works with no API keys (export yields valid CSV/JSON stamped `providerMode: mock`); missing `fundamentals` capability hides the buttons and keeps the `EmptyState`.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are all green.

## Clean-room notes
Original implementation built only from Tyche's own `FinancialsModule`, `HistoryTableModule.toCsv`/download pattern, and the `FinancialStatement`/`DataProvenance` contracts. "Exportable standardized financials" is treated as a feature *category* benchmarked from public command descriptions only; no Gödel Terminal UI, layout, copy, command-doc text, export file format, or code is reproduced. The provenance-embedded export is a Tyche-original extension (the benchmarked product does not stamp provenance into exports per the dossier).

## Non-goals
- No Excel (`.xlsx`) or PDF export — CSV + JSON only this ticket (xlsx/PDF can be a follow-up); no server-side export endpoint.
- No quarterly/TTM period selector or estimates/ownership export (this ticket covers the annual income/balance/cash-flow statements already on screen).
- No "line-item → source filing" linkage (tracked separately in `workflow-teardown.md` §6).
- No new provider, no `apps/api` route, no contract changes, and no order placement or personalized advice.
