# Security & compliance

Tyche is a self-hostable research tool. This document covers its security posture, compliance
scaffolding, and the responsibilities that come with enabling real data.

## No financial advice

Tyche displays market data and **educational** analysis only. It must not, and does not, provide
personalized buy/sell/hold recommendations. The AI copilot:

- is **grounded** in available terminal context and cites the provenance of data it references,
- **declines** requests for personalized advice ("Should I buy AAPL?") and redirects to the data,
- runs in deterministic **mock mode** with no model key, so no prompt or data leaves the machine by
  default.

Tyche is **not a broker**. The foundation contains **no order-placement / trade-execution** path.

## Data licensing & entitlements

> Live market data is almost always licensed. **Enabling a real provider is your responsibility.**
> Confirm you hold the appropriate market-data licenses/entitlements and comply with each source's
> terms of use, rate limits, and attribution requirements before enabling it.

- The mock provider's data is **entirely synthetic** and clearly marked (`mode: 'mock'`).
- Provider scaffolds (`Yahoo`, `SecEdgar`, `Fred`, `Ccxt`) ship **disabled** and serve nothing until
  implemented. Each descriptor records its attribution and whether attribution is required.
- Every API response carries `DataProvenance` (provider, mode, freshness) so the source of any datum
  is always inspectable.

## Authentication (optional, off by default)

For frictionless local development, the API is open. For shared/hosted deployments, set:

```bash
TYCHE_AUTH_ENABLED=true
TYCHE_AUTH_TOKEN=<a-strong-random-token>
```

When enabled, **mutating** requests (`POST`/`PUT`/`PATCH`/`DELETE`) require
`Authorization: Bearer <token>`. The audit trail (`GET /api/audit`) is also protected, since it's
exactly the endpoint an operator expects behind the same token as the actions it records. Other
read-only routes remain open (adjust in `apps/api/src/security/auth.ts` if you need them gated too).
This is a foundation-level guard, not a full identity system — put Tyche behind your own auth proxy /
network controls for real deployments.

## Hosted mode (multi-user accounts)

`TYCHE_MODE=hosted` turns on a real identity layer for running Tyche as a service
(`apps/api/src/saas/`). It is strictly opt-in; self-host deployments are unaffected.

- **Passwords** are hashed with `crypto.scrypt` (per-user random salt) and compared with
  `timingSafeEqual`. Minimum length is enforced at the schema layer; plaintext is never stored.
- **Sessions** are stateless HMAC-SHA256 tokens (`uid.epoch.expires.sig`) signed with
  `TYCHE_SESSION_SECRET` — the API **refuses to boot** in hosted mode without a secret of at least
  16 characters. Tokens live in an `httpOnly`, `SameSite=Lax` cookie (30-day TTL; `secure` on
  HTTPS); `Authorization: Bearer` is also accepted. A per-user `tokenEpoch` invalidates all of a
  user's outstanding sessions when bumped.
- **Every `/api/*` route requires a session** in hosted mode (health, auth, and CORS preflight
  excepted) — including the SSE streams, which send credentials from the web client.
- **Data isolation** is structural, not filtered: each account's persistence store lives under
  `TYCHE_DATA_DIR/users/<id>/` and requests are bound to it via `AsyncLocalStorage`, so one user's
  data is never in another user's query path. Audit events record the acting account's email.
- **Sign-up control**: `TYCHE_SIGNUPS=closed` blocks registration once the first (founder/admin)
  account exists; `TYCHE_ADMIN_EMAIL` pins which registration becomes admin.
- **Launch checklist gaps** (planned, not yet shipped): rate limiting on the auth endpoints, email
  verification, and password reset. Front the API with a proxy that rate-limits `/api/auth/*`
  until then.

## Audit events

`apps/api/src/security/audit.ts` defines an `AuditSink` interface with two implementations.
Mutations emit structured audit events (`{ at, actor, action, resource?, outcome, detail? }`):

- **`console`** (default) — a structured single line to stdout.
- **`file`** — set `TYCHE_AUDIT_SINK=file` to also append durable JSON lines to a log
  (`TYCHE_AUDIT_FILE`, default `<TYCHE_DATA_DIR>/audit.log`) that a self-hoster can retain, ship to a
  SIEM, or grep. Writes are serialized and never throw into the request path; the recent-events buffer
  is seeded from the existing log on boot.

Both sinks keep an in-memory ring of recent events, surfaced read-only at `GET /api/audit` and in the
`SETTINGS` panel's "Recent activity" view. To route events elsewhere (database, external SIEM),
implement `AuditSink` and select it in `app.ts` — call sites don't change.

## Secrets & configuration

- **No secrets are committed.** `.env` is git-ignored; only `.env.example` (with blank values) is
  tracked.
- Provider/model configuration is isolated behind environment variables (see `.env.example`).
- The local persistence directory (`TYCHE_DATA_DIR`, default `./data`) is git-ignored.

| Variable               | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `TYCHE_AUTH_ENABLED`   | Require a bearer token on mutating routes (default `false`)    |
| `TYCHE_AUTH_TOKEN`     | The bearer token, when auth is enabled                         |
| `TYCHE_MODE`           | `hosted` enables accounts/sessions (default `selfhost`)        |
| `TYCHE_SESSION_SECRET` | Session-signing secret, required in hosted mode (≥ 16 chars)   |
| `TYCHE_SIGNUPS`        | `closed` blocks registration after the founder account         |
| `TYCHE_ADMIN_EMAIL`    | Registration with this email is granted admin                  |
| `TYCHE_PROVIDERS`      | Which providers to enable (default `mock`)                     |
| `SEC_EDGAR_USER_AGENT` | Required descriptive UA if you implement the SEC EDGAR adapter |
| `FRED_API_KEY`         | API key if you implement the FRED adapter                      |
| `CCXT_EXCHANGE`        | Exchange id if you implement the CCXT adapter                  |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | AI backend config (default `mock`, no key)  |

## Transport & deployment notes

- CORS is permissive in development. Restrict `origin` in `apps/api/src/app.ts` for production.
- SSE streams are unauthenticated read-only quote feeds in self-host mode (gate them at your proxy
  if needed); in hosted mode they require a session like every other API route.
- Run the API behind TLS and a reverse proxy in any non-local deployment.

## Reporting a vulnerability

This is an early-stage open foundation. If you find a security issue, please open a private report
to the maintainers (or a GitHub security advisory) rather than a public issue, and include steps to
reproduce. Do not include real credentials or licensed data in reports.
