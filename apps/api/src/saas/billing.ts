import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuditSink } from '../security/audit';
import type { BillingState, UserRecord, UserRegistry } from './users';

/** What the account is currently entitled to. `expired` means paywall. */
export type Entitlement = 'trial' | 'pro' | 'expired';

export function entitlement(billing: BillingState, nowMs = Date.now()): Entitlement {
  // A pro plan stays pro until the billing provider tells us otherwise
  // (cancellation/deletion webhook) — never on a clock, so a missed renewal
  // webhook degrades to "still works", not "locked out customer".
  if (billing.plan === 'pro') return 'pro';
  if (Date.parse(billing.trialEndsAt) > nowMs) return 'trial';
  return 'expired';
}

export function trialDaysLeft(billing: BillingState, nowMs = Date.now()): number {
  const ms = Date.parse(billing.trialEndsAt) - nowMs;
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

/** Billing cadence of a subscription: the monthly plan or the annual plan. */
export type BillingInterval = 'month' | 'year';

/** Provider-agnostic billing facts, produced by webhook parsing or mock checkout. */
export type BillingEvent =
  | {
      type: 'subscribed';
      userId: string;
      customerId: string;
      subscriptionId: string;
      currentPeriodEnd?: string;
      interval?: BillingInterval;
    }
  | { type: 'renewed'; subscriptionId: string; currentPeriodEnd: string }
  | { type: 'canceled'; subscriptionId: string };

export interface CheckoutResult {
  url: string;
  /** Events that completed as part of checkout (the mock driver "pays" instantly). */
  completed?: BillingEvent[];
}

/**
 * A billing backend. Drivers translate provider specifics (Stripe today) into
 * `BillingEvent`s; the route layer applies those onto the user registry, so the
 * rest of the app only ever reads `BillingState`/`entitlement()`.
 */
export interface BillingDriver {
  readonly name: 'mock' | 'stripe';
  createCheckout(
    user: UserRecord,
    urls: { successUrl: string; cancelUrl: string },
    interval?: BillingInterval,
  ): Promise<CheckoutResult>;
  createPortal(user: UserRecord, returnUrl: string): Promise<{ url: string }>;
  /** Verify the webhook signature and parse events. Throws on a bad signature/payload. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): BillingEvent[];
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Development/test driver: checkout "succeeds" instantly (no card, no network)
 * so the full trial → paywall → upgrade → pro loop is exercisable locally.
 * Webhooks are HMAC-signed with the deployment secret (`x-tyche-signature`).
 */
export class MockBillingDriver implements BillingDriver {
  readonly name = 'mock' as const;

  constructor(private readonly secret: string) {}

  async createCheckout(
    user: UserRecord,
    urls: { successUrl: string; cancelUrl: string },
    interval: BillingInterval = 'month',
  ): Promise<CheckoutResult> {
    const periodDays = interval === 'year' ? 365 : 30;
    return {
      url: urls.successUrl,
      completed: [
        {
          type: 'subscribed',
          userId: user.id,
          customerId: `mock_cus_${user.id}`,
          subscriptionId: `mock_sub_${user.id}`,
          currentPeriodEnd: new Date(Date.now() + periodDays * 86_400_000).toISOString(),
          interval,
        },
      ],
    };
  }

  async createPortal(_user: UserRecord, returnUrl: string): Promise<{ url: string }> {
    return { url: returnUrl };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): BillingEvent[] {
    const signature = first(headers['x-tyche-signature']);
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    if (!signature || !safeEqualHex(signature, expected)) throw new Error('bad_signature');
    const parsed = JSON.parse(rawBody) as { events?: BillingEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  }
}

/**
 * Verify a `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=...]`): HMAC-SHA256
 * of `"<t>.<payload>"` with the endpoint secret, constant-time compared, with a
 * timestamp tolerance against replay. Exported for direct testing.
 */
export function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  toleranceSec = 300,
  nowMs = Date.now(),
): boolean {
  let timestamp: number | null = null;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = Number(value);
    if (key === 'v1') candidates.push(value);
  }
  if (timestamp === null || !Number.isFinite(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return candidates.some((candidate) => safeEqualHex(candidate, expected));
}

interface StripeEventPayload {
  type?: string;
  data?: {
    object?: {
      client_reference_id?: string | null;
      customer?: string | null;
      subscription?: string | null;
      id?: string;
      status?: string;
      current_period_end?: number;
      metadata?: { interval?: string };
    };
  };
}

/** Narrow an arbitrary string to a BillingInterval, or undefined. */
function asInterval(value: string | undefined): BillingInterval | undefined {
  return value === 'month' || value === 'year' ? value : undefined;
}

/** Map a raw Stripe event JSON body to billing events (unknown types → []). */
export function parseStripeEvents(rawBody: string): BillingEvent[] {
  const event = JSON.parse(rawBody) as StripeEventPayload;
  const obj = event.data?.object;
  if (!event.type || !obj) return [];
  if (event.type === 'checkout.session.completed') {
    if (!obj.client_reference_id || !obj.customer || !obj.subscription) return [];
    const interval = asInterval(obj.metadata?.interval);
    return [
      {
        type: 'subscribed',
        userId: obj.client_reference_id,
        customerId: obj.customer,
        subscriptionId: obj.subscription,
        ...(interval ? { interval } : {}),
      },
    ];
  }
  if (event.type === 'customer.subscription.updated') {
    if (!obj.id) return [];
    if (['canceled', 'unpaid', 'incomplete_expired'].includes(obj.status ?? '')) {
      return [{ type: 'canceled', subscriptionId: obj.id }];
    }
    if (['active', 'trialing'].includes(obj.status ?? '') && typeof obj.current_period_end === 'number') {
      return [
        { type: 'renewed', subscriptionId: obj.id, currentPeriodEnd: new Date(obj.current_period_end * 1000).toISOString() },
      ];
    }
    return [];
  }
  if (event.type === 'customer.subscription.deleted') {
    return obj.id ? [{ type: 'canceled', subscriptionId: obj.id }] : [];
  }
  return [];
}

const STRIPE_API = 'https://api.stripe.com/v1';

export interface StripeConfig {
  secretKey: string;
  priceId: string;
  /** Optional second (annual) price. When unset, an annual checkout falls back to monthly. */
  annualPriceId?: string | null;
  webhookSecret: string;
}

/**
 * Choose the Stripe price for a requested interval. `year` uses the annual price
 * when configured; if it isn't, it falls back to the monthly price AND reports
 * `interval: 'month'` so the stored state matches what was actually billed. Pure
 * (no side effects) so the selection is unit-testable without a network call.
 */
export function resolveCheckoutPrice(
  cfg: { priceId: string; annualPriceId?: string | null },
  interval: BillingInterval,
): { priceId: string; interval: BillingInterval } {
  if (interval === 'year' && cfg.annualPriceId) return { priceId: cfg.annualPriceId, interval: 'year' };
  return { priceId: cfg.priceId, interval: 'month' };
}

/**
 * Stripe subscriptions over plain REST (form-encoded; no SDK dependency):
 * Checkout for the upgrade, the customer Portal for self-serve management, and
 * signature-verified webhooks for the source of truth on subscription state.
 */
export class StripeBillingDriver implements BillingDriver {
  readonly name = 'stripe' as const;
  private annualFallbackWarned = false;

  constructor(private readonly cfg: StripeConfig) {}

  private async post(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    });
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok || !json) {
      throw new Error(json?.error?.message ?? `Stripe request failed (HTTP ${res.status}).`);
    }
    return json as Record<string, unknown>;
  }

  async createCheckout(
    user: UserRecord,
    urls: { successUrl: string; cancelUrl: string },
    interval: BillingInterval = 'month',
  ): Promise<CheckoutResult> {
    const price = resolveCheckoutPrice(this.cfg, interval);
    if (interval === 'year' && price.interval === 'month' && !this.annualFallbackWarned) {
      this.annualFallbackWarned = true;
      console.warn(
        '[billing] annual checkout requested but STRIPE_PRICE_ID_ANNUAL is unset — billing monthly instead. Set the annual price to offer the yearly plan.',
      );
    }
    const form: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price]': price.priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      // Echoed back on checkout.session.completed, so the webhook can record the
      // billed interval without a second API round-trip to expand line items.
      'metadata[interval]': price.interval,
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
    };
    // Reuse the Stripe customer on re-subscribe so history stays in one place.
    if (user.billing.stripeCustomerId) form.customer = user.billing.stripeCustomerId;
    else form.customer_email = user.email;
    const session = await this.post('/checkout/sessions', form);
    return { url: String(session.url) };
  }

  async createPortal(user: UserRecord, returnUrl: string): Promise<{ url: string }> {
    if (!user.billing.stripeCustomerId) throw new Error('no_customer');
    const session = await this.post('/billing_portal/sessions', {
      customer: user.billing.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: String(session.url) };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): BillingEvent[] {
    const signature = first(headers['stripe-signature']);
    if (!signature || !verifyStripeSignature(rawBody, signature, this.cfg.webhookSecret)) {
      throw new Error('bad_signature');
    }
    return parseStripeEvents(rawBody);
  }
}

/** Apply billing events onto the user registry. Returns how many matched a user. */
export async function applyBillingEvents(
  users: UserRegistry,
  events: BillingEvent[],
  audit: AuditSink,
): Promise<number> {
  let applied = 0;
  for (const event of events) {
    if (event.type === 'subscribed') {
      const user = users.get(event.userId);
      if (!user) continue;
      await users.update(user.id, {
        billing: {
          ...user.billing,
          plan: 'pro',
          stripeCustomerId: event.customerId,
          stripeSubscriptionId: event.subscriptionId,
          ...(event.currentPeriodEnd ? { currentPeriodEnd: event.currentPeriodEnd } : {}),
          ...(event.interval ? { interval: event.interval } : {}),
        },
      });
      audit.record({ at: new Date().toISOString(), actor: user.email, action: 'billing.subscribed', outcome: 'allow' });
      applied += 1;
      continue;
    }
    const user = users.list().find((u) => u.billing.stripeSubscriptionId === event.subscriptionId);
    if (!user) continue;
    if (event.type === 'renewed') {
      await users.update(user.id, {
        billing: { ...user.billing, plan: 'pro', currentPeriodEnd: event.currentPeriodEnd },
      });
    } else {
      // Canceled: drop to no plan. The (long-past) trial does not resurrect, so
      // the account lands on the paywall while keeping all of its data intact.
      await users.update(user.id, { billing: { ...user.billing, plan: 'none' } });
    }
    audit.record({ at: new Date().toISOString(), actor: user.email, action: `billing.${event.type}`, outcome: 'allow' });
    applied += 1;
  }
  return applied;
}
