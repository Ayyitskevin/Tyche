# TKT-049 — Billing: trials, entitlement gate, mock + Stripe drivers, ACCOUNT

**Priority:** P1 (MicroSaaS)  ·  **Milestone:** SaaS Cycle 2  ·  **Status:** shipped  ·  **Clean-room risk:** None

## Source evidence
- MicroSaaS loop, Cycle 2 review: Cycle 1 gave hosted Tyche accounts and a `BillingState` seeded as
  a 14-day trial, but nothing read it — trials never ended, nothing could be purchased, so there
  was still no revenue mechanism.

## Problem
Recurring billing with a low-friction trial: try free without a card, hit a clear paywall when the
trial lapses, pay monthly, self-serve cancel — without coupling the app to Stripe.

## Technical design
- **Entitlement** (`saas/billing.ts`): pure `entitlement(BillingState) → trial | pro | expired`.
  `pro` persists until a cancellation webhook (a missed renewal webhook must degrade to "still
  works", never "locked-out paying customer"). The hosted `onRequest` hook answers **402** on
  `expired` for terminal routes; auth, billing, health, and preflight stay reachable so the user
  can sign in, see status, and pay. Anonymous-open vs paywall-exempt path sets are distinct — the
  webhook is the only anonymously reachable billing route.
- **`BillingDriver`** interface: `createCheckout`, `createPortal`, `parseWebhook → BillingEvent[]`
  (`subscribed` / `renewed` / `canceled`); `applyBillingEvents` maps events onto the `UserRegistry`
  (find by user id for subscribe, by subscription id otherwise) and audits each one.
- **`MockBillingDriver`** (default in hosted mode): checkout completes instantly (returns the
  events inline), portal returns home, webhooks HMAC-signed with the session secret — the full
  trial → paywall → upgrade → pro loop runs locally with no Stripe account, and tests drive the
  exact production code path.
- **`StripeBillingDriver`**: plain REST (form-encoded fetch, no SDK): Checkout Sessions
  (`client_reference_id` = user id; reuses `stripeCustomerId` on re-subscribe), Billing Portal
  sessions, and `verifyStripeSignature` (t/v1 header, HMAC-SHA256 over `"t.payload"`,
  constant-time compare, 5-min tolerance) + `parseStripeEvents` for the three subscription events.
  Boot refuses `TYCHE_BILLING=stripe` without key/price/webhook secret.
- **Webhook raw body**: the route lives in an encapsulated Fastify scope whose JSON content-type
  parser keeps the payload as a string (signature verification needs exact bytes).
- **Web**: `ACCOUNT` command (aliases `SUB`, `BILLING`) → account panel (plan, status, Upgrade →
  checkout redirect, Manage billing → portal, Sign out; self-host renders an explanatory empty
  state). `PaywallScreen` at boot when the session reports an expired trial. Header trial-countdown
  chip (amber ≤ 3 days) opens ACCOUNT. `/api/health` exposes the active billing driver.

## Acceptance criteria
- [x] Trial → status → checkout → pro loop (mock driver) test-proven end-to-end over HTTP.
- [x] Expired trial: 402 on terminal routes, auth/billing reachable, upgrade lifts the gate
  (session survives across restarts; test boots a second app over the same data dir).
- [x] Webhooks: valid signature applies events (subscribe → pro, cancel → paywall, renewal date);
  tampered signature → 400 + audit.
- [x] Stripe signature verification + event mapping unit-tested (tamper, wrong secret, stale
  timestamp, unknown events ignored).
- [x] `TYCHE_BILLING=none` disables gate + routes; self-host unaffected; stripe misconfig refuses
  to boot. Full suite green (455 unit + 33 e2e).

## Clean-room notes
Commodity SaaS billing plumbing; no market data, no competitor material.

## Non-goals (later)
- Multiple tiers/seats, annual pricing, coupons — single Pro price first.
- Dunning emails / failed-payment retries beyond Stripe's defaults.
- Usage metering (not applicable — flat subscription).
