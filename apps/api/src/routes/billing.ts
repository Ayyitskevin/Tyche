import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../context';
import { applyBillingEvents, entitlement, trialDaysLeft } from '../saas/billing';
import { currentUser } from '../saas/requestContext';

/**
 * Hosted-mode billing surface. The session hook has already authenticated
 * every route here except the webhook, which is signature-verified instead.
 */
export function registerBillingRoutes(app: FastifyInstance, ctx: AppContext): void {
  const disabled = (reply: FastifyReply) =>
    reply.code(400).send({
      error: { kind: 'billing_disabled', message: 'Billing is not enabled on this deployment.' },
    });

  app.get('/api/billing', async (_request, reply) => {
    const user = currentUser();
    if (!ctx.billing || !user) return disabled(reply);
    reply.send({
      data: {
        provider: ctx.billing.name,
        plan: user.billing.plan,
        entitlement: entitlement(user.billing),
        trialEndsAt: user.billing.trialEndsAt,
        trialDaysLeft: trialDaysLeft(user.billing),
        currentPeriodEnd: user.billing.currentPeriodEnd ?? null,
        interval: user.billing.interval ?? null,
        // Whether ACCOUNT should offer the annual plan: the mock driver always
        // supports it; Stripe only when an annual price is configured.
        annualAvailable: ctx.config.billing === 'mock' || ctx.config.stripePriceIdAnnual !== null,
      },
    });
  });

  app.post('/api/billing/checkout', async (request, reply) => {
    const user = currentUser();
    if (!ctx.billing || !ctx.users || !user) return disabled(reply);
    // Optional interval from the body; anything but 'year' is the monthly plan.
    const body = (request.body ?? {}) as { interval?: unknown };
    const interval = body.interval === 'year' ? 'year' : 'month';
    const base = ctx.config.publicUrl.replace(/\/+$/, '');
    try {
      const result = await ctx.billing.createCheckout(
        user,
        {
          successUrl: `${base}/?billing=success`,
          cancelUrl: `${base}/?billing=canceled`,
        },
        interval,
      );
      if (result.completed?.length) await applyBillingEvents(ctx.users, result.completed, ctx.audit);
      ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'billing.checkout', outcome: 'allow' });
      reply.send({ data: { url: result.url } });
    } catch (err) {
      ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'billing.checkout', outcome: 'deny' });
      reply.code(502).send({
        error: { kind: 'billing_error', message: err instanceof Error ? err.message : 'Checkout failed.' },
      });
    }
  });

  app.post('/api/billing/portal', async (_request, reply) => {
    const user = currentUser();
    if (!ctx.billing || !user) return disabled(reply);
    const base = ctx.config.publicUrl.replace(/\/+$/, '');
    try {
      const result = await ctx.billing.createPortal(user, `${base}/`);
      reply.send({ data: { url: result.url } });
    } catch (err) {
      const noCustomer = err instanceof Error && err.message === 'no_customer';
      reply.code(noCustomer ? 400 : 502).send({
        error: {
          kind: noCustomer ? 'no_billing_account' : 'billing_error',
          message: noCustomer
            ? 'No billing account yet — subscribe first.'
            : err instanceof Error
              ? err.message
              : 'Portal failed.',
        },
      });
    }
  });

  // The webhook needs the RAW request body for signature verification, so it
  // lives in an encapsulated scope whose JSON parser keeps the payload as a
  // string. It is unauthenticated (Stripe calls it) but signature-verified.
  void app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      done(null, body);
    });
    scope.post('/api/billing/webhook', async (request, reply) => {
      if (!ctx.billing || !ctx.users) return disabled(reply);
      try {
        const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
        const events = ctx.billing.parseWebhook(raw, request.headers);
        const applied = await applyBillingEvents(ctx.users, events, ctx.audit);
        reply.send({ data: { received: true, applied } });
      } catch {
        ctx.audit.record({ at: new Date().toISOString(), actor: 'webhook', action: 'billing.webhook', outcome: 'deny' });
        reply.code(400).send({
          error: { kind: 'bad_signature', message: 'Webhook signature verification failed.' },
        });
      }
    });
  });
}
