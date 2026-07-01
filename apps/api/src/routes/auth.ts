import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { RateLimiter } from '../security/rateLimit';
import { SESSION_COOKIE, issueSession } from '../saas/sessions';
import { currentUser } from '../saas/requestContext';
import { toPublicUser } from '../saas/users';

const CredentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Secure cookies whenever the deployment terminates TLS (any non-local origin).
    secure: 'auto',
    maxAge: 30 * 86_400,
  });
}

/** Hosted-mode account routes. In self-host mode these endpoints explain themselves. */
export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  const hosted = ctx.config.mode === 'hosted';
  const notHosted = (reply: FastifyReply) =>
    reply.code(400).send({
      error: { kind: 'not_hosted', message: 'Accounts are only used in hosted mode (TYCHE_MODE=hosted).' },
    });

  // Credential endpoints share one per-IP budget: 20 attempts / 10 minutes
  // (credential stuffing + signup abuse). Multi-node deployments should also
  // rate-limit at the proxy; this is the safe in-process default.
  const limiter = new RateLimiter(20, 10 * 60_000);
  const overLimit = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (limiter.allow(request.ip)) return false;
    ctx.audit.record({ at: new Date().toISOString(), actor: request.ip, action: 'auth.rate_limited', outcome: 'deny' });
    void reply
      .code(429)
      .send({ error: { kind: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' } });
    return true;
  };

  app.post('/api/auth/register', async (request, reply) => {
    if (!hosted || !ctx.users || !ctx.config.sessionSecret) return notHosted(reply);
    if (overLimit(request, reply)) return;
    if (ctx.config.signups === 'closed' && ctx.users.count() > 0) {
      ctx.audit.record({ at: new Date().toISOString(), actor: 'anonymous', action: 'auth.register', outcome: 'deny' });
      reply.code(403).send({ error: { kind: 'signups_closed', message: 'Signups are currently closed.' } });
      return;
    }
    const parsed = CredentialsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide a valid email and a password of at least 8 characters.' } });
      return;
    }
    if (ctx.users.findByEmail(parsed.data.email)) {
      reply.code(409).send({ error: { kind: 'email_taken', message: 'An account with this email already exists.' } });
      return;
    }
    const user = await ctx.users.create(parsed.data.email, parsed.data.password);
    ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'auth.register', outcome: 'allow' });
    setSessionCookie(reply, issueSession(ctx.config.sessionSecret, user.id, user.tokenEpoch));
    reply.code(201).send({ data: { user: toPublicUser(user) } });
  });

  app.post('/api/auth/login', async (request, reply) => {
    if (!hosted || !ctx.users || !ctx.config.sessionSecret) return notHosted(reply);
    if (overLimit(request, reply)) return;
    const parsed = CredentialsSchema.safeParse(request.body ?? {});
    const user = parsed.success ? await ctx.users.verify(parsed.data.email, parsed.data.password) : null;
    if (!user) {
      ctx.audit.record({ at: new Date().toISOString(), actor: 'anonymous', action: 'auth.login', outcome: 'deny' });
      reply.code(401).send({ error: { kind: 'invalid_credentials', message: 'Invalid email or password.' } });
      return;
    }
    ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'auth.login', outcome: 'allow' });
    setSessionCookie(reply, issueSession(ctx.config.sessionSecret, user.id, user.tokenEpoch));
    reply.send({ data: { user: toPublicUser(user) } });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    if (!hosted) return notHosted(reply);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.send({ data: { ok: true } });
  });

  app.get('/api/auth/me', async (_request, reply) => {
    if (!hosted) return notHosted(reply);
    const user = currentUser();
    if (!user) {
      reply.code(401).send({ error: { kind: 'unauthorized', message: 'Sign in to continue.' } });
      return;
    }
    reply.send({ data: { user: toPublicUser(user) } });
  });

  // Password change: verify the current password, re-hash with a fresh salt,
  // bump tokenEpoch (kills every other session), and re-issue THIS session's
  // cookie so the user changing their password stays signed in.
  app.post('/api/auth/password', async (request, reply) => {
    if (!hosted || !ctx.users || !ctx.config.sessionSecret) return notHosted(reply);
    if (overLimit(request, reply)) return;
    const user = currentUser();
    if (!user) {
      reply.code(401).send({ error: { kind: 'unauthorized', message: 'Sign in to continue.' } });
      return;
    }
    const parsed = PasswordChangeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({
        error: { kind: 'bad_request', message: 'Provide your current password and a new password of at least 8 characters.' },
      });
      return;
    }
    const verified = await ctx.users.verify(user.email, parsed.data.currentPassword);
    if (!verified) {
      ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'auth.password', outcome: 'deny' });
      reply.code(401).send({ error: { kind: 'invalid_credentials', message: 'Current password is incorrect.' } });
      return;
    }
    const updated = await ctx.users.setPassword(user.id, parsed.data.newPassword);
    if (!updated) {
      reply.code(500).send({ error: { kind: 'internal', message: 'Password update failed.' } });
      return;
    }
    ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'auth.password', outcome: 'allow' });
    setSessionCookie(reply, issueSession(ctx.config.sessionSecret, updated.id, updated.tokenEpoch));
    reply.send({ data: { ok: true } });
  });

  // Account deletion: password-confirmed, irreversible. Removes the account
  // record AND the user's entire data directory — the counterpart of the
  // export endpoint, and the "right to leave" a paid product owes its users.
  app.post('/api/auth/delete', async (request, reply) => {
    if (!hosted || !ctx.users || !ctx.userStores) return notHosted(reply);
    if (overLimit(request, reply)) return;
    const user = currentUser();
    if (!user) {
      reply.code(401).send({ error: { kind: 'unauthorized', message: 'Sign in to continue.' } });
      return;
    }
    const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(request.body ?? {});
    const verified = parsed.success ? await ctx.users.verify(user.email, parsed.data.password) : null;
    if (!verified) {
      ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'auth.delete', outcome: 'deny' });
      reply.code(401).send({ error: { kind: 'invalid_credentials', message: 'Password is incorrect.' } });
      return;
    }
    await ctx.users.remove(user.id);
    await ctx.userStores.destroy(user.id);
    ctx.audit.record({ at: new Date().toISOString(), actor: user.email, action: 'auth.delete', outcome: 'allow' });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.send({ data: { ok: true } });
  });
}
