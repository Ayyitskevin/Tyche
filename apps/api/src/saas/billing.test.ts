import { describe, it, expect, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { entitlement, parseStripeEvents, trialDaysLeft, verifyStripeSignature } from './billing';
import type { BillingState } from './users';

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-billing-'));
  dirs.push(dir);
  return dir;
}

const SECRET = 'test-session-secret-0123456789';

async function hostedApp(over: Record<string, unknown> = {}): Promise<FastifyInstance> {
  const app = await buildApp({
    config: { mode: 'hosted', sessionSecret: SECRET, billing: 'mock', dataDir: tempDir(), ...over },
  });
  apps.push(app);
  return app;
}

async function register(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'hunter22222' } });
  expect(res.statusCode).toBe(201);
  return res.cookies.find((c) => c.name === 'tyche_session')!.value;
}

afterAll(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('entitlement', () => {
  const base: BillingState = { plan: 'trial', trialEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() };

  it('maps trial, expiry, and pro', () => {
    expect(entitlement(base)).toBe('trial');
    expect(entitlement({ ...base, trialEndsAt: new Date(Date.now() - 1000).toISOString() })).toBe('expired');
    expect(entitlement({ ...base, plan: 'pro' })).toBe('pro');
    expect(entitlement({ plan: 'none', trialEndsAt: new Date(Date.now() - 1000).toISOString() })).toBe('expired');
  });

  it('counts remaining trial days (ceiling, never negative)', () => {
    expect(trialDaysLeft(base)).toBe(5);
    expect(trialDaysLeft({ ...base, trialEndsAt: new Date(Date.now() - 86_400_000).toISOString() })).toBe(0);
  });
});

describe('hosted billing flow (mock driver)', () => {
  it('trial → status → instant mock checkout → pro', async () => {
    const app = await hostedApp();
    const cookie = await register(app, 'buyer@example.com');

    const before = await app.inject({ method: 'GET', url: '/api/billing', cookies: { tyche_session: cookie } });
    expect(before.statusCode).toBe(200);
    expect(before.json().data.plan).toBe('trial');
    expect(before.json().data.entitlement).toBe('trial');
    expect(before.json().data.trialDaysLeft).toBeGreaterThan(0);

    const checkout = await app.inject({ method: 'POST', url: '/api/billing/checkout', cookies: { tyche_session: cookie } });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().data.url).toContain('billing=success');

    const after = await app.inject({ method: 'GET', url: '/api/billing', cookies: { tyche_session: cookie } });
    expect(after.json().data.plan).toBe('pro');
    expect(after.json().data.entitlement).toBe('pro');
  });

  it('paywalls an expired trial with 402 but keeps auth/billing reachable, and upgrade lifts it', async () => {
    // Register, then expire the trial on disk and boot a second app over the
    // same data dir — the stateless session cookie stays valid across boots.
    const dataDir = tempDir();
    const first = await buildApp({ config: { mode: 'hosted', sessionSecret: SECRET, billing: 'mock', dataDir } });
    let cookie: string;
    try {
      const res = await first.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'expired@example.com', password: 'hunter22222' },
      });
      expect(res.statusCode).toBe(201);
      cookie = res.cookies.find((c) => c.name === 'tyche_session')!.value;
    } finally {
      await first.close();
    }
    const usersFile = join(dataDir, 'users.json');
    const parsed = JSON.parse(readFileSync(usersFile, 'utf8')) as {
      users: Array<{ billing: { trialEndsAt: string } }>;
    };
    parsed.users[0]!.billing.trialEndsAt = new Date(Date.now() - 1000).toISOString();
    writeFileSync(usersFile, JSON.stringify(parsed), 'utf8');

    const app = await hostedApp({ dataDir });
    const blocked = await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: cookie } });
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().error.kind).toBe('payment_required');
    const auth = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } });
    expect(auth.statusCode).toBe(200);
    const status = await app.inject({ method: 'GET', url: '/api/billing', cookies: { tyche_session: cookie } });
    expect(status.statusCode).toBe(200);
    expect(status.json().data.entitlement).toBe('expired');

    const checkout = await app.inject({ method: 'POST', url: '/api/billing/checkout', cookies: { tyche_session: cookie } });
    expect(checkout.statusCode).toBe(200);
    const unblocked = await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: cookie } });
    expect(unblocked.statusCode).toBe(200);
  });

  it('webhook: valid signature applies events; tampered signature is rejected', async () => {
    const app = await hostedApp();
    const cookie = await register(app, 'hooked@example.com');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } });
    const userId = me.json().data.user.id as string;

    const body = JSON.stringify({
      events: [{ type: 'subscribed', userId, customerId: 'cus_1', subscriptionId: 'sub_1' }],
    });
    const signature = createHmac('sha256', SECRET).update(body).digest('hex');

    const bad = await app.inject({
      method: 'POST',
      url: '/api/billing/webhook',
      payload: body,
      headers: { 'content-type': 'application/json', 'x-tyche-signature': 'deadbeef' },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/billing/webhook',
      payload: body,
      headers: { 'content-type': 'application/json', 'x-tyche-signature': signature },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.applied).toBe(1);

    const status = await app.inject({ method: 'GET', url: '/api/billing', cookies: { tyche_session: cookie } });
    expect(status.json().data.plan).toBe('pro');

    // Cancellation drops the plan; with the trial past, the paywall returns.
    const cancel = JSON.stringify({ events: [{ type: 'canceled', subscriptionId: 'sub_1' }] });
    const cancelRes = await app.inject({
      method: 'POST',
      url: '/api/billing/webhook',
      payload: cancel,
      headers: { 'content-type': 'application/json', 'x-tyche-signature': createHmac('sha256', SECRET).update(cancel).digest('hex') },
    });
    expect(cancelRes.json().data.applied).toBe(1);
    const downgraded = await app.inject({ method: 'GET', url: '/api/billing', cookies: { tyche_session: cookie } });
    expect(downgraded.json().data.plan).toBe('none');
  });

  it('health exposes the billing driver; billing:none disables the gate and the routes', async () => {
    const app = await hostedApp({ billing: 'none' });
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json().billing).toBe('none');
    const cookie = await register(app, 'nobilling@example.com');
    const status = await app.inject({ method: 'GET', url: '/api/billing', cookies: { tyche_session: cookie } });
    expect(status.statusCode).toBe(400);
    expect(status.json().error.kind).toBe('billing_disabled');
  });

  it('refuses to boot hosted stripe billing without the Stripe config', async () => {
    await expect(
      buildApp({ config: { mode: 'hosted', sessionSecret: SECRET, billing: 'stripe', dataDir: tempDir() } }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });

  it('keeps self-host mode billing-free', async () => {
    const app = await buildApp({ config: { dataDir: tempDir() } });
    apps.push(app);
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json().billing).toBe('none');
    expect((await app.inject({ method: 'GET', url: '/api/billing' })).statusCode).toBe(400);
  });
});

describe('Stripe webhook verification and parsing', () => {
  const secret = 'whsec_test_secret';

  function sign(payload: string, timestampSec: number): string {
    const mac = createHmac('sha256', secret).update(`${timestampSec}.${payload}`).digest('hex');
    return `t=${timestampSec},v1=${mac}`;
  }

  it('accepts a valid signature and rejects tampering, wrong secrets, and stale timestamps', () => {
    const payload = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_9' } } });
    const now = Date.now();
    const t = Math.floor(now / 1000);
    expect(verifyStripeSignature(payload, sign(payload, t), secret, 300, now)).toBe(true);
    expect(verifyStripeSignature(`${payload} `, sign(payload, t), secret, 300, now)).toBe(false);
    expect(verifyStripeSignature(payload, sign(payload, t), 'whsec_other', 300, now)).toBe(false);
    const stale = t - 3600;
    expect(verifyStripeSignature(payload, sign(payload, stale), secret, 300, now)).toBe(false);
    expect(verifyStripeSignature(payload, 'not-a-header', secret, 300, now)).toBe(false);
  });

  it('maps Stripe event types to billing events', () => {
    expect(
      parseStripeEvents(
        JSON.stringify({
          type: 'checkout.session.completed',
          data: { object: { client_reference_id: 'u_1', customer: 'cus_1', subscription: 'sub_1' } },
        }),
      ),
    ).toEqual([{ type: 'subscribed', userId: 'u_1', customerId: 'cus_1', subscriptionId: 'sub_1' }]);

    const periodEnd = 1_790_000_000;
    expect(
      parseStripeEvents(
        JSON.stringify({
          type: 'customer.subscription.updated',
          data: { object: { id: 'sub_1', status: 'active', current_period_end: periodEnd } },
        }),
      ),
    ).toEqual([{ type: 'renewed', subscriptionId: 'sub_1', currentPeriodEnd: new Date(periodEnd * 1000).toISOString() }]);

    expect(
      parseStripeEvents(
        JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'canceled' } } }),
      ),
    ).toEqual([{ type: 'canceled', subscriptionId: 'sub_1' }]);

    expect(
      parseStripeEvents(JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_2' } } })),
    ).toEqual([{ type: 'canceled', subscriptionId: 'sub_2' }]);

    expect(parseStripeEvents(JSON.stringify({ type: 'invoice.paid', data: { object: { id: 'in_1' } } }))).toEqual([]);
  });
});
