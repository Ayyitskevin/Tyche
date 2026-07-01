# TKT-047 — One-command self-host: same-origin serving, Docker, demo seed

**Priority:** P2 (revamp)  ·  **Milestone:** Revamp Cycle 5  ·  **Status:** in-progress  ·  **Clean-room risk:** None

## Source evidence
- Revamp-loop codebase review: no Dockerfile/compose anywhere; a new self-hoster needs the full pnpm
  toolchain and two processes; first run is an empty grid; README predated ~10 shipped features.

## Problem
"Self-hostable" was true but not easy. Demo-readiness (MicroSaaS posture) needs git-clone → running
terminal in one command, with something on screen.

## Technical design
- **Same-origin serving** (`TYCHE_SERVE_WEB=<dist>`): the API registers `@fastify/static` over the
  built web app with an SPA fallback for non-API GETs; API routes keep priority; the JSON root route
  is replaced only in this mode. Unit-tested via a temp dist (root + deep route serve index.html,
  `/api/health` still works, unknown `/api/*` still 404s).
- **`VITE_API_BASE_URL=''`** (empty = same-origin relative fetches) used by the demo build.
- **Docker**: single-container `Dockerfile` (node:22-alpine + corepack/pnpm, lockfile-layered
  install, demo build, `TYCHE_DATA_DIR` volume) + `docker-compose.yml` (port 4010, named volume,
  commented env for real adapters) + `.dockerignore`.
- **`pnpm demo`**: non-Docker one-command equivalent (Linux/macOS).
- **First-run demo workspace**: gated on `VITE_DEMO_WORKSPACE=1` (set only by demo builds) — when the
  restore finds nothing, seed `AAPL GP` / `AAPL DES` / `W` / `TOP` through the real command path and
  name the workspace "Demo". Dev/e2e builds are unaffected (all suites unchanged).
- **README overhaul** (one-command demo first, feature highlights current through Cycle 5) and a
  **"Next 30 days"** roadmap section.

## Acceptance criteria
- [x] `docker compose up` → a working terminal with a seeded layout at :4010 (mock mode, no keys).
- [x] `pnpm demo` does the same without Docker.
- [x] Same-origin serving unit-tested; API routes keep priority; dev/e2e flows unchanged.
- [x] README reflects the shipped product; ROADMAP carries the 30-day plan.

## Clean-room notes
Deployment plumbing only; no data or third-party artifacts involved.

## Non-goals (later)
- Published container images (GHCR) + release workflow; HTTPS/reverse-proxy recipes; multi-arch builds.

## Known limitation
The container build is not exercised in CI (no Docker step there yet — listed for week 4); the
serving path itself is unit-tested.
