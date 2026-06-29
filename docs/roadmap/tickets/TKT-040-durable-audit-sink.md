# TKT-040 — Durable audit-log sink + operator audit view

**Priority:** P3  ·  **Milestone:** M17  ·  **Status:** in-progress  ·  **Clean-room risk:** None

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md` P3 list: *"durable audit-log sink."* Strengthens the
  self-hostable / operator-owned positioning.

## Problem
Audit events (mutating actions) were logged to stdout only via `ConsoleAuditSink`. A self-hoster who
wants an accountability trail had nothing durable to retain, and no way to inspect recent activity
from the UI.

## Technical design
- **Contract** (`packages/contracts/src/audit.ts`): `AuditEvent` / `AuditOutcome` (the shape the API
  exposes); registered in `Schemas`. `apps/api` now imports this type instead of a local interface.
- **Sinks** (`apps/api/src/security/audit.ts`): `AuditSink` gains `recent(limit)`. Both sinks keep a
  bounded in-memory ring. New `FileAuditSink` appends each event as a JSON line, serializes writes,
  never throws into the request path, seeds its ring from the tail of an existing log on `init()`, and
  exposes `flush()` (used on API shutdown and in tests).
- **Config** (`env.ts` / `app.ts`): `TYCHE_AUDIT_SINK=console|file` (default console) and
  `TYCHE_AUDIT_FILE` (default `<dataDir>/audit.log`). The file sink is selected and `init()`-ed at boot.
- **Read API** (`GET /api/audit?limit`): recent events, newest first, capped at 500.
- **Web**: `apiClient.getAudit`; a "Recent activity (audit)" section in `SETTINGS` listing recent
  events (time · action · resource · outcome).

## Acceptance criteria
- [x] `TYCHE_AUDIT_SINK=file` durably appends JSON-lines audit events; recent events survive restart.
- [x] `GET /api/audit` and the SETTINGS view show recent events (works in default console mode too).
- [x] Auditing never breaks the action it records (write failures are logged, not thrown).
- [x] No order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Entirely original infrastructure (an append-only JSON-lines log + a read endpoint). No third-party
artifact involved.

## Non-goals (later)
- Log rotation / retention policies; external SIEM shippers; signed/tamper-evident logs; per-actor
  identity beyond `local` (tied to the optional auth work).
