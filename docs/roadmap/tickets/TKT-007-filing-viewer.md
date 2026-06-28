# TKT-007 — In-panel filing document viewer

**Priority:** P1  ·  **Milestone:** M2  ·  **Status:** proposed  ·  **Clean-room risk:** Med

## Source evidence
- Dossier: `docs/research/godel/workflow-teardown.md` §5 "SEC filings" — public pattern surfaces all SEC filings with **direct EDGAR links** and **documents rendered inside the workspace** (10-K/Q, 8-K, S-1, proxies, 13F). The Tyche translation names two tickets: `sec-edgar-provider` and `filing-viewer` (this ticket is the latter). Category-benchmark only.
- Dossier: `docs/research/godel/tyche-gap-analysis.md` — "the capability model is the right spine … every gap maps to a `ProviderCapability` + a `ModuleDefinition`"; this viewer maps to the existing `filings` capability and a new `filing-viewer` module.
- Sources: `docs/research/godel/sources.md` (T1 official command reference) frames `CF`/filings as part of the company-analysis command set; in-panel document rendering is the feature class, not any reproduced UI.

## Problem
`FilingsModule` (`apps/web/src/modules/FilingsModule.tsx`) lists filings in a `DataTable` (Form / Title / Filed) but rows are inert: a user cannot open a filing's document. `Filing` (`packages/contracts/src/filings.ts`) already carries an optional `url` (EDGAR link) and a `documents: FilingDocument[]` array, but nothing consumes them. There is no way to read a 10-K/8-K without leaving the workspace, which breaks the single-name deep-dive flow.

## User story
As a solo operator, I want to click a filing row and read the underlying EDGAR document inside a workspace panel (with its provenance and source link), so that I can review a 10-K/8-K without leaving Tyche or trusting an unverified embed.

## Technical design
Contracts-first, capability-respecting, no new provider method required:
1. New module component `apps/web/src/modules/FilingViewerModule.tsx` (moduleId `filing-viewer`). Reads the target filing from `state` (passed via `openPanel`): `state.filingUrl`, `state.filingForm`, `state.filingTitle`, `state.accessionNumber`, plus the originating `provenance`. Renders the document via a **sandboxed iframe** (`sandbox` with no `allow-same-origin`/`allow-scripts`, `referrerPolicy="no-referrer"`) pointing at the EDGAR `url`; if the URL is absent (mock mode — `MockProvider.getFilings` emits `documents` and `accessionNumber` but no `url`), render `EmptyState` with a "no document URL for this filing" message and the form/accession metadata.
2. Register the component in `apps/web/src/modules/components.ts` (`'filing-viewer': FilingViewerModule`) so `apps/web/src/modules/registry.ts#buildDefinitions` derives a real (non-`BetaPlaceholder`) module from the new command.
3. Add a `CFV` command to `DEFAULT_COMMANDS` (`packages/terminal-kernel/src/commands.ts`): id `CFV`, aliases e.g. `FILDOC`, `moduleId: 'filing-viewer'`, `category: 'fundamentals'`, `requiredCapabilities: ['filings']`, `requiresInstrument: true`, `maturity: 'beta'` initially. This gives the module a kernel-backed identity (single source of truth) and a command-bar entry, while the primary trigger stays the row click.
4. Wire the row click in `FilingsModule.tsx`: add `onRowClick` to the existing `DataTable` (`packages/ui`) that calls `useWorkspaceStore().openPanel({ moduleId: 'filing-viewer', commandId: 'CFV', symbol, title: \`${f.form} ${symbol}\`, w, h, state: { filingUrl: f.url, filingForm: f.form, filingTitle: f.title, accessionNumber: f.accessionNumber, provenance } })`. `OpenPanelInput` (`apps/web/src/state/workspaceStore.ts`) already supports `state`; if `DataTable` lacks `onRowClick`, add the optional prop there.
5. Provenance footer: the viewer calls `reportProvenance` (from `ModulePanelProps`) with the provenance carried in `state`, so `PanelHost`/`PanelFrame` render the existing `ProvenanceBadge`/`FreshnessBadge` — no fresh fetch needed since the document is the provider's link, not a Tyche API payload.

## Affected packages / apps
- `apps/web` — `src/modules/FilingViewerModule.tsx` (new), `src/modules/FilingsModule.tsx` (row click), `src/modules/components.ts` (registration).
- `packages/terminal-kernel` — `src/commands.ts` (new `CFV` command).
- `packages/ui` — `DataTable` only if an `onRowClick` prop must be added.
- `packages/contracts` — consumed only (`Filing.url`, `FilingDocument`); no change expected.

## Data contracts
No new Zod schemas. Reuses `Filing` / `FilingDocument` (`packages/contracts/src/filings.ts`) — `url` and `documents` already exist. Panel `state` keys (`filingUrl`, `filingForm`, `filingTitle`, `accessionNumber`, `provenance`) are untyped `PanelStateData` (`packages/module-sdk/src/PanelState.ts`), consistent with other modules. If a typed payload is preferred later, that is a follow-up — not this ticket.

## Provider capabilities
Required: `filings` (already gating `CF`). No new `ProviderCapability` key. Works in **mock mode** (panel opens, shows the EmptyState because `MockProvider` supplies no `url`) and in **BYO mode** once a real filings provider (e.g. the separate `sec-edgar-provider` ticket) returns EDGAR `url`s. No keys required for mock.

## UI / module behavior
- Trigger: click a row in `FilingsModule`; secondary trigger: `CFV` command.
- Loaded with a `url`: sandboxed iframe renders the EDGAR document; a header row shows form + accession + an external "Open on SEC.gov" link (`rel="noopener noreferrer"`).
- No `url` (mock / pre-EDGAR): `EmptyState` ("Document URL not available for this filing") with form/accession metadata — never crashes.
- Capability gap (`filings` missing): `EmptyState` via the existing `missingCapabilities` path, same as `FilingsModule`.
- iframe load failure / blocked content: `ErrorState` with a "could not load document — open externally" fallback link.
- Provenance: footer badge driven by `reportProvenance(state.provenance)`.

## Testing plan
- Unit (`apps/web/src/modules/FilingViewerModule.test.tsx`, new): renders sandboxed iframe when `state.filingUrl` is set; renders `EmptyState` when absent; renders `ErrorState` on iframe error; asserts `sandbox` and `referrerPolicy` attributes are present.
- Unit (`apps/web/src/modules/FilingsModule.test.tsx`): clicking a row calls `openPanel` with `moduleId: 'filing-viewer'` and the filing's `url` in `state`.
- Kernel (`packages/terminal-kernel/src/registry.test.ts` / command surface): `CFV` parses, maps to `filing-viewer`, requires `filings`, and survives `validateCommandSurface`.
- Web registry (`apps/web/src/modules/registry.test.ts`): `filing-viewer` resolves to `FilingViewerModule`, not `BetaPlaceholder`.
- e2e (`apps/web` Playwright, filings flow): `AAPL CF` → click a filing row → viewer panel opens with provenance footer and EmptyState in mock mode.

## Acceptance criteria
- [ ] Clicking a filing row in `FilingsModule` opens a `filing-viewer` panel carrying the filing `url`/metadata/provenance in `state`.
- [ ] Viewer renders a sandboxed iframe (no `allow-same-origin`+`allow-scripts`, `referrerPolicy="no-referrer"`, external link `rel="noopener noreferrer"`) when a `url` is present.
- [ ] In mock mode (no `url`) the panel renders `EmptyState` and never crashes; missing `filings` capability renders the capability-gap `EmptyState`.
- [ ] Provenance footer shows via `reportProvenance`; `CFV` command exists and is covered by command-surface tests.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are all green.

## Clean-room notes
Original implementation built solely from Tyche's own `FilingsModule`, `workspaceStore.openPanel`, `DataTable`, and `Filing`/`FilingDocument` contracts. The "in-panel document viewer" is treated as a feature *category* benchmarked from public descriptions only; no Gödel Terminal UI, layout, copy, command-doc text, or code is reproduced. EDGAR is a public SEC system; only public document URLs are embedded, via a sandboxed iframe under Tyche's own chrome.

## Non-goals
- No filings *provider* implementation — real EDGAR URLs depend on the separate `sec-edgar-provider` ticket; this ticket only renders a `url` when present.
- No HTML scraping/sanitization-and-inline-render pipeline beyond the sandboxed iframe; no caching/offline copy of filings.
- No XBRL parsing, no line-item-to-filing linkage (that is `financials-export`), no filing search/filter changes to `FilingsModule`.
- No order placement and no personalized advice; viewer is read-only.
