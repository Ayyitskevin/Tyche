import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../context';
import { entitlement, trialDaysLeft } from '../saas/billing';
import { seatAvailable, seatsUsed } from '../saas/invites';
import { currentUser } from '../saas/requestContext';

const InviteSchema = z.object({ email: z.string().email() });

/**
 * Founder/operator dashboard + seat provisioning (hosted mode, admin accounts
 * only): the numbers a one-person SaaS steers by, plus closed-signup team
 * invites (seats gate access; billing stays per-account — see docs/BILLING.md).
 */
export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  // Shared guard: hosted mode + an authenticated admin. Returns false (and has
  // already sent the error) when the caller isn't allowed.
  function requireAdmin(reply: FastifyReply): boolean {
    if (ctx.config.mode !== 'hosted' || !ctx.users) {
      reply.code(400).send({
        error: { kind: 'not_hosted', message: 'Admin features exist only in hosted mode (TYCHE_MODE=hosted).' },
      });
      return false;
    }
    if (!currentUser()?.admin) {
      reply.code(403).send({ error: { kind: 'forbidden', message: 'Admin accounts only.' } });
      return false;
    }
    return true;
  }

  app.get('/api/admin/metrics', async (_request, reply) => {
    if (!requireAdmin(reply)) return;
    const accounts = ctx.users!.list();
    const now = Date.now();
    let activeTrials = 0;
    let pro = 0;
    let expired = 0;
    let trialsEndingSoon = 0;
    let activeToday = 0;
    let activeWeek = 0;
    for (const account of accounts) {
      const state = entitlement(account.billing, now);
      if (state === 'pro') pro += 1;
      else if (state === 'trial') {
        activeTrials += 1;
        if (trialDaysLeft(account.billing, now) <= 3) trialsEndingSoon += 1;
      } else expired += 1;
      if (account.lastSeenAt) {
        const seen = now - Date.parse(account.lastSeenAt);
        if (seen <= 86_400_000) activeToday += 1;
        if (seen <= 7 * 86_400_000) activeWeek += 1;
      }
    }

    // Sign-ups per day for the last 14 days (zero-filled, oldest first).
    const signupsByDay: Array<{ date: string; count: number }> = [];
    const dayIndex = new Map<string, number>();
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
      dayIndex.set(date, signupsByDay.length);
      signupsByDay.push({ date, count: 0 });
    }
    for (const account of accounts) {
      const at = dayIndex.get(account.createdAt.slice(0, 10));
      if (at !== undefined) signupsByDay[at]!.count += 1;
    }

    const latest = [...accounts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((account) => ({
        email: account.email,
        createdAt: account.createdAt,
        entitlement: entitlement(account.billing, now),
        admin: account.admin,
      }));

    const pendingInvites = ctx.invites?.listPending(now) ?? [];

    reply.send({
      data: {
        users: accounts.length,
        activeTrials,
        pro,
        expired,
        trialsEndingSoon,
        activeToday,
        activeWeek,
        priceMonthly: ctx.config.priceMonthly,
        mrr: pro * ctx.config.priceMonthly,
        billingProvider: ctx.billing?.name ?? 'none',
        signupsByDay,
        latest,
        seats: { used: seatsUsed(accounts.length, pendingInvites.length), limit: ctx.config.seatLimit },
        pendingInvites,
      },
    });
  });

  // Provision a seat: issue a single-use invite for an email and mail the link.
  // The seat is reserved the moment the invite exists (counted against the cap)
  // so a closed instance can't be oversubscribed between invite and accept.
  app.post('/api/admin/invite', async (request, reply) => {
    if (!requireAdmin(reply)) return;
    const invites = ctx.invites;
    const sender = ctx.email;
    if (!invites || !sender) {
      reply.code(400).send({
        error: { kind: 'invites_unavailable', message: 'Invites require hosted mode with an email sender.' },
      });
      return;
    }
    const parsed = InviteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide a valid email address.' } });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    if (ctx.users!.findByEmail(email)) {
      reply.code(409).send({ error: { kind: 'email_taken', message: 'That email already has an account.' } });
      return;
    }
    const now = Date.now();
    // A re-invite of an already-pending email reuses its seat, so only enforce
    // the cap when this would add a NEW pending seat.
    if (!invites.hasPending(email, now) && !seatAvailable(ctx.config.seatLimit, ctx.users!.count(), invites.pendingCount(now))) {
      reply.code(409).send({
        error: {
          kind: 'seat_limit',
          message: `All ${ctx.config.seatLimit} seats are in use. Revoke a pending invite or raise TYCHE_SEATS.`,
        },
      });
      return;
    }
    const admin = currentUser()!;
    const token = await invites.issue(email, admin.email, undefined, now);
    const base = ctx.config.publicUrl.replace(/\/$/, '');
    const link = `${base}/invite.html?token=${token}`;
    // Off the response path (like reset): a slow or failing mailer must not shape
    // the response. The invite is already persisted; a delivery failure audits.
    void sender
      .send({
        to: email,
        subject: `You're invited to Tyche`,
        text:
          `${admin.email} invited you to their Tyche workspace.\n\n` +
          `Accept and set your password here (valid for 7 days, single use):\n${link}\n\n` +
          `Tyche is a research terminal — bring your own data keys or use the keyless sources.`,
      })
      .then(() => {
        ctx.audit.record({ at: new Date().toISOString(), actor: admin.email, action: 'admin.invite', resource: email, outcome: 'allow' });
      })
      .catch((error: unknown) => {
        console.error(`[admin.invite] delivery failed: ${error instanceof Error ? error.message : String(error)}`);
        ctx.audit.record({
          at: new Date().toISOString(),
          actor: admin.email,
          action: 'admin.invite',
          resource: email,
          outcome: 'error',
          detail: { reason: error instanceof Error ? error.message : 'delivery_failed' },
        });
      });
    reply.send({ data: { ok: true, email } });
  });

  app.post('/api/admin/invite/revoke', async (request, reply) => {
    if (!requireAdmin(reply)) return;
    if (!ctx.invites) {
      reply.code(400).send({ error: { kind: 'invites_unavailable', message: 'Invites require hosted mode.' } });
      return;
    }
    const parsed = InviteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide a valid email address.' } });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const revoked = await ctx.invites.revoke(email);
    ctx.audit.record({
      at: new Date().toISOString(),
      actor: currentUser()!.email,
      action: 'admin.invite_revoke',
      resource: email,
      outcome: revoked ? 'allow' : 'deny',
    });
    reply.send({ data: { revoked } });
  });
}
