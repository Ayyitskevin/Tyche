# TKT-052 — Final launch pass: auth hardening, data portability, activity metrics, launch collateral

**Priority:** P1 (MicroSaaS)  ·  **Milestone:** Final transformation pass (v0.2.0)  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- Final-pass review of the merged SaaS layer (PRs #34–#36): three "paying-customer" gaps —
  `tokenEpoch` existed but nothing ever bumped it (no password change), the landing page promised
  "cancel anytime — export everything" with no export endpoint, and SECURITY.md itself listed
  auth rate limiting as an unshipped gap. Plus: the founder dashboard counted accounts but not
  *activity*, and the launch plan referenced collateral (X thread, beta email) that didn't exist.
- **Independent adversarial review (two parallel agents, quota restored)** confirmed those and
  found more, all fixed in this pass: hosted billing defaulted to the mock driver (a free-upgrade
  button on any deployment that forgot `TYCHE_BILLING=stripe`); the paywall blocked the very
  export the landing page promised; `secure:'auto'` cookies lost the Secure flag behind the TLS
  proxy (no `trustProxy`); the first-registrant admin rule raced strangers on exposed deployments
  even when `TYCHE_ADMIN_EMAIL` was set; login timing leaked account existence; no account
  deletion existed; the landing hero demoed the wrong commands (`SECF` is symbol search — filings
  is `CF`; `CPI` is not a FRED id — `GDP` is); the onboarding tour taught ⌘E where the default
  binding is ⌘S; an advertised Team tier wasn't purchasable; `twitter:card` had no image tags;
  and no terms/privacy documents existed anywhere in the funnel.

## Problem
Close every promise-vs-code gap before launch, and finish the marketing collateral so launch day
is copy-paste, not copywriting.

## Technical design (review-driven additions)
- **Billing fails closed**: `TYCHE_BILLING` defaults to `none` everywhere (env loader, prod
  compose, env examples); the mock driver must be selected explicitly and warns loudly at boot.
- **Export survives the paywall**: `/api/account/export` added to the paywall-exempt set (session
  still required) and the PaywallScreen gained an "Export my data" button — the landing promise is
  now true from the paywall itself.
- **`trustProxy` in hosted mode**: `secure:'auto'` cookies and rate-limiter client IPs are correct
  behind Caddy.
- **Admin bootstrap hardened**: with `TYCHE_ADMIN_EMAIL` set, only that email is granted admin;
  first-account fallback applies only when unset.
- **Enumeration blunted**: unknown-email logins burn the same scrypt cost (timing equalized).
- **Account deletion**: `POST /api/auth/delete` (password-confirmed, rate-limited) removes the
  registry record and the user's entire data directory (`UserStores.destroy`); ACCOUNT panel
  danger-zone UI. The export/delete pair is the product's "right to leave".
- **Copy/factual fixes**: landing hero commands corrected (`NVDA CF`, `ECO GDP`), watchlist-export
  claim replaced with the real full-account JSON export, Team tier reframed as a managed private
  instance, `og:image`/`twitter:image` placeholder tags added, footer links to `/terms.html` +
  `/privacy.html`; onboarding tour teaches ⌘S (the actual default) and mentions rebinding.
- **Legal templates**: `marketing/legal/{terms,privacy}-template.md` (clearly marked for lawyer
  review) + a Day-3 LAUNCH.md checklist item gating payments on publishing them.

## Technical design (original scope)
- **Rate limiting** (`security/rateLimit.ts`): dependency-free sliding-window limiter (per-key
  timestamps, opportunistic pruning). Auth credential endpoints share a per-IP budget of
  20 attempts / 10 minutes → 429 + audit (`auth.rate_limited`). In-process by design; multi-node
  deployments also limit at the proxy (documented).
- **Password change** (`POST /api/auth/password`): verifies the current password, re-hashes with
  a fresh salt, bumps `tokenEpoch` (killing every other session), and re-issues the current
  session's cookie. ACCOUNT panel gains a collapsible change-password form.
- **Full account export** (`GET /api/account/export`): one JSON with preferences, workspaces,
  watchlists, notes, portfolios, screens, and alerts. Works in self-host too (local store); in
  hosted mode the scoped persistence guarantees it's exactly the signed-in account's data.
  ACCOUNT panel gains "Export my data" (client-side download). Audited.
- **Activity metrics**: `UserRecord.lastSeenAt` stamped in the session hook, throttled to once
  per hour per user so the registry isn't rewritten per request. `ADMIN` shows Active today /
  This week.
- **v0.2.0**: root version bump + `CHANGELOG.md` (0.1.0 foundation → 0.2.0 SaaS release) —
  the public-changelog habit the Week-4 roadmap calls for starts now.
- **Launch collateral**: `marketing/launch-thread.md` (5-tweet X thread with posting notes) and
  `marketing/beta-invite-email.md` (personalized template with the one-question feedback ask);
  LAUNCH.md wired to both; SECURITY.md gap list updated (remaining: email verification + reset).

## Acceptance criteria
- [x] 21st+ rapid auth attempt from one IP answers 429 (test: 20 allowed, 5 limited of 25).
- [x] Password change: wrong current 401; old session cookie dead after change; re-issued cookie
  and new password both work (test-proven).
- [x] Export contains the caller's data and stamp, never another account's; self-host works with
  a null account stamp (test-proven).
- [x] `ADMIN` reports activeToday/activeWeek ≥ 1 after authenticated traffic (test-proven).
- [x] Full suite green; self-host default flow unchanged.

## Clean-room notes
Security/portability plumbing and original marketing copy; no market data, no competitor material.

## Non-goals (later)
- Email verification and email-based password reset (email-provider decision pending).
- Import of the account export (round-trip) — workspaces/notes already have JSON import paths.
