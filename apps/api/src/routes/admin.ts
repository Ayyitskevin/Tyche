import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { entitlement, trialDaysLeft } from '../saas/billing';
import { currentUser } from '../saas/requestContext';

/**
 * Founder/operator dashboard data (hosted mode, admin accounts only): the
 * handful of numbers a one-person SaaS actually steers by — accounts, trial
 * funnel, subscriptions, MRR, and a signups timeline.
 */
export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/admin/metrics', async (_request, reply) => {
    if (ctx.config.mode !== 'hosted' || !ctx.users) {
      reply.code(400).send({
        error: { kind: 'not_hosted', message: 'Admin metrics exist only in hosted mode (TYCHE_MODE=hosted).' },
      });
      return;
    }
    const viewer = currentUser();
    if (!viewer?.admin) {
      reply.code(403).send({ error: { kind: 'forbidden', message: 'Admin accounts only.' } });
      return;
    }

    const accounts = ctx.users.list();
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
      },
    });
  });
}
