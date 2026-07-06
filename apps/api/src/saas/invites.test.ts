import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { InviteRegistry, seatAvailable, seatsUsed } from './invites';

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-invites-'));
  dirs.push(dir);
  return dir;
}

const SECRET = 'test-session-secret-0123456789';

async function hostedApp(over: Record<string, unknown> = {}): Promise<FastifyInstance> {
  const app = await buildApp({ config: { mode: 'hosted', sessionSecret: SECRET, dataDir: tempDir(), ...over } });
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

describe('seat accounting', () => {
  it('sums accounts and pending invites', () => {
    expect(seatsUsed(3, 2)).toBe(5);
  });

  it('an unlimited (null) limit is always available', () => {
    expect(seatAvailable(null, 1000, 500)).toBe(true);
  });

  it('a finite limit blocks once accounts + invites reach it', () => {
    expect(seatAvailable(5, 3, 1)).toBe(true); // 4 < 5
    expect(seatAvailable(5, 3, 2)).toBe(false); // 5, not < 5
    expect(seatAvailable(5, 6, 0)).toBe(false); // already over
  });
});

describe('InviteRegistry', () => {
  it('issues a single-use token that consume() accepts exactly once', async () => {
    const reg = new InviteRegistry(tempDir());
    await reg.init();
    const token = await reg.issue('bob@example.com', 'admin@example.com');
    expect(reg.hasPending('bob@example.com')).toBe(true);
    expect(reg.pendingCount()).toBe(1);

    const consumed = await reg.consume(token);
    expect(consumed?.email).toBe('bob@example.com');
    expect(reg.pendingCount()).toBe(0);
    // Single use: a second consume of the same token fails.
    expect(await reg.consume(token)).toBeNull();
  });

  it('re-inviting an email replaces the prior invite (one seat, not two)', async () => {
    const reg = new InviteRegistry(tempDir());
    await reg.init();
    await reg.issue('carol@example.com', 'admin@example.com');
    await reg.issue('carol@example.com', 'admin@example.com');
    expect(reg.pendingCount()).toBe(1);
  });

  it('expired invites are pruned and cannot be consumed', async () => {
    const reg = new InviteRegistry(tempDir());
    await reg.init();
    const token = await reg.issue('dana@example.com', 'admin@example.com', -1); // already expired
    expect(reg.pendingCount()).toBe(0);
    expect(await reg.consume(token)).toBeNull();
  });

  it('revoke removes a pending invite', async () => {
    const reg = new InviteRegistry(tempDir());
    await reg.init();
    await reg.issue('erin@example.com', 'admin@example.com');
    expect(await reg.revoke('erin@example.com')).toBe(true);
    expect(reg.pendingCount()).toBe(0);
    expect(await reg.revoke('erin@example.com')).toBe(false);
  });
});

describe('seat invites (hosted routes)', () => {
  it('admin invites a seat; it appears pending with seat usage; revoke clears it', async () => {
    const app = await hostedApp();
    const admin = await register(app, 'founder@example.com'); // first account is admin

    const invite = await app.inject({
      method: 'POST',
      url: '/api/admin/invite',
      payload: { email: 'teammate@example.com' },
      cookies: { tyche_session: admin },
    });
    expect(invite.statusCode).toBe(200);

    const metrics = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: admin } });
    expect(metrics.json().data.seats).toEqual({ used: 2, limit: null }); // 1 account + 1 invite
    expect(metrics.json().data.pendingInvites.map((i: { email: string }) => i.email)).toContain('teammate@example.com');

    const revoke = await app.inject({
      method: 'POST',
      url: '/api/admin/invite/revoke',
      payload: { email: 'teammate@example.com' },
      cookies: { tyche_session: admin },
    });
    expect(revoke.json().data.revoked).toBe(true);
    const after = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: admin } });
    expect(after.json().data.pendingInvites).toHaveLength(0);
  });

  it('enforces the seat limit', async () => {
    const app = await hostedApp({ seatLimit: 1 });
    const admin = await register(app, 'solo@example.com'); // 1 account = the only seat
    const invite = await app.inject({
      method: 'POST',
      url: '/api/admin/invite',
      payload: { email: 'extra@example.com' },
      cookies: { tyche_session: admin },
    });
    expect(invite.statusCode).toBe(409);
    expect(invite.json().error.kind).toBe('seat_limit');
  });

  it('non-admins cannot invite', async () => {
    const app = await hostedApp();
    await register(app, 'boss@example.com'); // admin
    const member = await register(app, 'member@example.com'); // not admin
    const invite = await app.inject({
      method: 'POST',
      url: '/api/admin/invite',
      payload: { email: 'x@example.com' },
      cookies: { tyche_session: member },
    });
    expect(invite.statusCode).toBe(403);
  });

  it('accepting an invite creates the account and signs in', async () => {
    const dataDir = tempDir();
    // Pre-seed an invite (captures the raw token, which is otherwise only emailed),
    // then boot the app over the same data dir so its registry loads it.
    const seed = new InviteRegistry(dataDir);
    await seed.init();
    const token = await seed.issue('newhire@example.com', 'admin@example.com');

    const app = await buildApp({ config: { mode: 'hosted', sessionSecret: SECRET, signups: 'closed', dataDir } });
    apps.push(app);

    const accept = await app.inject({
      method: 'POST',
      url: '/api/auth/invite/accept',
      payload: { token, password: 'hunter22222' },
    });
    expect(accept.statusCode).toBe(201);
    expect(accept.json().data.user.email).toBe('newhire@example.com');
    expect(accept.json().data.user.emailVerified).toBe(true);
    const cookie = accept.cookies.find((c) => c.name === 'tyche_session')!.value;

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.user.email).toBe('newhire@example.com');

    // Token is single-use: replaying it fails.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/invite/accept',
      payload: { token, password: 'hunter22222' },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.kind).toBe('invalid_token');
  });
});
