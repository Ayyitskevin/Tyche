# TKT-048 — Hosted mode: accounts, sessions, per-user data isolation

**Priority:** P1 (MicroSaaS)  ·  **Milestone:** SaaS Cycle 1  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- MicroSaaS transformation loop, Cycle 1 review: Tyche is a strong single-user self-host terminal
  (21 capabilities, 30+ modules, one-command demo) but has **no concept of a customer** — no
  accounts, no sessions, and one shared data store. Nothing can be billed until multiple users can
  sign up and their data is isolated.

## Problem
A hosted product needs sign-up → sign-in → "my watchlists are mine". It must be **strictly opt-in**:
the default self-host, zero-config, mock-mode experience (and its entire test suite) must not change.

## Technical design
- **Opt-in via `TYCHE_MODE=hosted`** (default `selfhost`). Hosted boot refuses to start without
  `TYCHE_SESSION_SECRET` (≥ 16 chars) — no silently-insecure deployments.
- **`UserRegistry`** (`apps/api/src/saas/users.ts`): scrypt password hashing (per-user salt,
  `timingSafeEqual`), atomic JSON persistence at `<dataDir>/users.json`, `BillingState` seeded as a
  14-day trial at registration (consumed by Cycle 2 billing), `tokenEpoch` for session invalidation.
  First account (or `TYCHE_ADMIN_EMAIL`) becomes admin. `TYCHE_SIGNUPS=closed` gates registration
  after the founder account exists.
- **Stateless sessions** (`saas/sessions.ts`): HMAC-SHA256 tokens `uid.epoch.expires.sig` (30-day
  TTL) — survive API restarts with no session store; verified with `timingSafeEqual`. Delivered as
  an `httpOnly` `tyche_session` cookie (SameSite lax, `secure: auto`); `Authorization: Bearer` is
  accepted for API clients.
- **Per-user data isolation with zero route churn** (`saas/requestContext.ts`, `saas/userStores.ts`):
  an `AsyncLocalStorage` request scope carries `{ user, store }`; `scopedPersistence()` wraps the
  root `PersistenceStore` and delegates every call to the scoped per-user store
  (`<dataDir>/users/<id>/`, SQLite or file per config). Existing routes keep calling
  `ctx.persistence` unchanged. `scopedAudit()` stamps the audit `actor` with the signed-in email.
  The onRequest hook is **callback-style** and wraps `done` in `requestScope.run(...)` so the whole
  downstream lifecycle runs inside the scope (an `enterWith` variant leaked; caught by tests).
- **Auth routes** (`routes/auth.ts`): `POST /api/auth/register|login|logout`, `GET /api/auth/me`.
  In hosted mode every other `/api/*` route (except health/OPTIONS) requires a valid session → 401.
  In self-host mode auth routes answer `400 not_hosted`.
- **Web**: `/api/health` exposes `appMode`; the app gates boot behind `AuthScreen` (terminal-styled
  sign-in/sign-up, trial copy + data-posture disclaimer) when hosted and signed out; header shows
  the account email + sign-out. All fetches/EventSources send credentials.
- **SSE CORS fix**: the raw-header SSE routes now also send `Access-Control-Allow-Credentials: true`
  (+ `Vary: Origin`) — credentialed EventSources are otherwise dropped by the browser (caught by the
  alert-fire e2e).

## Acceptance criteria
- [x] `TYCHE_MODE=hosted`: register → cookie session → `/api/auth/me`; wrong password 401; duplicate
  email 409; weak password 400; tampered token rejected; API guarded without a session.
- [x] Hard data isolation: user A's watchlists/preferences invisible to user B (test-proven).
- [x] Audit events in hosted mode carry the acting user's email.
- [x] Hosted boot refuses to start without a session secret; `TYCHE_SIGNUPS=closed` blocks new
  registrations once the founder exists.
- [x] Self-host mode byte-for-byte unaffected: full suite green (442 unit + 33 e2e).

## Testing
9 new API-level integration tests (`saas/saas.test.ts`) cover the register/login/me flow, guards,
token round-trip/tampering, isolation, audit stamping, and config guards. E2E remains self-host —
the Playwright web-server boots one API in the default mode so the out-of-the-box experience stays
the continuously-tested path; the hosted HTTP surface is covered end-to-end at the API layer via
`app.inject`. A hosted-browser e2e project is deferred to the Cycle 2 billing work where the
account screen grows real flows worth driving.

## Clean-room notes
Commodity SaaS plumbing (accounts/sessions); no market data, no competitor material.

## Non-goals (later cycles)
- Billing enforcement (trial expiry → 402), Stripe checkout/portal/webhooks — Cycle 2.
- Onboarding presets, admin metrics dashboard — Cycle 3.
- Email verification / password reset (needs an email provider decision), rate limiting on auth
  endpoints (documented in SECURITY.md as a launch checklist item).
