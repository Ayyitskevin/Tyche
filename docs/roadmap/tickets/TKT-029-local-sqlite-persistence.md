# TKT-029 — Local SQLite persistence adapter

**Priority:** P2  ·  **Milestone:** M11  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-competitive-roadmap.md` — Milestone 11 ("Deployment / self-hosting hardening"): explicitly lists "SQLite persistence" under user value and `apps/api/src/persistence` (SQLite adapter) under code areas; DoD: "SQLite optional"; Risk: "native deps (better-sqlite3) — keep file store as default fallback."
- `docs/research/godel/sources.md` — Gödel positions as a hosted "financial terminal for modern research teams" ($996/seat). Self-hostable local persistence is a category-benchmark differentiator for Tyche's solo-operator stance, not a reproduction of any Gödel feature.

## Problem
`FilePersistence` (`apps/api/src/persistence/FilePersistence.ts`) reads the entire `tyche-db.json` document into memory and rewrites it atomically on every mutation. That is fine for a single operator but degrades as workspaces/notes/watchlists grow (whole-file rewrites, no concurrent writers, no indexed lookups). The `PersistenceStore` interface (`apps/api/src/persistence/types.ts`) was deliberately designed collection-oriented "so a SQLite/Postgres adapter can be added without touching routes." No such adapter exists yet, and there is no env switch to select one.

## User story
As a solo operator self-hosting Tyche, I want to optionally store my workspaces, watchlists, and notes in a local SQLite database instead of a single JSON file, so that my data survives growth and crashes with durable, indexed, transactional writes — while a no-dependency file store remains the zero-config default.

## Technical design
1. Add `better-sqlite3` (+ `@types/better-sqlite3`) to `apps/api/package.json` dependencies. Keep it lazily imported inside the adapter so a missing/unbuilt native dep never breaks file-store deployments.
2. New `apps/api/src/persistence/SqlitePersistence.ts` implementing `PersistenceStore` (all 13 methods incl. `init`, `snapshot`). Schema: tables `meta(version)`, `preferences(singleton row, json)`, `workspaces(id PK, json)`, `watchlists(id PK, json)`, `notes(id PK, symbol, json)`. Store each contract object as a validated JSON column (Zod `*Schema.parse` on read/write where a schema exists, mirroring `FilePersistence`'s `UserPreferencesSchema.parse`); index `notes.symbol`. `init()` creates tables if absent, seeds the same default state as `defaultState()` (default `wl_default` watchlist from `SEED_SYMBOLS`, `PERSISTENCE_VERSION` in `meta`). Wrap multi-row writes in transactions.
3. Extend `ApiConfig` in `apps/api/src/env.ts`: add `persistence: 'file' | 'sqlite'` driven by `TYCHE_PERSISTENCE` (default `'file'`). Add `TYCHE_SQLITE_PATH` (default `<dataDir>/tyche.db`).
4. In `apps/api/src/app.ts`, replace the hardcoded `new FilePersistence(config.dataDir)` selection with a small factory (`createPersistence(config)`) that returns `SqlitePersistence` when `config.persistence === 'sqlite'`, else `FilePersistence`. The `options.persistence` injection override (used by tests) stays. If SQLite is requested but the native module fails to load, log a warning and fall back to `FilePersistence` (honors the roadmap "keep file store as default fallback" risk note).
5. Update `.env.example` and the README env table to document `TYCHE_PERSISTENCE` / `TYCHE_SQLITE_PATH`.

## Affected packages / apps
- `apps/api` — `package.json`, `src/env.ts`, `src/app.ts`, new `src/persistence/SqlitePersistence.ts`, persistence factory, tests.
- Repo root — `.env.example`, README env table (docs only).
- No changes to `packages/*` (interface already supports this).

## Data contracts
None. No new or changed Zod types in `packages/contracts`. The adapter reuses existing contract schemas (`UserPreferencesSchema`, `Watchlist`, `Workspace`) and the local `Note`/`PersistedState`/`PERSISTENCE_VERSION` types in `persistence/types.ts`.

## Provider capabilities
None. Persistence is independent of `DataProvider` / `ProviderCapabilities`. Works identically in mock mode and BYO mode; no provider keys required.

## UI / module behavior
No UI changes in this ticket. Persistence is server-side; `apps/web` reaches it via the unchanged `/api/user/*` routes. Provenance is unaffected (envelope shape unchanged). Existing capability-gap EmptyState/ErrorState behavior in modules is untouched. (The `SETTINGS` v2 provider dashboard is a separate M11 ticket.)

## Testing plan
- New `apps/api/src/persistence/persistence.test.ts` — parity suite running the **same** assertions against both `new FilePersistence(dir)` and `new SqlitePersistence(path)` (parameterized `describe.each`): seed defaults, save/list/get/delete for workspaces·watchlists·notes, `savePreferences` round-trip, and `snapshot()` deep-equality after identical mutation sequences.
- `apps/api/src/persistence/SqlitePersistence.test.ts` — SQLite-specific: `init()` is idempotent, reopening the file restores state, version row written, `notes.symbol` index used.
- Extend `apps/api/src/app.test.ts` — `buildApp({ config: { persistence: 'sqlite', sqlitePath: <tmp> } })` boots and serves `/api/user/*`; assert fallback path when native module load is simulated to fail.
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e` stay green.

## Acceptance criteria
- [ ] `SqlitePersistence` implements every `PersistenceStore` method and passes the shared parity suite alongside `FilePersistence`.
- [ ] `TYCHE_PERSISTENCE=sqlite` selects SQLite; default/unset keeps `FilePersistence`; `options.persistence` injection still overrides both.
- [ ] SQLite load failure falls back to `FilePersistence` with a logged warning (no crash, mock-mode still boots with no keys).
- [ ] Reopening an existing `.db` restores all collections; `init()` is idempotent and seeds defaults only when empty.
- [ ] `.env.example` ↔ `env.ts` parity for the new vars; README env table updated.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` all pass.

## Clean-room notes
Original implementation against Tyche's own `PersistenceStore` interface and contract schemas. SQLite-as-self-host-option is a category benchmark drawn from generic deployment expectations, not from any Gödel artifact — Gödel is a hosted product and exposes no persistence layer to copy. No Gödel UI, copy, schema, or documentation is reproduced.

## Non-goals
- No Postgres/MySQL/remote adapter (SQLite + file only here).
- No data migration tool to move existing `tyche-db.json` into SQLite (manual re-import is acceptable for this ticket).
- No multi-user / multi-tenant model; still single-operator.
- No UI/provider-dashboard work (separate M11 ticket); no schema/contract changes.
