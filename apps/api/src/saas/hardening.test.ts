import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-hardening-'));
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

describe('password change', () => {
  it('verifies the current password, kills old sessions, keeps the current one', async () => {
    const app = await hostedApp();
    const oldCookie = await register(app, 'rotate@example.com');

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      payload: { currentPassword: 'not-the-password', newPassword: 'new-password-9' },
      cookies: { tyche_session: oldCookie },
    });
    expect(wrong.statusCode).toBe(401);

    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      payload: { currentPassword: 'hunter22222', newPassword: 'new-password-9' },
      cookies: { tyche_session: oldCookie },
    });
    expect(changed.statusCode).toBe(200);
    const newCookie = changed.cookies.find((c) => c.name === 'tyche_session')!.value;

    // tokenEpoch bumped: the pre-change cookie is dead, the re-issued one works.
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: oldCookie } })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: newCookie } })).statusCode,
    ).toBe(200);

    // And the new password is the one that logs in.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'rotate@example.com', password: 'new-password-9' },
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe('auth rate limiting', () => {
  it('answers 429 after the per-IP budget is spent', async () => {
    const app = await hostedApp();
    let limited = 0;
    for (let i = 0; i < 25; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'wrong-password' },
      });
      if (res.statusCode === 429) limited += 1;
      else expect(res.statusCode).toBe(401);
    }
    expect(limited).toBe(5); // 20 allowed, the last 5 rate-limited
  });

  it('keys the limiter on the trusted proxy hop, not a spoofable X-Forwarded-For', async () => {
    const app = await hostedApp();
    let limited = 0;
    for (let i = 0; i < 25; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        // Production topology: the socket peer is the Caddy proxy, which appends
        // the real client as the RIGHTMOST X-Forwarded-For entry. A malicious
        // client pre-seeds a rotating spoof to its LEFT. With trustProxy=1 the
        // limiter must key on the appended client (fixed) and IGNORE the spoof —
        // so the budget still trips. Under the old `trustProxy: true` request.ip
        // would be the rotating leftmost entry and the 429 would never fire.
        remoteAddress: '172.20.0.2',
        headers: { 'x-forwarded-for': `10.10.10.${i}, 203.0.113.7` },
        payload: { email: 'nobody@example.com', password: 'wrong-password' },
      });
      if (res.statusCode === 429) limited += 1;
      else expect(res.statusCode).toBe(401);
    }
    expect(limited).toBe(5); // keyed on 203.0.113.7, not the rotating 10.10.10.x
  });
});

describe('account export', () => {
  it('exports exactly the signed-in account data, with the account stamp', async () => {
    const app = await hostedApp();
    const alice = await register(app, 'alice@example.com');
    const bob = await register(app, 'bob@example.com');

    await app.inject({
      method: 'POST',
      url: '/api/watchlists',
      payload: { name: 'Alice export list', symbols: ['NVDA'] },
      cookies: { tyche_session: alice },
    });

    const aliceExport = await app.inject({ method: 'GET', url: '/api/account/export', cookies: { tyche_session: alice } });
    expect(aliceExport.statusCode).toBe(200);
    const aliceData = aliceExport.json().data;
    expect(aliceData.account.email).toBe('alice@example.com');
    expect(aliceData.exportedAt).toBeTruthy();
    expect((aliceData.watchlists as Array<{ name: string }>).map((w) => w.name)).toContain('Alice export list');

    const bobExport = await app.inject({ method: 'GET', url: '/api/account/export', cookies: { tyche_session: bob } });
    expect((bobExport.json().data.watchlists as Array<{ name: string }>).map((w) => w.name)).not.toContain(
      'Alice export list',
    );

    // Self-host: same route, local store, no account stamp.
    const selfhost = await buildApp({ config: { dataDir: tempDir() } });
    apps.push(selfhost);
    const localExport = await selfhost.inject({ method: 'GET', url: '/api/account/export' });
    expect(localExport.statusCode).toBe(200);
    expect(localExport.json().data.account).toBeNull();
  });
});

describe('account deletion', () => {
  it('requires the password, then removes the account, its data, and the session', async () => {
    const app = await hostedApp();
    const cookie = await register(app, 'leaver@example.com');
    await app.inject({
      method: 'POST',
      url: '/api/watchlists',
      payload: { name: 'To be deleted', symbols: ['AAPL'] },
      cookies: { tyche_session: cookie },
    });

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/delete',
      payload: { password: 'not-it' },
      cookies: { tyche_session: cookie },
    });
    expect(wrong.statusCode).toBe(401);

    const gone = await app.inject({
      method: 'POST',
      url: '/api/auth/delete',
      payload: { password: 'hunter22222' },
      cookies: { tyche_session: cookie },
    });
    expect(gone.statusCode).toBe(200);

    // Session dead, login dead, and a re-registration starts from scratch.
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'leaver@example.com', password: 'hunter22222' },
        })
      ).statusCode,
    ).toBe(401);
    const again = await register(app, 'leaver@example.com');
    const lists = await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: again } });
    expect((lists.json().data as Array<{ name: string }>).map((w) => w.name)).not.toContain('To be deleted');
  });
});

describe('admin bootstrap', () => {
  it('with TYCHE_ADMIN_EMAIL set, only that email gets admin — not the first registrant', async () => {
    const app = await hostedApp({ adminEmail: 'owner@example.com' });
    const stranger = await register(app, 'stranger@example.com'); // first, but NOT admin
    const denied = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: stranger } });
    expect(denied.statusCode).toBe(403);

    const owner = await register(app, 'owner@example.com');
    const allowed = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: owner } });
    expect(allowed.statusCode).toBe(200);
  });
});

describe('paywall keeps the exit doors open', () => {
  it('an expired member can still export their data (and the terminal stays 402)', async () => {
    const dataDir = tempDir();
    const first = await buildApp({ config: { mode: 'hosted', sessionSecret: SECRET, billing: 'mock', dataDir } });
    let cookie: string;
    try {
      await first.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'founder@example.com', password: 'hunter22222' },
      });
      const res = await first.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'lapsed@example.com', password: 'hunter22222' },
      });
      cookie = res.cookies.find((c) => c.name === 'tyche_session')!.value;
      await first.inject({
        method: 'POST',
        url: '/api/watchlists',
        payload: { name: 'Lapsed but mine', symbols: ['MSFT'] },
        cookies: { tyche_session: cookie },
      });
    } finally {
      await first.close();
    }
    const usersFile = join(dataDir, 'users.json');
    const parsed = JSON.parse(readFileSync(usersFile, 'utf8')) as {
      users: Array<{ email: string; billing: { trialEndsAt: string } }>;
    };
    parsed.users.find((u) => u.email === 'lapsed@example.com')!.billing.trialEndsAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    writeFileSync(usersFile, JSON.stringify(parsed), 'utf8');

    const app = await hostedApp({ dataDir });
    expect(
      (await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: cookie } })).statusCode,
    ).toBe(402);
    const exported = await app.inject({ method: 'GET', url: '/api/account/export', cookies: { tyche_session: cookie } });
    expect(exported.statusCode).toBe(200);
    expect((exported.json().data.watchlists as Array<{ name: string }>).map((w) => w.name)).toContain(
      'Lapsed but mine',
    );
  });
});

describe('activity tracking', () => {
  it('admin metrics count accounts seen today', async () => {
    const app = await hostedApp();
    const founder = await register(app, 'founder@example.com');
    await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: founder } });
    const metrics = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: founder } });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().data.activeToday).toBeGreaterThanOrEqual(1);
    expect(metrics.json().data.activeWeek).toBeGreaterThanOrEqual(metrics.json().data.activeToday);
  });
});
