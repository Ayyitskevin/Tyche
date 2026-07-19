---
name: tyche-build-and-env
description: >-
  Recreate and run the Tyche build/dev environment from scratch, and the canonical
  pre-PR gate. Load this when: setting up the repo for the first time; "how do I build
  Tyche", "pnpm install fails", "frozen-lockfile error", "which Node/pnpm version",
  "corepack", "why is there no build step for the packages", "what is the full gate",
  "what does pnpm typecheck / pnpm test / pnpm build actually run", "typecheck 8/8",
  "vite build didn't catch a type error", "import type", "verbatimModuleSyntax",
  "noUncheckedIndexedAccess", "what are the strict TS flags", "CI check names",
  "verify vs e2e job", "reproduce CI locally", "how the Docker image is built",
  "node:22-alpine", "tsx", "release/GHCR image". This skill OWNS the toolchain
  versions, the gate command, the strict-TS flag list, CI check-run names, and Docker
  build mechanics. It does NOT cover running/operating the built server, triaging TS
  compile ERRORS, or the test layers themselves — see the sibling pointers below.
---

# Tyche — Build & Environment

Tyche is a pnpm-workspace TypeScript monorepo (a "financial research terminal"). This
skill gets you from a clean checkout to a green gate, and explains the traps unique to
this repo's **no-build-step** design.

**Jargon, defined once:**
- **Workspace member** — one package/app in the monorepo. There are **8** (6 libraries
  under `packages/`, 2 apps under `apps/`).
- **No-build library** — a package whose `main`/`types`/`exports` point at raw
  `./src/index.ts`. It is never compiled; consumers import its TypeScript source
  directly through the workspace link. 6 of the 8 members are like this.
- **The gate** — the four-command sequence that must pass before any PR. CI runs the
  same commands. Owned by this skill (see [The full gate](#the-full-gate)).
- **corepack** — the Node-bundled tool that installs the exact pinned pnpm version from
  `package.json`'s `packageManager` field. You do not `npm i -g pnpm`.

---

## When NOT to use this skill

| You want to… | Use this sibling instead |
| --- | --- |
| Run / start / deploy the built server, env vars for runtime, health checks | **tyche-run-and-operate** |
| Understand a specific `tsc` compile **error** and how to fix it as a symptom | **tyche-debugging-playbook** |
| Understand the test **layers** (unit vs contract vs API-smoke vs e2e), coverage, what to test | **tyche-validation-and-qa** |
| Configuration keys, feature flags, `.env` semantics | **tyche-config-and-flags** |
| Change schema/config/deploy or promote an experiment | **tyche-change-control** (mandatory route — never around it) |

This skill is the **source of truth** for toolchain versions, the gate command, the
strict-TS flag list, CI check-run names, and Docker build mechanics. Other skills
cross-reference here rather than restating those facts.

---

## 1. Prerequisites

| Tool | Required version | Why |
| --- | --- | --- |
| Node.js | `>=20.10.0` is the declared floor (`package.json` `engines.node`). **Use Node 22** — CI, the Dockerfile, and the release gate all pin Node 22, and **`node:sqlite` persistence requires Node 22** (it is a Node 22.x built-in). | 20.10 is the minimum that starts; 22 is the tested/canonical version. |
| pnpm | `10.33.0`, provisioned by corepack from the `packageManager` field. Do not install pnpm globally another way. | Lockfile + `pnpm/action-setup@v4` in CI both pin 10.33.0. |

> **Node floor vs. canonical (known doc ambiguity):** `engines.node` says `>=20.10.0`,
> but everything that actually runs Tyche (CI, Docker, release gate) uses Node 22, and
> SQLite persistence needs 22. Treat **Node 22** as the supported version; treat 20.10
> as "will install and typecheck" only. Do not develop persistence features on Node 20.

**Enable the pinned pnpm:**
```bash
corepack enable          # once per machine; makes `pnpm` resolve to the pinned version
node --version           # expect v22.x
pnpm --version           # expect 10.33.0 (corepack reads packageManager from package.json)
```

---

## 2. First-time setup (clean checkout → ready)

```bash
cd /home/user/Tyche
pnpm install --frozen-lockfile   # exact lockfile; fails if pnpm-lock.yaml is stale
```

- `--frozen-lockfile` is what CI and Docker use. Use it locally too so you catch a
  drifted lockfile the same way CI would. A plain `pnpm install` (as CONTRIBUTING's
  quick-start shows) will *rewrite* the lockfile if it drifted — fine for local
  exploration, wrong for reproducing CI.
- **`onlyBuiltDependencies: ["esbuild"]`** (`package.json`): pnpm blocks postinstall
  build scripts for every dependency **except esbuild**. If you add a dependency that
  needs a native/postinstall build, its install script is blocked until you add it to
  this array — otherwise the package silently ships unbuilt. (This is also a
  supply-chain guard; adding to the array is a change — route through
  **tyche-change-control**.)
- Workspace resolution is set in `.npmrc`: `link-workspace-packages=true`,
  `prefer-workspace-packages=true`, `auto-install-peers=true`,
  `strict-peer-dependencies=false`. This is why `@tyche/*` imports resolve to local
  `src/` without any build.

**Start the dev servers:**
```bash
pnpm dev        # API on :4010 + web on :5173, in parallel, mock mode (no keys needed)
pnpm dev:api    # API only  (tsx watch — runs TypeScript directly, no compile)
pnpm dev:web    # web only  (vite dev server)
```
(Runtime env vars and what "mock mode" means: **tyche-config-and-flags** /
**tyche-run-and-operate**.)

---

## 3. The no-build-step model (read this before you look for a `dist/`)

There is **no compile step for the 6 libraries and no compile step for the API.** Only
the **web** app produces a build artifact.

| Member | Path | `build` script? | How it ships |
| --- | --- | --- | --- |
| `@tyche/analytics` | packages/analytics | no | raw `src/index.ts` |
| `@tyche/contracts` | packages/contracts | no | raw `src/index.ts` |
| `@tyche/data-adapters` | packages/data-adapters | no | raw `src/index.ts` |
| `@tyche/module-sdk` | packages/module-sdk | no | raw `src/index.ts` |
| `@tyche/terminal-kernel` | packages/terminal-kernel | no | raw `src/index.ts` |
| `@tyche/ui` | packages/ui | no | raw `src/index.ts` |
| `@tyche/api` | apps/api | no | run via **tsx** (`tsx src/index.ts`), TypeScript executed directly |
| `@tyche/web` | apps/web | **yes** (`vite build`) | the only production bundle |

Consequences:
- Every one of the 8 members has a `typecheck` script (`tsc --noEmit`) and nothing
  else compiles. Typecheck is your **only** static safety net for the 7 non-web members.
- `pnpm build` builds **web only** — it says nothing about whether `packages/*` or the
  API typecheck. You must run `pnpm typecheck` separately (see the gate).
- The API runs from source in every environment (dev = `tsx watch`, prod =
  `tsx src/index.ts`). There is no `apps/api/dist`.

---

## 4. The full gate

**The canonical pre-PR gate command (this skill owns it — everyone else points here):**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```

Run all four before opening a PR. CI runs the same four (across two jobs). What each
one *actually* expands to:

| Gate step | Root script is literally… | What it does | Pass signal |
| --- | --- | --- | --- |
| `pnpm typecheck` | `pnpm -r run typecheck` | Fans out to **all 8 members**, each running `tsc --noEmit`. `pnpm typecheck` and `pnpm -r typecheck` are the **same command**. | 8/8 members "Done", zero errors ("typecheck 8/8"). |
| `pnpm test` | `vitest run` | A **single root vitest process** collecting `packages/**` + `apps/**` `*.test.ts` (unit / contract / API-smoke, Node env). NOT a per-member fan-out — **no member has a `test` script**. Equivalent to `npx vitest run` from the repo root. | vitest green. |
| `pnpm build` | `pnpm --filter @tyche/web build` → `vite build` | Builds **only** the web production bundle. | vite build succeeds. |
| `pnpm test:e2e` | `playwright test` | Playwright Chromium browser smoke suite. Run when the change touches UI; CI always runs it in a separate job. | Playwright green. |

### The trap that bites everyone: `vite build` does NOT typecheck

`apps/web`'s build script is exactly `vite build` — **not** `tsc && vite build`. Vite
transpiles and drops types; it will happily build code that `tsc --noEmit` would reject.
**A green `pnpm build` does not mean the types are sound.** `pnpm typecheck` is the step
that enforces types. Never substitute one for the other, and never skip typecheck
because "the build passed."

For diagnosing a specific type error the gate surfaces, hand off to
**tyche-debugging-playbook**. For what each test layer covers, **tyche-validation-and-qa**.

### Reproduce CI exactly, locally

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build   # == the CI `verify` job
pnpm test:e2e                               # == the CI `e2e` job (installs its own Chromium in CI)
```

> **Do not trust any hard-coded test count.** Docs mention figures like "~520+ tests" /
> "66 files / 535 cases", and repo docs elsewhere have known drift. If you need a real
> number, **recount**: `npx vitest run` and read the summary line.

---

## 5. The strict-TS flags (from `tsconfig.base.json`)

Every member extends `tsconfig.base.json`. These are the flags that make `tsc --noEmit`
reject code that compiles elsewhere. Know them so you write code that passes on the
first try. (Fixing the *errors* they raise is **tyche-debugging-playbook**; this is the
reference list of what's enabled.)

| Flag | Value | What it forces you to do |
| --- | --- | --- |
| `strict` | `true` | The full strict family (null checks, `any` discipline, etc.). |
| `noUncheckedIndexedAccess` | `true` | `arr[i]` / `obj[key]` is `T \| undefined` — guard or assert before use. |
| `noUnusedLocals` | `true` | No unused local variables. |
| `noUnusedParameters` | `true` | No unused function params (prefix with `_` to intentionally ignore). |
| `verbatimModuleSyntax` | `true` | Type-only imports **must** use `import type { … }`; a value import used only as a type is an error. |
| `noImplicitOverride` | `true` | Overriding a base method requires the `override` keyword. |
| `noFallthroughCasesInSwitch` | `true` | Every `case` must `break`/`return`/`throw` (or be empty). |
| `exactOptionalPropertyTypes` | **`false`** | The one strict-family flag left **OFF** — `{ x?: T }` still admits `x: undefined`. Do not assume it's on. |

Other base settings worth knowing: `module: ESNext`, `moduleResolution: Bundler`,
`isolatedModules: true`, `target/lib: ES2022`, `noEmit: true`, `skipLibCheck: true`.

---

## 6. CI ground truth (`.github/workflows/ci.yml`, workflow name **"CI"**)

Triggers: `push` to `main`, and every `pull_request`. Two jobs → **two check-runs** you
must get green: **`verify`** and **`e2e`**. Both `runs-on: ubuntu-latest`, both use
**pnpm 10.33.0** (`pnpm/action-setup@v4`) and **Node 22** (`actions/setup-node@v4`,
`cache: pnpm`), both install with `pnpm install --frozen-lockfile`.

**Check-run `verify`** — steps in order:
1. `actions/checkout@v4`
2. Install pnpm `10.33.0`
3. Setup Node `22` (cache pnpm)
4. `pnpm install --frozen-lockfile`
5. `pnpm typecheck`
6. `pnpm test`
7. `pnpm build`

**Check-run `e2e`** — steps in order:
1. checkout → pnpm `10.33.0` → Node `22` → `pnpm install --frozen-lockfile`
2. Resolve Playwright version (`node -p "require('@playwright/test/package.json').version"`)
3. Cache Chromium (`actions/cache@v4`, `~/.cache/ms-playwright`)
4. **Playwright installs its own Chromium** — `pnpm exec playwright install --with-deps chromium` on cache miss, or `playwright install-deps chromium` on cache hit
5. `pnpm test:e2e`
6. On failure: upload `playwright-report/` + `test-results/` (7-day retention)

**Release gate** (`.github/workflows/release.yml`, workflow name **"Release"**, on tag
`v*`): its **`gate`** check-run re-runs `verify`'s exact steps (typecheck→test→build,
Node 22, pnpm 10.33.0, `--frozen-lockfile`) but **does not run e2e**. Then the
**`release`** check-run cuts the GitHub Release and builds/pushes the GHCR image. The
mechanics of release deployment belong to **tyche-run-and-operate**; the build gate is here.

---

## 7. Docker build mechanics (`Dockerfile`)

Single-container self-host image. Build essentials (owned here); running/operating the
container is **tyche-run-and-operate**.

- **Base:** `node:22-alpine`; `WORKDIR /app`; `RUN corepack enable` provisions the
  pinned pnpm inside the image.
- **Layer-cache order:** COPY the lockfile + `pnpm-workspace.yaml` + root `package.json`
  + **all 8 members' `package.json`** first, then `RUN pnpm install --frozen-lockfile`.
  This caches the dependency layer so source edits don't re-install. If you add or
  rename a workspace member, add its `package.json` COPY line here or the Docker build's
  lockfile install will not match.
- **Web build baked in:** after `COPY . .`, runs
  `RUN VITE_API_BASE_URL= VITE_DEMO_WORKSPACE=1 pnpm build` — empty base URL = the
  served bundle calls the same-origin API. Only web is built; the API and libs stay as
  source in the image.
- **Version:** `ARG TYCHE_VERSION=0.1.0`, surfaced as `ENV TYCHE_VERSION`. Release
  builds override with `--build-arg TYCHE_VERSION=<tag>` (the Dockerfile's default 0.1.0
  is stale vs. the repo's `0.3.0`; the release pipeline always passes the real tag).
- **Runs the API via tsx, directly:** `CMD ["apps/api/node_modules/.bin/tsx",
  "apps/api/src/index.ts"]` — **not** `pnpm --filter @tyche/api start`. Reason: pnpm as
  PID 1 does not forward `SIGTERM` to its node child, so `docker stop`/redeploy would
  SIGKILL the API and skip graceful shutdown (SQLite WAL checkpoint, audit/registry
  flush). tsx forwards the signal. Do not "simplify" this back to a pnpm invocation.
- **Healthcheck** uses Node's global `fetch` (Node 22) against `/api/health` — no
  curl/wget in the image.
- **`.dockerignore`** excludes `node_modules`, `**/dist`, `.env*`, `backups`,
  `*.tar.gz`, `data`, `test-results`, `playwright-report` — secrets and backups are
  never baked into an image layer.

---

## Provenance & maintenance

All facts verified against the repo on **2026-07-19**. Re-verify the volatile ones
(versions, counts, flags, paths) with the paired command before trusting them.

| Volatile fact (2026-07-19) | Re-verify with |
| --- | --- |
| pnpm pinned `10.33.0` | `grep packageManager package.json` and `grep -n 'version:' .github/workflows/ci.yml` |
| Node floor `>=20.10.0`; canonical Node **22** (CI/Docker/gate) | `grep -A2 engines package.json`; `grep -n node-version .github/workflows/ci.yml`; `grep -n '^FROM' Dockerfile` |
| **8** workspace members (6 pkgs + 2 apps) | `ls packages apps` — expect 6 + 2 |
| Only `@tyche/web` has a `build` script | `grep -rl '"build"' packages/*/package.json apps/*/package.json` — expect only apps/web |
| Root gate scripts (`typecheck`=`pnpm -r run typecheck`, `test`=`vitest run`, `build`=`--filter @tyche/web build`) | `sed -n '/"scripts"/,/}/p' package.json` |
| `vite build` has NO `tsc` prefix | `grep -A6 '"scripts"' apps/web/package.json` |
| Strict-TS flag set; `exactOptionalPropertyTypes: false` | `cat tsconfig.base.json` |
| `onlyBuiltDependencies: ["esbuild"]` | `grep -A4 onlyBuiltDependencies package.json` |
| CI check-runs **`verify`** + **`e2e`**, Node 22 / pnpm 10.33.0 / `--frozen-lockfile` | `cat .github/workflows/ci.yml` |
| Release gate re-runs verify (no e2e) + GHCR publish | `cat .github/workflows/release.yml` |
| Dockerfile: `node:22-alpine`, corepack pnpm, bakes web, `CMD` runs tsx directly | `cat Dockerfile` |
| Test count is NOT fixed — recount, don't cite docs | `npx vitest run` and read the summary line |
