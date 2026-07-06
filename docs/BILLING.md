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

6. **Test the loop** with Stripe test keys + card `4242 4242 4242 4242`, then flip to live keys.

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
