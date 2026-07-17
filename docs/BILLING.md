# Billing (hosted mode)

Tyche-hosted charges for **software + hosting — never market data**. Live data sources stay
bring-your-own-key; the mock provider is synthetic. Billing only exists in hosted mode
(`TYCHE_MODE=hosted`, see `SECURITY.md` for the account layer) and is a **driver** behind a small
interface, so the rest of the app only ever reads an account's `BillingState`.

## How entitlement works

Every account starts on a **14-day trial** at registration (no card). The API computes one of three
entitlements from `BillingState` on every request:

| Entitlement | Meaning | API behavior |
| ----------- | ------- | ------------ |
| `trial`     | Trial window still open | Full access |
| `pro`       | Active subscription     | Full access |
| `expired`   | Trial over, no plan     | **402** on terminal routes; auth + billing + health stay reachable |

A `pro` account stays `pro` until the billing provider says otherwise (cancellation webhook) — a
missed renewal webhook degrades to "still works", never "locked-out paying customer". On `expired`,
the web app shows a paywall screen (upgrade or sign out); **no data is deleted**. **Admin accounts
are never paywalled** — the operator can't be locked out of their own deployment (or the `ADMIN`
dashboard) by their own trial clock.

## Drivers

Select with `TYCHE_BILLING`:

- **`none`** (default) — accounts without a paywall (private/team deployments, soft launches).
  Trials never enforce. The default **fails closed**: forgetting to configure billing can never
  hand out free upgrades.
- **`stripe`** — production. Checkout Sessions for upgrade, the customer Portal for self-serve
  management, signature-verified webhooks as the source of truth.
- **`mock`** — **development and tests only, set explicitly**: `POST /api/billing/checkout`
  "succeeds" instantly and marks the account `pro` **without payment**; the portal link returns
  home; webhooks are HMAC-signed (`x-tyche-signature`, hex HMAC-SHA256 of the raw body with
  `TYCHE_SESSION_SECRET`). The API logs a loud warning at boot when this driver is active.

## Stripe setup (one-time, ~15 minutes)

1. **Product & price** — In the Stripe dashboard create a Product ("Tyche Pro") with a recurring
   monthly Price (e.g. $29–$59/mo). Copy the price id (`price_…`). Optionally add a second,
   **annual** recurring Price on the same product — price it at ~10× the monthly (so "2 months
   free" is honest) — and copy its id for `STRIPE_PRICE_ID_ANNUAL`. When set, `ACCOUNT` shows a
   yearly option alongside monthly; when unset, an annual checkout simply bills monthly.
2. **API key** — Developers → API keys → copy the **secret** key (`sk_live_…` / `sk_test_…`).
3. **Webhook endpoint** — Developers → Webhooks → Add endpoint:
   - URL: `https://<your-domain>/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - Copy the signing secret (`whsec_…`).
4. **Customer portal** — Settings → Billing → Customer portal → activate it (default configuration
   is fine; it powers "Manage billing").
5. **Environment**:

   ```bash
   TYCHE_MODE=hosted
   TYCHE_SESSION_SECRET=<openssl rand -base64 32>
   TYCHE_BILLING=stripe
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRICE_ID=price_...
   STRIPE_PRICE_ID_ANNUAL=price_...   # optional; enables the yearly plan in ACCOUNT
   STRIPE_WEBHOOK_SECRET=whsec_...
   TYCHE_PUBLIC_URL=https://<your-domain>   # checkout/portal redirect target
   ```

   The API **refuses to boot** with `TYCHE_BILLING=stripe` unless all three Stripe variables are
   set — no silently unbillable deployments.

6. **Test the loop** with Stripe test keys + card `4242 4242 4242 4242`, then flip to live keys —
   see the go-live checklist below.

## Going live: verify, then cut over

The unit suite already proves the server logic end to end (`apps/api/src/saas/billing.test.ts`
covers trial → checkout → `pro`, the 402 paywall lifting on upgrade, and signed-webhook →
entitlement transitions). What's left is verifying **your** Stripe wiring and cutting from test to
live. Do all of this on staging (or your box before any real users).

### 0. Dry-run the UI without Stripe (optional)

To click the paywall/upgrade UI with zero Stripe, run the **mock** driver:

```bash
TYCHE_MODE=hosted TYCHE_SESSION_SECRET=<≥16 chars> TYCHE_BILLING=mock \
  pnpm --filter @tyche/api start
```

Register → `ACCOUNT` → **Upgrade** flips to Pro instantly (no card). The boot log prints
`[billing] MOCK billing driver active: checkout is free.` — that line must **never** appear in
production.

### 1. Test the webhook locally with the Stripe CLI

The dashboard endpoint's signing secret and the Stripe CLI's are **different** `whsec_…` values —
while forwarding locally, use the CLI's:

```bash
stripe login
stripe listen --forward-to localhost:4010/api/billing/webhook   # prints whsec_… → set STRIPE_WEBHOOK_SECRET to THIS
stripe trigger checkout.session.completed
```

A correctly signed event returns `200 {applied:…}`; tamper with the body and it returns `400`
(and is audited).

### 2. Test-mode dry run (test keys + card `4242 4242 4242 4242`)

1. Register a throwaway account → it's on a 14-day trial (full access).
2. `ACCOUNT` → **Upgrade — Monthly** → pay with `4242 4242 4242 4242` (any future expiry / CVC) →
   redirect back → `ACCOUNT` shows **Pro**.
3. Cancel in the Stripe **customer portal** → the `customer.subscription.deleted` webhook lands →
   the account returns to the paywall, **data intact**.
4. Negative checks (these are what actually go wrong):
   - Before upgrading, an expired-trial account gets **402** on terminal routes (auth / billing /
     health stay reachable) and sees the paywall.
   - The checkout redirect lands on **your domain**, not `localhost` — if it doesn't, fix
     `TYCHE_PUBLIC_URL`.
   - The admin account (`TYCHE_ADMIN_EMAIL`) is never paywalled.
   - Production logs do **not** contain the `MOCK billing driver active` line.

### 3. Cut over to live

Stripe test and live are separate worlds — **secrets do not carry over**:

- Swap `sk_test_…` → `sk_live_…`.
- Recreate the Product/Price in **live** mode; set `STRIPE_PRICE_ID` (and, if used,
  `STRIPE_PRICE_ID_ANNUAL`) to the **live** ids.
- Add the webhook endpoint again in **live** mode (same URL, same three events); set
  `STRIPE_WEBHOOK_SECRET` to the new **live** `whsec_…`.
- Confirm `TYCHE_MODE=hosted`, `TYCHE_BILLING=stripe`, `TYCHE_PUBLIC_URL=https://<domain>`,
  then redeploy.
- Re-run the §2 dry run once with a **real card** (refund yourself in the dashboard), and you're
  taking money.

## Event mapping

| Stripe event | Effect on the account |
| ------------ | --------------------- |
| `checkout.session.completed` | `plan: pro`, customer + subscription ids recorded (the checkout carries the user id in `client_reference_id`) |
| `customer.subscription.updated` (status `active`/`trialing`) | `plan: pro`, `currentPeriodEnd` refreshed |
| `customer.subscription.updated` (status `canceled`/`unpaid`/`incomplete_expired`) | `plan: none` → paywall (data intact) |
| `customer.subscription.deleted` | `plan: none` → paywall (data intact) |
| anything else | ignored |

Webhook signatures are verified (HMAC-SHA256, constant-time compare, 5-minute timestamp tolerance)
before any event is applied; bad signatures answer 400 and are audited.

## Surfaces

- `GET /api/billing` — plan, entitlement, trial days left, renewal date (session required).
- `POST /api/billing/checkout` / `POST /api/billing/portal` — return a redirect `url`.
- `POST /api/billing/webhook` — provider-called; signature-verified, never session-authenticated.
- **`ACCOUNT`** command (aliases `SUB`, `BILLING`) — plan/status panel with Upgrade / Manage
  billing / Sign out. The header shows a trial-countdown chip (amber in the last 3 days) that opens
  it.

All billing mutations land in the audit trail (`billing.checkout`, `billing.subscribed`,
`billing.renewed`, `billing.canceled`, plus denied webhooks).

## Team / seat mode (closed signups)

For a small-team deployment, close open registration and provision seats by invite:

```bash
TYCHE_SIGNUPS=closed         # only invited emails (and the first/admin account) can join
TYCHE_SEATS=10               # optional cap on accounts + outstanding invites; unset/0 = unlimited
TYCHE_EMAIL_SINK=http        # invites are emailed; console sink logs the link (dev only)
TYCHE_EMAIL_WEBHOOK_URL=...
```

Seats are **decoupled from billing** — they gate access only; each account keeps its own
trial→pro entitlement. A seat is consumed by an existing account **or** an outstanding invite, so a
closed instance can't be oversubscribed between "invite sent" and "invite accepted".

- In **`ADMIN`**, the operator sees `Seats: used / limit` and a **Team** panel to invite an email
  (`POST /api/admin/invite`) or revoke a pending one (`POST /api/admin/invite/revoke`). Inviting is
  blocked once the cap is reached.
- The invitee gets an emailed single-use link (`/invite.html?token=…`, 7-day expiry) →
  `POST /api/auth/invite/accept` creates their account (starting **verified**, since the invite
  proves the address), signs them in, and drops them into the standard onboarding.
- Audited as `admin.invite`, `admin.invite_revoke`, `auth.invite_accept`.

Single-process by design (the invite registry dedups per instance, like sessions/rate-limiting).
