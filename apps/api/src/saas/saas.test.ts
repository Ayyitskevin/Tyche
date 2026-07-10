import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { issueSession, verifySession } from './sessions';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-saas-'));
  dirs.push(dir);
  return dir;
}

const SECRET = 'test-session-secret-0123456789';

async function hostedApp(over: Record<string, unknown> = {}): Promise<FastifyInstance> {
  return buildApp({
    config: { mode: 'hosted', sessionSecret: SECRET, dataDir: tempDir(), ...over },
  });
}

/** Register a user and return the session cookie value. */
async function register(app: FastifyInstance, email: string, password = 'hunter22222'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password } });
  expect(res.statusCode).toBe(201);
  const cookie = res.cookies.find((c) => c.name === 'tyche_session');
  expect(cookie).toBeDefined();
  return cookie!.value;
}

describe('hosted mode: auth', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await hostedApp();
  });
  afterAll(async () => {
    await app.close();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('registers, reports the session via /me, and logs in again', async () => {
    const cookie = await register(app, 'founder@example.com');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.user.email).toBe('founder@example.com');
    expect(me.json().data.user.admin).toBe(true); // first user is the founder
    expect(me.json().data.user.billing.plan).toBe('trial');

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'founder@example.com', password: 'hunter22222' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('rejects a wrong password, a duplicate email, and a weak password', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'founder@example.com', password: 'wrong-password' },
    });
    expect(bad.statusCode).toBe(401);
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'founder@example.com', password: 'hunter22222' },
    });
    expect(dup.statusCode).toBe(409);
    const weak = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'weak@example.com', password: 'short' },
    });
    expect(weak.statusCode).toBe(400);
  });

  it('guards API routes without a session and rejects tampered tokens', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/quote/AAPL' });
    expect(anon.statusCode).toBe(401);
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().appMode).toBe('hosted');

    const forged = issueSession('wrong-secret-wrong-secret', 'u_x', 1);
    const res = await app.inject({ method: 'GET', url: '/api/quote/AAPL', cookies: { tyche_session: forged } });
    expect(res.statusCode).toBe(401);
  });

  it('isolates data hard between users', async () => {
    const alice = await register(app, 'alice@example.com');
    const bob = await register(app, 'bob@example.com');

    const saved = await app.inject({
      method: 'POST',
      url: '/api/watchlists',
      payload: { name: 'Alice private', symbols: ['NVDA'] },
      cookies: { tyche_session: alice },
    });
    expect(saved.statusCode).toBe(200);

    const bobsView = await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: bob } });
    const bobNames = (bobsView.json().data as Array<{ name: string }>).map((w) => w.name);
    expect(bobNames).not.toContain('Alice private');

    const alicesView = await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: alice } });
    const aliceNames = (alicesView.json().data as Array<{ name: string }>).map((w) => w.name);
    expect(aliceNames).toContain('Alice private');
  });

  it('stamps the audit trail with the acting user, admin-only in hosted mode', async () => {
    const carol = await register(app, 'carol@example.com');
    await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'n', body: 'b' },
      cookies: { tyche_session: carol },
    });
    // The audit ring is one GLOBAL cross-tenant trail — a non-admin tenant must
    // never read other accounts' emails/activity from it.
    const denied = await app.inject({ method: 'GET', url: '/api/audit?limit=50', cookies: { tyche_session: carol } });
    expect(denied.statusCode).toBe(403);

    // The founder (admin) can read it, and carol's action is stamped with her email.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'founder@example.com', password: 'hunter22222' },
    });
    const founder = login.cookies.find((c) => c.name === 'tyche_session')!.value;
    const audit = await app.inject({ method: 'GET', url: '/api/audit?limit=100', cookies: { tyche_session: founder } });
    expect(audit.statusCode).toBe(200);
    const actors = (audit.json().data as Array<{ actor: string; action: string }>)
      .filter((e) => e.action === 'note.save')
      .map((e) => e.actor);
    expect(actors).toContain('carol@example.com');
  });
});

describe('hosted mode: configuration guards', () => {
  it('refuses to boot hosted without a session secret', async () => {
    await expect(buildApp({ config: { mode: 'hosted', dataDir: tempDir() } })).rejects.toThrow(/TYCHE_SESSION_SECRET/);
  });

  it('closes signups when configured (after the founder exists)', async () => {
    const app = await hostedApp({ signups: 'closed' });
    try {
      // The very first (founder) account is always allowed.
      await register(app, 'founder2@example.com');
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'late@example.com', password: 'hunter22222' },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('self-host mode is unchanged', () => {
  it('auth endpoints explain themselves and no session is required', async () => {
    const app = await buildApp({ config: { dataDir: tempDir() } });
    try {
      expect((await app.inject({ method: 'GET', url: '/api/quote/AAPL' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: {} })).statusCode).toBe(400);
      expect((await app.inject({ method: 'GET', url: '/api/health' })).json().appMode).toBe('selfhost');
    } finally {
      await app.close();
    }
  });
});

describe('session tokens', () => {
  it('round-trip, reject expiry and epoch drift', () => {
    const token = issueSession(SECRET, 'u_1', 3);
    expect(verifySession(SECRET, token)).toEqual({ userId: 'u_1', tokenEpoch: 3 });
    const expired = issueSession(SECRET, 'u_1', 3, -1000);
    expect(verifySession(SECRET, expired)).toBeNull();
    expect(verifySession('other-secret-other-secret', token)).toBeNull();
  });
});
