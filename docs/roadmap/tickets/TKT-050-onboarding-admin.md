# TKT-050 — Onboarding role presets + founder ADMIN dashboard

**Priority:** P1 (MicroSaaS)  ·  **Milestone:** SaaS Cycle 3  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- MicroSaaS loop, Cycle 3 review: hosted Tyche could acquire (C1 accounts) and charge (C2 billing)
  a customer, but a new sign-up landed on an **empty grid** in an unfamiliar command language — the
  single worst moment of the funnel for a trial-to-paid product — and the founder had **zero
  visibility** into accounts/trials/MRR without grepping `users.json`.

## Problem
1. First-run time-to-value: a trial user must see a working terminal for *their* job within
   seconds, plus the three keyboard ideas that make Tyche click (⌘K, `SYMBOL CMD`, Tab).
2. The operator needs the handful of numbers a one-person SaaS steers by, inside the product.

## Technical design
- **Role presets** (`apps/web/src/app/onboarding.ts`): trader / equity researcher / macro watcher /
  blank; each seeds a starter workspace **through the real command path** (`executeInput`), renames
  it, and saves. Pure data module, unit-tested against the command registry (every seed resolves to
  a registered command or alias).
- **`OnboardingScreen`**: shown once — hosted mode, nothing restored, and
  `preferences.onboardingRole == null` (a new `UserPreferences` field, nullable, default null —
  stored per-user thanks to C1's scoped persistence). Picking a card seeds + persists the role;
  the screen doubles as the 30-second welcome tour (⌘K, example command, Tab, ⌘E, ACCOUNT).
  Self-host and demo builds are untouched (`VITE_DEMO_WORKSPACE` seeding runs first).
- **`GET /api/admin/metrics`** (`routes/admin.ts`): hosted + admin only (403 for members, 400 in
  self-host). Returns account counts by entitlement, trials ending ≤ 3 days, `mrr = pro ×
  TYCHE_PRICE_MONTHLY` (display-only config, default 29), the active billing driver, a zero-filled
  14-day signups timeline, and the 8 latest accounts.
- **Admins are never paywalled** (`app.ts` gate: `!user.admin`): the founder's own expired trial
  must not lock them out of their own service (and their dashboard).
- **`ADMIN` command** (aliases `METRICS`, `MRR`) → dashboard module: stat cards, signup bars (pure
  CSS, no chart dependency), latest-accounts table; explanatory empty states for self-host and
  non-admin viewers.

## Acceptance criteria
- [x] First hosted login with no data → role picker → seeded, named, saved workspace; never shown
  again (preference persisted per-user); blank escape hatch.
- [x] Preset seeds validated against the command registry in unit tests.
- [x] Metrics: counts/MRR/timeline correct after registering 3 users and upgrading 1 (test-proven);
  member → 403; self-host → 400.
- [x] Expired-trial founder still reaches terminal + metrics (admin paywall exemption test).
- [x] Full suite green (460 unit + 33 e2e); self-host flow byte-for-byte unchanged.

## Clean-room notes
Onboarding/analytics plumbing only; no market data, no competitor material.

## Non-goals (later)
- Interactive multi-step product tour, checklist widgets.
- Cohort retention curves, revenue analytics beyond MRR (export to a real analytics stack instead).
- Editable roles post-signup (re-run by clearing the preference; a SETTINGS affordance can come later).
