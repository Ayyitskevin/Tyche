# TKT-001 — CI pipeline (typecheck + test + build)

**Priority:** P0  ·  **Milestone:** M1  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Repo has **no `.github/workflows`** directory (verified: `.github/` absent at repo root) — no automated gate enforces the green build.
- `docs/research/godel/tyche-gap-analysis.md` (line 20): "**No CI** (typecheck/test/build gate) | Regressions land silently; 'green gate' not enforced | repo root, `.github/workflows` | M1 / `ci-hardening`".
- Root `package.json` already defines the gate scripts (`typecheck`, `test`, `build`) and pins `packageManager: pnpm@10.33.0`, `engines.node >=20.10.0`, and `pnpm.onlyBuiltDependencies: ["esbuild"]`.
- `playwright.config.ts` depends on an environment-provided Chromium (`TYCHE_CHROMIUM` / `/opt/pw-browsers/chromium`) and explicitly forbids `playwright install` — so e2e is not portable to stock CI runners.

## Problem
Nothing prevents a typecheck error, failing unit test, or broken Vite build from merging. Contributors must remember to run all three gates by hand. With strict TypeScript and a contracts-first model, a silent regression in `packages/contracts` can ripple across every app undetected until manual testing.

## User story
As a solo operator maintaining Tyche, I want every push and pull request to automatically run typecheck, tests, and the production build so that regressions are caught before merge and `main` stays releasable without manual checking.

## Technical design
1. Add `.github/workflows/ci.yml` triggered on `push` and `pull_request` (target `main`).
2. Single job `build-and-test` on `ubuntu-latest`:
   - `actions/checkout@v4`.
   - `pnpm/action-setup@v4` with `version: 10` (matches `packageManager: pnpm@10.33.0`).
   - `actions/setup-node@v4` with `node-version: 22` and `cache: pnpm` (satisfies `engines.node >=20.10.0`; seed pins Node 22).
   - `pnpm install --frozen-lockfile` (uses committed `pnpm-lock.yaml`; `onlyBuiltDependencies: ["esbuild"]` already permits the esbuild build script used by the Vite build).
   - `pnpm typecheck` → runs `pnpm -r run typecheck` across all workspace packages/apps.
   - `pnpm test` → `vitest run` (root `vitest.config.ts`).
   - `pnpm build` → `pnpm --filter @tyche/web build` (Vite, exercises esbuild).
3. Do **not** run `pnpm test:e2e`. Add a comment in the workflow and a note in `CONTRIBUTING.md` explaining Playwright e2e runs locally only because `playwright.config.ts` requires an environment-provided Chromium (`TYCHE_CHROMIUM`) and forbids `playwright install`.
4. No source/contract changes — this is infra only. The capability model and `Envelope`/provenance contracts are untouched.

## Affected packages / apps
- New: `.github/workflows/ci.yml`.
- Touched: `CONTRIBUTING.md` (document e2e-runs-locally rationale).
- Exercised transitively (no edits): all `packages/*` and `apps/*` via `-r` typecheck, `vitest run`, and `@tyche/web` build.

## Data contracts
None. No new or changed Zod types in `packages/contracts`.

## Provider capabilities
None required. The CI gate is provider-agnostic and runs in mock mode (no keys); it must not depend on any `ProviderCapability` key or external data provider.

## UI / module behavior
None. No runtime UI surface; no panel, empty/error, capability-gap, or provenance behavior changes. Existing `EmptyState`/`ErrorState` and `ProvenanceBadge`/`FreshnessBadge` paths are validated only indirectly by `pnpm test`/`pnpm build`.

## Testing plan
- The workflow itself is the deliverable; validate by running each step locally: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build` all succeed on a clean checkout.
- Confirm the workflow triggers and goes green on a throwaway PR; intentionally introduce a type error in `packages/contracts` to confirm the `typecheck` step fails the job (then revert).
- No new unit/contract/API test files; existing `vitest run` suite is the test gate. e2e (`tests/e2e/*`) is explicitly out of CI scope.

## Acceptance criteria
- [ ] `.github/workflows/ci.yml` exists and triggers on `push` and `pull_request`.
- [ ] Job uses Node 22 and pnpm 10, installs with `--frozen-lockfile`, and `esbuild` builds via `onlyBuiltDependencies`.
- [ ] Steps run in order: `pnpm typecheck`, `pnpm test`, `pnpm build`; any failure fails the job.
- [ ] Playwright e2e is excluded, with the local-only rationale documented in the workflow and `CONTRIBUTING.md`.
- [ ] A passing run is green; an injected type error makes the run red.
- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` remain green on `main`.

## Clean-room notes
Original implementation: a standard GitHub Actions workflow built only from this repo's own scripts (`package.json`) and config (`pnpm-workspace.yaml`, `playwright.config.ts`). No Gödel Terminal UI, copy, configuration, or documentation is referenced or reproduced; the gap-analysis dossier is used only as a category benchmark to justify the work, not as a source of implementation.

## Non-goals
- No lint/format gate (`prettier --check`), coverage thresholds, or caching tuning beyond pnpm cache.
- No deploy/publish, release automation, or container build.
- No Playwright/e2e in CI, no matrix across OS/Node versions, no branch-protection or required-status configuration (repo-admin task, separate).
