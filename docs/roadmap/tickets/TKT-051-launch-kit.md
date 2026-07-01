# TKT-051 — Launch kit: landing page, one-command production deploy, launch playbook

**Priority:** P1 (MicroSaaS)  ·  **Milestone:** SaaS Cycle 4  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- MicroSaaS loop, Cycle 4 review: the product loop is complete (accounts → trial → paywall →
  Stripe → admin metrics) but nothing existed between "code done" and "strangers pay": no
  production deploy story with TLS, no marketing surface, no launch plan.

## Problem
A founder should get from `git clone` to a TLS-terminated, billable, hosted deployment in one
command — and have a credible, honest public page plus a day-by-day plan for the first week and
first month.

## Technical design
- **Production deploy** (`docker-compose.prod.yml` + `deploy/Caddyfile` + `scripts/deploy.sh`):
  the existing single-container image (hosted mode, SQLite, durable audit log) behind Caddy with
  automatic Let's Encrypt TLS. `deploy.sh` bootstraps `.env.prod` from
  `deploy/env.prod.example`, generates `TYCHE_SESSION_SECRET`, refuses the example domain and
  compose-level misconfiguration (`:?` guards), then `up -d --build` and prints next steps
  (DNS, first-account-is-admin, Stripe webhook URL). `.env.prod` is git-ignored.
- **Landing page** (`marketing/landing.html`): a single self-contained static file (inline CSS,
  no build step) with SEO/OG/Twitter meta, a terminal-style hero, feature grid, **honest
  positioning block** (sells software + hosting, never market data; BYO keys; no advice; no
  orders — stated as the differentiator, not fine print), self-host $0 / Pro $29 / Team $59
  pricing, and a FAQ that answers the data-licensing question head-on. Deployable to any static
  host; placeholder domain clearly marked for replacement.
- **Launch playbook** (`docs/LAUNCH.md`): a 7-day checklist (infra → billing dry-run → landing +
  analytics → demo content → soft launch → hardening → public launch) and a weekly 30-day roadmap
  (launch/listen → activation → conversion → retention), each with a measurable goal, plus the
  viability math ($29 × 35 ≈ $1k MRR on a ~$20/mo stack — no per-seat data costs by design).
- **Demo-seed fix** (`App.tsx`): the Docker image bakes `VITE_DEMO_WORKSPACE=1`; demo seeding now
  runs only when `appMode !== 'hosted'` so hosted first-run is owned by the role-preset
  onboarding — one image correctly serves both the public demo and production SaaS.

## Acceptance criteria
- [x] `./scripts/deploy.sh` (fresh checkout): first run scaffolds `.env.prod` with a generated
  secret and exits with instructions; second run refuses the example domain; with a real domain
  it builds and starts tyche + caddy. POSIX-sh syntax checked.
- [x] Hosted first-run shows role onboarding, not the demo workspace, from the same image.
- [x] Landing page is a single file with complete meta tags and the honest data posture above
  the fold; no external assets required.
- [x] Full suite green (460 unit + 33 e2e) after the App.tsx gating change.

## Clean-room notes
Deployment/marketing collateral only; no market data, no competitor material.

## Non-goals (later)
- Published container images (GHCR) + release workflow; multi-node/managed-DB deployments.
- Marketing site generator/blog; the single file is intentionally dependency-free.
- Automated dunning emails (Stripe's built-ins cover the start).
