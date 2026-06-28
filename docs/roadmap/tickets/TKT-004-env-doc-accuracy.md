# TKT-004 — Align env/docs (WEB_ORIGIN/CORS, README table)

**Priority:** P0  ·  **Milestone:** M1  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Foundation self-review finding (HIGH): `WEB_ORIGIN` is documented as the CORS allow-list, but `apps/api/src/app.ts` registers `@fastify/cors` with `origin: true` (reflect any origin). The only consumer of `config.webOrigin` is the SSE handler `apps/api/src/routes/stream.ts:25` (`'Access-Control-Allow-Origin': ctx.config.webOrigin`). So the documented control does not govern the normal REST surface.
- Foundation self-review finding (MEDIUM): the README "Configuration" table (`README.md:112–119`) omits `API_HOST`, `WEB_ORIGIN`, `TYCHE_AUTH_TOKEN`, `AI_API_KEY`, and `AI_MODEL` — all real keys read by `apps/api/src/env.ts:30–44`.
- Foundation self-review finding (MEDIUM): `.env.example:29–32` documents `YAHOO_ENABLED`, `SEC_EDGAR_USER_AGENT`, `FRED_API_KEY`, `CCXT_EXCHANGE`, but `apps/api/src/env.ts` reads none of them (the stub adapters in `packages/data-adapters/src/stubs/*` are disabled scaffolds). Self-hosters are misled into setting no-op vars.
- Dossier support: `docs/research/godel/tyche-gap-analysis.md` (P0 row, line 23) — "Docs/env drift (`WEB_ORIGIN` vs `origin:true`; missing `API_HOST`/`AI_*` in README; provider env vars documented but unread) … Misleads self-hosters … M1 / `env-doc-accuracy`". Sources index: `docs/research/godel/sources.md` (category-benchmark only).

## Problem
Three documentation/config inconsistencies make the local foundation untrustworthy for self-hosters. (1) `WEB_ORIGIN` reads like a security control ("CORS origin allowed to call the API") but only narrows the SSE stream's CORS header while the REST API reflects every origin via `origin: true`. (2) The README table is missing five env vars that `env.ts` actually honors, so the documented surface is incomplete. (3) `.env.example` advertises four provider credential vars that no code reads, implying live-data wiring that does not exist. None of this changes runtime behavior, but it erodes the "reliable local foundation" the milestone promises.

## User story
As a solo operator self-hosting Tyche, I want the env documentation and the example file to exactly match what the server reads (and how CORS actually behaves) so that I can configure the API correctly and not waste time on no-op variables.

## Technical design
Make code, docs, and `.env.example` mutually consistent. Contracts-first and the capability model are untouched (no `DataProvider` calls change). Concrete steps:
1. CORS truthfulness (`apps/api/src/app.ts:38–41`): change `cors` registration from `origin: true` to `origin: config.webOrigin` so REST CORS uses the same allow-list as SSE (`routes/stream.ts:25`). This makes `WEB_ORIGIN` a real, single CORS control across both surfaces. Keep `methods` unchanged. (Default `http://localhost:5173` keeps the web dev server working with no config.)
2. README table (`README.md:112–119`): add rows for `API_HOST` (`127.0.0.1`), `WEB_ORIGIN` (`http://localhost:5173`, "CORS origin allowed for REST + SSE"), `TYCHE_AUTH_TOKEN` (empty, "bearer token when auth enabled"), `AI_API_KEY` (empty), and `AI_MODEL` (empty). Defaults must match `env.ts:30–44` exactly.
3. `.env.example` provider creds (`.env.example:27–32`): either remove `YAHOO_ENABLED`/`SEC_EDGAR_USER_AGENT`/`FRED_API_KEY`/`CCXT_EXCHANGE`, or move them under a clearly-labeled `# --- Reserved for future provider adapters (NOT yet read by env.ts) ---` block. Preferred: label as reserved (the stubs in `packages/data-adapters/src/stubs/` reference these names) and point to `DATA_PROVIDERS.md`. Update the `WEB_ORIGIN` comment (`.env.example:10`) to say it controls CORS for both REST and SSE.
4. Cross-check: `TYCHE_AUTH_ENABLED`, `TYCHE_AUTH_TOKEN`, `TYCHE_DATA_DIR`, `TYCHE_PROVIDERS`, `API_HOST`, `API_PORT`, `VITE_API_BASE_URL`, `AI_PROVIDER/AI_API_KEY/AI_MODEL` appear identically in `env.ts`, README, and `.env.example`.

## Affected packages / apps
- `apps/api` — `src/app.ts` (CORS origin). No change to `env.ts` (it already reads the right keys).
- Repo root — `README.md` (Configuration table), `.env.example` (provider-cred labeling + WEB_ORIGIN comment). Optionally cross-link `DATA_PROVIDERS.md`.
- No changes to `packages/*`, `apps/web`, or any contract.

## Data contracts
None. `ApiConfig` in `apps/api/src/env.ts` already shapes the config; no new or changed Zod types in `packages/contracts`.

## Provider capabilities
None required. This touches no `ProviderCapability` key and no `DataProvider` call. Mock mode keeps working with zero keys; BYO providers are unaffected (the reserved vars remain inert until a future adapter ticket reads them).

## UI / module behavior
No UI change. Panels, empty/error/capability-gap states, and `ProvenanceBadge`/`FreshnessBadge` are untouched — this is config/doc plumbing, not provider data. The only observable runtime change is that a cross-origin REST request from an origin other than `WEB_ORIGIN` is now rejected by CORS (matching prior SSE behavior); the default dev origin is unaffected.

## Testing plan
- API (`apps/api/src/app.test.ts` or a new `cors.test.ts`): inject `buildApp({ config: { webOrigin: 'http://localhost:5173' } })`; assert a request with `Origin: http://localhost:5173` returns `access-control-allow-origin: http://localhost:5173`, and a disallowed origin does not get a reflected allow-origin header.
- Unit (`apps/api/src/env.test.ts` if present, else add): assert `loadConfig` reads `API_HOST`/`WEB_ORIGIN`/`AI_*`/`TYCHE_AUTH_TOKEN` (guards against future README/env drift).
- Docs: a lightweight check (manual or a root script test) that every `env.*` key read in `env.ts` appears in both README table and `.env.example`.
- e2e: confirm `pnpm test:e2e` still passes with the default `WEB_ORIGIN` (web dev server origin unchanged).

## Acceptance criteria
- [ ] `apps/api/src/app.ts` registers CORS with `origin: config.webOrigin` (REST and SSE share one allow-list).
- [ ] README Configuration table includes `API_HOST`, `WEB_ORIGIN`, `TYCHE_AUTH_TOKEN`, `AI_API_KEY`, `AI_MODEL` with defaults matching `env.ts`.
- [ ] `.env.example` provider-cred vars are either removed or clearly labeled as reserved/unread, and the `WEB_ORIGIN` comment states it controls REST + SSE CORS.
- [ ] Every env key read in `env.ts` is documented in both README and `.env.example`; no documented key is unread by code (except those explicitly labeled "reserved").
- [ ] A test asserts `WEB_ORIGIN` governs the REST `Access-Control-Allow-Origin` header.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation derived solely from Tyche's own `app.ts`, `env.ts`, `routes/stream.ts`, `README.md`, and `.env.example`. Competitive research is category-benchmark only (self-hostable config as a feature class); no Gödel Terminal UI, copy, code, or documentation is reproduced or referenced.

## Non-goals
- No new provider adapter or wiring of `YAHOO_ENABLED`/`SEC_EDGAR_USER_AGENT`/`FRED_API_KEY`/`CCXT_EXCHANGE` (those land with their respective adapter tickets, e.g. M2 `sec-edgar-provider`).
- No change to `ApiConfig` shape or new Zod env schema (validation hardening is a separate concern).
- No auth/security policy change beyond making CORS match its documentation.
- No multi-origin CORS list support (single `WEB_ORIGIN` only; revisit if multi-origin hosting is needed).
