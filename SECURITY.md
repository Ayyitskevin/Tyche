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
`Authorization: Bearer <token>`. Read-only routes remain open (adjust in
`apps/api/src/security/auth.ts` if you need them gated too). This is a foundation-level guard, not a
full identity system — put Tyche behind your own auth proxy / network controls for real deployments.

## Audit events

`apps/api/src/security/audit.ts` defines an `AuditSink` interface and a console implementation.
Mutations emit structured audit events (`{ at, actor, action, resource?, outcome }`). For
team/enterprise use, route these to a durable sink (database, SIEM) by swapping the sink — call sites
don't change.

## Secrets & configuration

- **No secrets are committed.** `.env` is git-ignored; only `.env.example` (with blank values) is
  tracked.
- Provider/model configuration is isolated behind environment variables (see `.env.example`).
- The local persistence directory (`TYCHE_DATA_DIR`, default `./data`) is git-ignored.

| Variable               | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `TYCHE_AUTH_ENABLED`   | Require a bearer token on mutating routes (default `false`)    |
| `TYCHE_AUTH_TOKEN`     | The bearer token, when auth is enabled                         |
| `TYCHE_PROVIDERS`      | Which providers to enable (default `mock`)                     |
| `SEC_EDGAR_USER_AGENT` | Required descriptive UA if you implement the SEC EDGAR adapter |
| `FRED_API_KEY`         | API key if you implement the FRED adapter                      |
| `CCXT_EXCHANGE`        | Exchange id if you implement the CCXT adapter                  |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | AI backend config (default `mock`, no key)  |

## Transport & deployment notes

- CORS is permissive in development. Restrict `origin` in `apps/api/src/app.ts` for production.
- SSE streams are unauthenticated read-only quote feeds; gate them at your proxy if needed.
- Run the API behind TLS and a reverse proxy in any non-local deployment.

## Reporting a vulnerability

This is an early-stage open foundation. If you find a security issue, please open a private report
to the maintainers (or a GitHub security advisory) rather than a public issue, and include steps to
reproduce. Do not include real credentials or licensed data in reports.
