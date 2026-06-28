# TKT-025 — Notes / research journal (local-first)

**Priority:** P2  ·  **Milestone:** M10  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/solo-operator-strategy.md:50-54` — "Research journal & notes → local-first, exportable, AI-groundable — a *Tyche-original* feature" and "AI copilot → grounded in the user's *local* workspace + notes". This ticket implements exactly that line item.
- `docs/research/godel/solo-operator-strategy.md:70-77` — solo-operator differentiators: **Ownership** ("your workspaces/notes/journal are local files you can grep, back up, and version") and **Inspectability** — the thesis this feature operationalizes.
- `docs/research/godel/solo-operator-strategy.md:82-84` — guardrails this ticket honors: no personalized advice, no reselling data, category-benchmark only (no Gödel UI/copy reproduced).

## Problem
`NotesModule.tsx` is a single-textarea CRUD list bound to a flat `Note` ({id, symbol, title, body, createdAt, updatedAt}) that today exists **only** in `apps/api/src/persistence/types.ts` — it is not a contract, not validated, and the body is treated as plain text. There is no markdown rendering, no way to browse all notes for a symbol, no export, and the copilot cannot reliably consume notes because the shape is untyped at the contract boundary. The "research journal" differentiator (the one thing a hosted closed SaaS structurally can't match — local files you own) is currently just a sticky-note widget. This ticket upgrades NOTE into a local-first, markdown, symbol-linked, exportable, AI-groundable journal — contracts-first and capability-free.

## User story
As a solo operator/analyst, I want to keep markdown research notes linked to the symbols I cover, browse and export them, and have the copilot ground its answers in them, so that my own analysis becomes a durable, inspectable, portable asset I own — not data I rent.

## Technical design
Contracts-first; provenance preserved; no new provider capability.
1. **Promote `Note` to a contract (`packages/contracts/src/notes.ts`, new).** Add `NoteSchema = z.object({ id, symbol: z.string().nullable(), title, body, tags: z.array(z.string()).default([]), pinned: z.boolean().default(false), createdAt, updatedAt })` and `NoteExportSchema` (a wrapper {version, exportedAt, notes: NoteSchema[]}). Export from `index.ts` and register in `schemas.ts` (`Note`, `NoteExport`). `body` stays a string but is documented as markdown.
2. **Re-point persistence to the contract type.** Replace the hand-rolled `interface Note` in `apps/api/src/persistence/types.ts` with `import type { Note } from '@tyche/contracts'` (z.infer); keep `PersistedState.notes: Note[]` and the `PersistenceStore` note methods. Bump `PERSISTENCE_VERSION` to `2` and add a migration in `FilePersistence.ts` that backfills `tags: []`/`pinned: false` on read so existing JSON stores load.
3. **Validate + extend routes (`apps/api/src/routes/user.ts`).** In `POST /api/notes`, replace the cast-and-default block with `NoteSchema.safeParse({ ...body, id, createdAt, updatedAt })` → 400 on failure (matching the existing watchlist/workspace pattern), and add an `audit.record({ action: 'note.save' })` line for parity. Add `GET /api/notes/export` returning `{ data: NoteExport, provenance: localProvenance('notes') }` and `POST /api/notes/import` (parse `NoteExportSchema`, upsert each via `saveNote`). All responses stay enveloped `{data, provenance}`.
4. **apiClient (`apps/web/src/providers/apiClient.ts`).** Drop the duplicated `ApiNote` interface in favor of the `Note` contract type; add `exportNotes()` and `importNotes(payload)` calls alongside `getNotes/saveNote/deleteNote`.
5. **NotesModule upgrade (`apps/web/src/modules/NotesModule.tsx`).** Render `body` as markdown (lightweight original renderer or an already-vendored md lib if present — no new heavy dep), keep the symbol prop linking (the `symbol ? 'Note about {symbol}' : ...` path already exists), add tag input + pin toggle, a "this symbol vs all notes" filter, and an Export/Import button pair wired to the new client calls (export downloads a JSON blob, mirroring `workspace/persistence.ts` export/import).

## Affected packages / apps
- `packages/contracts` — new `notes.ts` (`NoteSchema`, `NoteExportSchema`); `index.ts` + `schemas.ts` registration.
- `apps/api` — `persistence/types.ts` (use contract type, bump version), `persistence/FilePersistence.ts` (v1→v2 migration), `routes/user.ts` (validate notes + export/import endpoints, audit line).
- `apps/web` — `providers/apiClient.ts` (use contract type, add export/import), `modules/NotesModule.tsx` (markdown, tags, pin, filter, export/import).
- No `packages/data-adapters` or provider changes.

## Data contracts
New `packages/contracts/src/notes.ts`: `NoteSchema` (adds `tags: string[]` default `[]`, `pinned: boolean` default `false` to the existing {id, symbol, title, body, createdAt, updatedAt}) and `NoteExportSchema` ({version, exportedAt, notes}). Both registered in `Schemas`. The new fields default → existing persisted notes parse after migration; the API `Note` type becomes a single source of truth shared by api + web (removing the duplicated `apps/api` interface and `apiClient` `ApiNote`).

## Provider capabilities
**None required.** Notes are pure local persistence (`PersistenceStore.listNotes/saveNote/deleteNote`) tagged with `localProvenance('notes')` — never a market provider call. Works fully in **mock mode with no keys**; there is no BYO path because no external data is involved. Symbol linkage is a free-text string and does not require quote/search capability.

## UI / module behavior
- NOTE panel: markdown-rendered note list, symbol-scoped when opened as `AAPL NOTE`, all-notes view otherwise; new-note editor with title/body/tags and a pin toggle. Pinned notes sort first.
- Empty state: "No notes yet" (existing) becomes a `EmptyState` with a hint to write the first note; symbol-scoped empty reads "No notes for {symbol}".
- Error state: save/import failures surface an `ErrorState`/inline message; a malformed import file is rejected (Zod parse) without corrupting existing notes.
- Capability-gap: not applicable (no capability) — the panel always renders; it never crashes on an absent provider.
- Provenance: each note's source renders via `ProvenanceBadge` reading `localProvenance('notes')` (mode `local`), and the relative `updatedAt` continues to show (`formatRelativeTime`).

## Testing plan
- Contract — `packages/contracts/src/schemas.test.ts` (or `notes.test.ts`): `NoteSchema` applies `tags`/`pinned` defaults; round-trips a `NoteExport`; rejects a non-array `tags`.
- API — `apps/api/src/app.test.ts`: `POST /api/notes` 400s on invalid body and 200s with defaults applied; `GET /api/notes/export` returns enveloped `NoteExport`; `POST /api/notes/import` upserts and is idempotent on the same payload; `note.save` audit event recorded.
- Migration — `apps/api/src/persistence/FilePersistence.test.ts`: a v1 store with bare notes loads, backfills `tags:[]`/`pinned:false`, and reports `version: 2`.
- Unit (web) — `apps/web/src/modules/NotesModule.test.tsx`: renders markdown body, filters symbol-scoped vs all, pin sorts first, export triggers a download payload, import calls `api.importNotes`.
- e2e (`apps/web` Playwright): open `AAPL NOTE` against mock, write a markdown note, reload panel and assert it renders; export then re-import round-trips.

## Acceptance criteria
- [ ] `Note` is a Zod contract (`packages/contracts/src/notes.ts`) registered in `Schemas`; `apps/api` and `apiClient` consume the single contract type (duplicate interfaces removed).
- [ ] `POST /api/notes` validates with `NoteSchema` (400 on bad input) and records a `note.save` audit event; all note responses remain enveloped `{data, provenance}`.
- [ ] Export (`GET /api/notes/export`) and import (`POST /api/notes/import`) work end-to-end; import validates `NoteExportSchema` and never corrupts existing notes on malformed input.
- [ ] `PERSISTENCE_VERSION` bumped to 2 with a v1→v2 migration that backfills `tags`/`pinned`; old stores load cleanly.
- [ ] NOTE panel renders markdown, supports tags + pin + symbol filter, and exposes Export/Import; symbol-scoped empty/error states are graceful (no crash).
- [ ] Works in mock mode with no keys (no provider capability touched).
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built only from Tyche's own pieces: the existing `Note` persistence type, `PersistenceStore`, `localProvenance('notes')`, the enveloped-response pattern, and the workspace export/import flow already in `apps/web/src/workspace/persistence.ts`. A local-first markdown research journal is the **category benchmark** drawn from `solo-operator-strategy.md` as a Tyche-*original* differentiator — it is explicitly something the competitor does not occupy. No Gödel Terminal UI, copy, command documentation, layout, or trade dress is reproduced. Notes never leave the machine by default and the copilot's use of them stays grounded and no-advice.

## Non-goals
- Cloud sync, sharing, or multi-user notes — local-first only; nothing leaves the machine by default.
- Rich WYSIWYG editing, embedded charts, or attachments — markdown text body only.
- The copilot context-enrichment that consumes notes (`AINoteRef`) — owned by TKT-024; this ticket only makes the note shape contract-typed and groundable.
- Full-text search across notes or back-linking between notes — a later track.
- Any personalized advice, order placement, or reselling of data.
