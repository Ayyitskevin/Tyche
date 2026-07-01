# Changelog

All notable changes to Tyche. Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions are milestones, not npm releases (the workspace is private).

## 0.2.0 — 2026-07-01 · "The SaaS release"

Tyche becomes a launch-ready product: the same keyboard-first terminal, now runnable as a hosted,
billable service — strictly opt-in, with the self-host experience unchanged.

### Hosted mode (`TYCHE_MODE=hosted`)
- **Accounts** — email/password sign-up (scrypt-hashed, per-user salts), stateless HMAC cookie
  sessions (30-day, survive restarts), sign-up control (`TYCHE_SIGNUPS`, `TYCHE_ADMIN_EMAIL`).
- **Hard per-user data isolation** — every account gets its own persistence store
  (`data/users/<id>`), bound per-request via `AsyncLocalStorage`; zero route churn.
- **Auth hardening** — per-IP rate limiting on credential endpoints (429), password change with
  session invalidation (`tokenEpoch`), audit events for every auth outcome.

### Billing
- 14-day free trial (no card) seeded at registration; expired trials hit a **402 paywall** that
  keeps auth/billing reachable and deletes nothing. Admins are never paywalled.
- **Driver interface**: `mock` (instant local loop for dev/tests) and `stripe` (Checkout, customer
  Portal, signature-verified webhooks over plain REST). Boot refuses misconfigured Stripe.
- `ACCOUNT` command: plan/status, upgrade, manage billing, change password, **export my data**
  (full-account JSON), sign out. Header trial countdown chip.

### Onboarding & operator
- First-login **role presets** (trader / equity researcher / macro / blank) seed a working
  workspace through the real command path; 30-second keyboard tour; shown exactly once.
- `ADMIN` founder dashboard: accounts, trial funnel, **MRR**, active today/this week, 14-day
  signups timeline, latest accounts.

### Launch kit
- `scripts/deploy.sh` — one-command production deploy (compose + Caddy automatic HTTPS, generated
  secrets, fail-loud misconfig). `marketing/landing.html` — self-contained landing page with
  honest data-posture positioning. `docs/BILLING.md`, `docs/LAUNCH.md` (7-day checklist + 30-day
  roadmap), beta-invite email and X launch-thread templates.

### Terminal (from the revamp cycles)
- Charting realism: labelled axes, gridlines, volume pane, crosshair OHLCV readout, last-price
  marker — daily (`GP`) and intraday (`GIP`).
- Command palette v2: ranked autocomplete (prefix → alias → fuzzy → title) + live symbol search.
- Named workspace layouts (`LAYOUT`), corporate events calendar (`EVT`) with market sessions,
  Docker one-command demo, first-run demo workspace.

## 0.1.0 — foundation

Clean-room terminal foundation: contracts (Zod), terminal kernel (parser/registry/executor),
provider capability model with deterministic mock + real SEC EDGAR and FRED adapters, module SDK,
Fastify API with SSE streaming, React tiling workspace with 30+ modules, plugin host with
conformance gating, SQLite/file persistence, audit log, optional bearer auth.
