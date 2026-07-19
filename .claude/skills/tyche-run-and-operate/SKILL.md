---
name: tyche-run-and-operate
description: >-
  Runbook for RUNNING and OPERATING Tyche across its four run surfaces — local dev, one-container
  self-host, public read-only demo, and hosted SaaS/production. Load this when you need to: start the
  app locally (pnpm dev / dev:api / dev:web), understand which process runs where and on what port
  (API :4010, web :5173), self-host with Docker (docker compose up, pnpm demo), stand up the public
  demo (TYCHE_DEMO), deploy production (scripts/deploy.sh, docker-compose.prod.yml, Caddy HTTPS),
  operate persistence (file vs sqlite, migrations, isolation), configure audit sinks (console|file|http),
  operate the SSE stream hub (/api/stream/quotes|trades|alerts), run backup/restore of the data volume,
  handle graceful shutdown (SIGTERM), or check health/readiness (/api/health, /api/ready). Trigger on
  phrases like "how do I run Tyche", "start the dev server", "deploy Tyche", "self-host", "docker compose",
  "back up the data", "restore from backup", "the stream isn't updating", "which port", "health check",
  "hosted mode", "public demo", "graceful shutdown". NOT for env-var definitions, the build gate, adding a
  route, or diagnosing a broken run (see When NOT to use).
---

# Tyche — Run & Operate

Operational runbook. **Jargon defined once:** *run surface* = one of the four ways Tyche runs (dev,
self-host, demo, hosted). *Capability* = a typed data ability a provider declares (e.g. `quotes`).
*Provenance* = the `{provider, mode, freshness, retrievedAt, …}` stamp on every datum. *SSE* =
Server-Sent Events, the one-way HTTP stream that pushes live quotes/trades/alerts to the browser.

> Any change to how the system runs — schema, config defaults, deploy topology, promoting a provider —
> routes through **tyche-change-control**. This skill tells you how to *operate* the system, not how to
> change what it is.

---

## 0. The four run surfaces at a glance

| Surface | Command | Ports | Keys? | Mode | Persists? |
|---|---|---|---|---|---|
| **Local dev** | `pnpm dev` | API `:4010`, web `:5173` (separate origins) | none (mock) | `selfhost` | yes, `./data` |
| **Self-host** | `docker compose up -d` | `:4010` (web same-origin) | none (mock) | `selfhost` | yes, `tyche-data` volume |
| **Public demo** | `pnpm demo` + `TYCHE_DEMO=true` | `:4010` same-origin | none | `selfhost`, writes 403'd | reads only |
| **Hosted SaaS** | `scripts/deploy.sh` → prod compose | `:80/:443` via Caddy → `:4010` | BYO / none | `hosted` | yes, per-user |

**Golden rule (Invariant 4): a fresh clone with zero keys runs the ENTIRE terminal on the deterministic
mock provider.** Every surface boots in mock mode with no configuration. Adding real data is opt-in via
`TYCHE_PROVIDERS` + credentials (env vars live in **tyche-config-and-flags**).

---

## 1. Local development

```sh
pnpm install            # once; pnpm 10.33.0 + Node 22 (toolchain: tyche-build-and-env)
pnpm dev                # starts API (tsx watch) + web (vite) together, in parallel
```

`pnpm dev` = `pnpm -r --parallel run dev` (root `package.json:13`). Only two members have a `dev`
script, so exactly two processes start:

- **API** — `apps/api`: `tsx watch --env-file-if-exists=../../.env src/index.ts`. Runs straight from
  TypeScript (no build step). Binds `http://127.0.0.1:4010` (`API_HOST`/`API_PORT`, env.ts:123).
- **Web** — `apps/web`: `vite`. Serves the SPA on `http://localhost:5173` (`vite.config.ts:36`).

The browser (`:5173`) calls the API (`:4010`) cross-origin; CORS is allow-listed to `WEB_ORIGIN`
(default `http://localhost:5173`). This is the ONLY dev surface where web and API are separate origins.

**Run one side alone:**

```sh
pnpm dev:api            # pnpm --filter @tyche/api dev   → API only, :4010
pnpm dev:web            # pnpm --filter @tyche/web dev   → web only, :5173 (needs an API somewhere)
```

Zero keys required. Everything routes to the mock provider (deterministic, seeded, no network).
`.env` is optional and git-ignored; copy `.env.example` if you want to wire real adapters.

---

## 2. One-container self-host

Single container, web served **same-origin** by the API (one process, one port):

```sh
docker compose up -d          # build + run; http://localhost:4010
docker compose logs -f tyche  # tail
docker compose down           # stop (data volume persists)
```

`docker-compose.yml` runs one service `tyche` (`build: .`), publishes `4010:4010`, mounts named volume
`tyche-data:/app/data`, and sets `TYCHE_PROVIDERS: mock`. The image (`Dockerfile`) is `node:22-alpine`,
bakes the web bundle with `VITE_API_BASE_URL= VITE_DEMO_WORKSPACE=1 pnpm build` (empty base URL → the
browser calls the same origin), and serves it via `TYCHE_SERVE_WEB=/app/apps/web/dist`. The API runs
`tsx apps/api/src/index.ts` directly (CMD in Dockerfile) so **SIGTERM reaches Node** for graceful
shutdown (§8). `HEALTHCHECK` fetches `:4010/api/health` every 30s.

**Same thing without Docker** (build web, serve same-origin from the API):

```sh
pnpm demo
```

`pnpm demo` = `VITE_API_BASE_URL= VITE_DEMO_WORKSPACE=1 pnpm build && TYCHE_SERVE_WEB=$PWD/apps/web/dist
pnpm --filter @tyche/api start` (root `package.json:24`). Builds web, then the API serves it with an SPA
fallback for non-API GETs on `:4010`. Use this to preview the production same-origin layout locally.

To enable real adapters in Docker, uncomment the commented env in `docker-compose.yml` (e.g.
`TYCHE_PROVIDERS: mock,secedgar,fred` + `SEC_EDGAR_USER_AGENT`). Adapter roster (keyless vs BYO-key)
lives in **tyche-config-and-flags**; never bundle or resell data (Invariant 2).

---

## 3. Public read-only demo

The public demo is the highest-converting top-of-funnel: a shared, no-signup instance where **every
persistence write is blocked** so it can't be clobbered or vandalized.

```sh
TYCHE_DEMO=true pnpm demo      # or set TYCHE_DEMO=true in the container env
```

Enforcement (`app.ts:310-326`): when `config.demo`, an `onRequest` hook 403s (`kind: read_only_demo`)
every write method (`POST/PUT/DELETE/PATCH`) to `/api/*`, **except** the two non-persisting POSTs:

```
READ_ONLY_POSTS = { /api/screen, /api/ai/chat }
```

So reads, SSE streams, market data, the screener, and the AI copilot all work; watchlists/alerts/notes/
portfolios cannot be saved. Demo is orthogonal to hosted mode — it is a write-blocker layered on top.

---

## 4. Hosted SaaS / production deploy

Sells **software + hosting, never data** (Invariant 2). Multi-user accounts, per-user isolation, trial
→ pro → expired billing. Turned on by `TYCHE_MODE=hosted`; self-host is unaffected.

### 4.1 One-command deploy

```sh
./scripts/deploy.sh
```

First run (`scripts/deploy.sh`): copies `deploy/env.prod.example` → `.env.prod`, generates a session
secret (`openssl rand -base64 32`, or `/dev/urandom` fallback), then **exits** telling you to set
`TYCHE_DOMAIN` and re-run. It refuses the example domain `terminal.example.com`.

Second run: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`, then polls
container health up to ~2 min (`… ps tyche --format '{{.Health}}'` == `healthy`) and **fails loudly** if
the API never goes healthy. On success it prints next steps (DNS, register the first account = admin,
billing, backup drill).

### 4.2 Topology (`docker-compose.prod.yml`)

- **`tyche`** service: `restart: unless-stopped`, logs capped (json-file 10m×5), `expose: 4010` (NOT
  published — only Caddy reaches it), volume `tyche-data:/app/data`. Baked env: `TYCHE_MODE=hosted`,
  `TYCHE_SESSION_SECRET` (required, `:?` fails the deploy if unset), `TYCHE_PERSISTENCE=sqlite`,
  `TYCHE_AUDIT_SINK=file`, `TYCHE_PROVIDERS` default `mock`, `TYCHE_BILLING` default `none`.
- **`caddy`** service: `caddy:2-alpine`, ports `80:80`/`443:443`, mounts `deploy/Caddyfile:ro`,
  `depends_on: tyche condition: service_healthy`. Caddy does **automatic HTTPS** (Let's Encrypt) and
  `reverse_proxy tyche:4010`; it overwrites `X-Forwarded-For` with the real client IP (Caddy is the
  single trusted edge = 1 hop; matches `TYCHE_TRUST_PROXY_HOPS` default `1`).

### 4.3 Hosted invariants you operate around (do not break)

- **Boot guard:** hosted mode throws at startup if `TYCHE_SESSION_SECRET` is missing or < 16 chars
  (`app.ts:141`). No secret → no boot. That is intentional; do not weaken it.
- **Accounts:** scrypt-hashed passwords (per-user 16-byte salt); stateless HMAC-SHA256 session cookies
  `uid.epoch.expiresMs.sig` (`tyche_session`, httpOnly, SameSite=Lax, 30-day). No server session store —
  sessions survive restarts; bumping a user's `tokenEpoch` revokes all their sessions.
- **Per-user isolation:** each user's data lives under `<dataDir>/users/<id>/`. Routes are unchanged —
  `scopedPersistence` + `AsyncLocalStorage` delegate every call to the signed-in user's store.
- **Billing/paywall:** every account gets a **14-day trial** (no card) → `trial` → `pro` → `expired`.
  Expired non-admin gets **402 `payment_required`** on terminal routes. **Exempt from the paywall:**
  auth routes, billing routes, and `GET /api/account/export` ("cancel anytime, take your data").
  **Admins are never paywalled.** `pro` degrades to "still works" on a missed renewal — only a
  cancellation webhook downgrades. `TYCHE_BILLING` **fails closed to `none`** (never silently `mock`).
- Full env definitions (session/billing/signups/seats) → **tyche-config-and-flags**.

---

## 5. Persistence — operation

Interface `PersistenceStore` (`persistence/types.ts:34-79`): one collection API for Preferences,
Workspaces, Watchlists, Notes, Portfolios, SavedScreens, Alerts, plus `markAlertTriggered` (compare-and-
set) and `snapshot()`. Two interchangeable backends selected by `TYCHE_PERSISTENCE` (`file`|`sqlite`).

**The load-bearing rule: the app NEVER fails to boot over its persistence choice.** `createPersistence`
(`app.ts:51-66`): if `TYCHE_PERSISTENCE=sqlite`, try `new SqlitePersistence(sqlitePath).init()`; on ANY
error, warn and fall back to `FilePersistence(dataDir)`. Operate accordingly — a sqlite failure degrades
to file silently-but-loudly, it does not take the service down.

| Backend | File | How it's durable |
|---|---|---|
| **File** (default) | `FilePersistence.ts` | JSON doc `tyche-db.json`; **atomic** write = temp file + `rename`; writes serialized on a promise queue |
| **SQLite** (opt-in) | `SqlitePersistence.ts` | built-in `node:sqlite` (`DatabaseSync`, lazy `createRequire`); `PRAGMA journal_mode=WAL`; JSON columns; synchronous atomic CAS |

- **Versioned + migrations:** `PERSISTENCE_VERSION = 2` (`persistence/types.ts:12`). File backend's
  `migrate()` hook validates the stored `version`, merges over defaults, and backfills fields on upgrade
  (v1→v2 added note `tags`/`pinned`). A schema/version change is a change-control event
  (**tyche-change-control**) — the migration must be additive and tested.
- **Alerts are TOCTOU-safe:** `markAlertTriggered` does a synchronous read-check-write before any await
  (both backends) so two concurrent SSE connections can't both fire a one-shot alert.
- **Hosted isolation:** `UserStores.forUser(id)` lazily opens/caches a private store under
  `<dataDir>/users/<id>/`; `destroy(id)` closes it and `rm -rf`s the dir (account deletion).

**Switch backends:** set `TYCHE_PERSISTENCE=sqlite` (+ optional `TYCHE_SQLITE_PATH`) and restart. There
is no automatic file→sqlite data migration — treat a backend switch as a fresh store unless you migrate
the data yourself. Production compose already ships `sqlite`.

---

## 6. Audit sinks — operation

Every mutating/sensitive action emits an audit event `{ at, actor, action, resource?, outcome, detail? }`.
The sink is a pluggable driver selected by `TYCHE_AUDIT_SINK` (`app.ts:103-115`). All three impls share a
bounded in-memory **ring buffer of 500** events (`security/audit.ts:19`, `DEFAULT_BUFFER = 500`) exposed
at `GET /api/audit` (newest first; hosted → admin-only; self-host → gated by the optional bearer guard).

| `TYCHE_AUDIT_SINK` | Impl | Durability | Notes |
|---|---|---|---|
| `console` (default) | `ConsoleAuditSink` | stdout line | ring buffer only; nothing persisted to disk |
| `file` | `FileAuditSink` | JSON-lines append to `TYCHE_AUDIT_FILE` (default `<dataDir>/audit.log`) | serialized queue; seeds ring from log tail on `init()`; `flush()` on shutdown |
| `http` | `HttpAuditSink` | POSTs each event to `TYCHE_AUDIT_WEBHOOK_URL` (optional bearer) | 10s timeout, fire-and-forget, at-most-once, never throws into a request |

- `http` **without a URL** warns and **degrades to console** (fail-safe, no crash).
- Production compose uses `file` (durable trail on the `tyche-data` volume).
- In hosted mode the actor is rewritten to the signed-in user's email (`scopedAudit`).
- Env definitions (`TYCHE_AUDIT_FILE`, `TYCHE_AUDIT_WEBHOOK_URL/TOKEN`) → **tyche-config-and-flags**.

---

## 7. SSE stream hub — operation

Live updates ride **Server-Sent Events**, not WebSockets. `QuoteStreamHub` (`stream/hub.ts`) groups the
requested symbols per provider (via `forCapability('quotes', symbol)`) and, every `intervalMs` (default
**1500 ms**, `hub.ts:35`), calls `provider.getQuotes(group)` and pushes ticks to subscribers.

**The one operational invariant: real data is never jittered.** Real providers are passed through
untouched (`hub.ts:58-60`). **Only mock-mode providers** get a seeded random walk
(`seededRng('stream', id, floor(now/intervalMs))`) so the demo visibly "moves" (`hub.ts:62-71`). If you
enable a real adapter, its stream reflects that adapter's real values as-is.

Three SSE endpoints (`routes/stream.ts`), each 400s if its symbols are missing:

| Endpoint | Query | Frames emitted |
|---|---|---|
| `GET /api/stream/quotes` | `?symbols=A,B` | `event: ready`, then `event: quote` per tick |
| `GET /api/stream/trades` | `?symbol=X` | `event: ready`, then `event: trade` (synthetic tape for mock; watermark-deduped real prints) |
| `GET /api/stream/alerts` | `?symbols=A,B` | `event: alert` on a rule's rising edge |

Operational notes:
- Each stream writes raw `text/event-stream` headers and **manually mirrors credentialed CORS** (exact
  `Access-Control-Allow-Origin: WEB_ORIGIN` + `Allow-Credentials: true`, `X-Accel-Buffering: no`) because
  raw headers bypass `@fastify/cors`. A 15s `event: ping` heartbeat keeps proxies from idling the
  connection — that is why `X-Accel-Buffering: no` matters behind nginx-style buffers.
- **Alerts fire once on the rising edge.** `AlertEvaluator` is stateful per connection; each tick reloads
  active alerts for the subscribed symbols (so live edits take effect), and `markAlertTriggered`
  (compare-and-set) gates the write so a one-shot fires exactly once even across reconnects/concurrency.
- SSE is **unauthenticated read-only in self-host** — gate it at your reverse proxy if the instance is
  exposed. In hosted mode it requires a session like every other `/api/*` route.
- Stream *not updating*? That is a failure to triage in **tyche-debugging-playbook**, not here.

---

## 8. Graceful shutdown (SIGTERM)

`installGracefulShutdown` (`apps/api/src/index.ts:11-26`) traps **SIGTERM and SIGINT** (docker stop,
redeploy, Ctrl-C) and calls `app.close()`, which runs the `onClose` hooks: checkpoint the SQLite WAL,
flush pending audit writes, flush users/invites, close per-user stores. This avoids the 10s-timeout
SIGKILL stranding writes mid-flight. It is why the Docker `CMD` runs `tsx` **directly** (not via
`pnpm --filter start`) — so the signal reaches Node, not a wrapper. Idempotent (a second signal is
ignored while closing).

Consequence for operators: `docker compose stop tyche` is **clean and quick** — the WAL is checkpointed
before the process exits. `scripts/backup.sh` relies on this to take a consistent cold snapshot.

---

## 9. Backup & restore

Both scripts operate on the whole `tyche-data` **volume**, so they are backend-agnostic (file OR
sqlite+WAL) and survive future layout changes. They derive
`COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"` and require a prior
`scripts/deploy.sh`.

### Backup (`scripts/backup.sh`)

```sh
./scripts/backup.sh [output-dir]      # default ./backups → tyche-<UTC-timestamp>.tar.gz
```

Cold, consistent snapshot: **stops** `tyche` (graceful shutdown checkpoints the WAL first), tars the
volume via a throwaway `alpine:3` container mounting the volume read-only, then **always restarts** the
service (a `trap … EXIT` guarantees the service comes back even if tar fails). Then **copy the tarball
OFF the box** (rclone/S3/scp) and schedule it from cron — a backup on the same disk is not a backup.

### Restore (`scripts/restore.sh`)

```sh
./scripts/restore.sh <backup.tar.gz> [--yes]
```

**Destructive** — REPLACES the entire volume; anything not in the chosen backup is lost. Prompts for the
literal word `restore` unless `--yes`. Stops `tyche`, empties the volume (per-entry `rm -rf`, then unpacks
the tarball via `alpine:3`), restarts. Verify by opening the site and signing in.

**Run the restore drill once before launch** (per `docs/LAUNCH.md`) so you trust it against a real
tarball, not just in theory.

---

## 10. Health & readiness

Two probes (`routes/health.ts`), plus operator inspection endpoints:

| Endpoint | Purpose | Success | Failure |
|---|---|---|---|
| `GET /api/health` | **Liveness** — "is the process up?" (no I/O; the container HEALTHCHECK target) | `200 {status:'ok', version, uptimeSec, appMode, demo, billing, mode, providers, capabilities}` | — |
| `GET /api/ready` | **Readiness** — "can it serve?" (cheap real read against persistence) | `200 {status:'ready'}` | `503 {status:'unavailable', check:'persistence'}` |
| `GET /api/providers` | enabled provider descriptors + `aggregate` capability union | `200` | — |
| `GET /api/plugins` | installed plugin gate status (active/quarantined/disabled) | `200` | — |
| `GET /api/audit?limit=` | recent audit ring buffer (hosted: admin-only; self-host: bearer-gated) | `200` | `403` |

```sh
curl -s http://localhost:4010/api/health | jq
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4010/api/ready   # 200 healthy, 503 not
```

`/api/health` reports `mode: 'mock'` when every enabled provider is mock, else `'mixed'` — a quick way to
confirm whether real adapters actually loaded. Use `/api/ready` (not `/api/health`) as the load-balancer /
deploy gate, because it actually touches the persistence backend. `scripts/deploy.sh` polls the container
`Health` (backed by the `/api/health` HEALTHCHECK) to decide deploy success.

---

## When NOT to use this skill

| You want to… | Use instead |
|---|---|
| Look up what an env var means or its default | **tyche-config-and-flags** |
| Run the build/test gate, toolchain versions, no-build-step rationale | **tyche-build-and-env** |
| Add a new API route, capability, or vertical slice | **tyche-vertical-slice-campaign** |
| Diagnose why a run/deploy/stream/persistence is BROKEN | **tyche-debugging-playbook** |
| Run conformance / wiring-audit / diagnostic scripts | **tyche-diagnostics-and-tooling** |
| Understand the capability-gap model / degrade-never-crash contract | **tyche-architecture-contract** |
| Change schema, config defaults, or deploy topology | **tyche-change-control** (route through it) |
| Read the product invariants and their rationale | **tyche-change-control** |

---

## Provenance & maintenance

Re-verify VOLATILE facts before trusting them (repo has known doc drift — trust the CODE). All line
refs verified against the repo on **2026-07-19**.

| Fact (date-stamped 2026-07-19) | Re-verify with |
|---|---|
| API port `4010`, host `127.0.0.1` | `grep -n 'API_PORT\|API_HOST' apps/api/src/env.ts` |
| Web dev port `5173` | `grep -n 'port' apps/web/vite.config.ts` |
| `pnpm dev/dev:api/dev:web/demo/build` definitions | `sed -n '12,25p' package.json` |
| `pnpm dev` starts exactly API + web | `grep -rn '"dev"' apps/*/package.json` |
| Self-host compose = one `tyche` svc, `4010:4010`, mock | `cat docker-compose.yml` |
| Demo write-blocker + `READ_ONLY_POSTS` | `grep -n 'READ_ONLY_POSTS\|read_only_demo' apps/api/src/app.ts` |
| deploy.sh command + health poll | `sed -n '38,53p' scripts/deploy.sh` |
| prod compose: hosted, sqlite, file audit, Caddy | `cat docker-compose.prod.yml` |
| Session secret ≥16 boot guard | `grep -n 'sessionSecret' apps/api/src/app.ts` |
| Trial = 14 days | `grep -n 'TRIAL_DAYS' apps/api/src/saas/users.ts` |
| Paywall 402 + exemptions (auth/billing/export, admin) | `sed -n '337,377p' apps/api/src/app.ts` |
| Persistence version `2`; file=atomic temp+rename; sqlite=WAL, falls back | `grep -n 'PERSISTENCE_VERSION' apps/api/src/persistence/types.ts`; `sed -n '51,66p' apps/api/src/app.ts` |
| Audit sinks console/file/http; ring buffer `500` | `grep -n 'DEFAULT_BUFFER\|AuditSink' apps/api/src/security/audit.ts` |
| Hub interval `1500` ms; mock walk only, real untouched | `grep -n 'intervalMs\|passthrough\|walk' apps/api/src/stream/hub.ts` |
| SSE endpoints quotes/trades/alerts | `grep -n "'/api/stream" apps/api/src/routes/stream.ts` |
| SIGTERM/SIGINT graceful shutdown | `sed -n '11,26p' apps/api/src/index.ts` |
| backup/restore = tar the `tyche-data` volume | `cat scripts/backup.sh scripts/restore.sh` |
| health `/api/health` + `/api/ready` (503) | `cat apps/api/src/routes/health.ts` |
| Command count (drifts; docs say 41/60) | `grep -cE '^\s*cmd\(\{' packages/terminal-kernel/src/commands.ts` |
| Capability count (drifts; docs say 24/28) | `sed -n '10,39p' packages/contracts/src/provider.ts` |
| Toolchain pnpm `10.33.0`, Node `22` | `grep -n 'packageManager' package.json` |
