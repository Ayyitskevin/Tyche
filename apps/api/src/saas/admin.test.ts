import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-admin-'));
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

describe('admin metrics', () => {
  it('reports counts, MRR, signups timeline; members get 403; self-host 400', async () => {
    const app = await hostedApp();
    const founder = await register(app, 'founder@example.com'); // first account => admin
    const member = await register(app, 'member@example.com');
    await register(app, 'third@example.com');

    // One paying customer via the instant mock checkout.
    const checkout = await app.inject({ method: 'POST', url: '/api/billing/checkout', cookies: { tyche_session: member } });
    expect(checkout.statusCode).toBe(200);

    const forbidden = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: member } });
    expect(forbidden.statusCode).toBe(403);

    const res = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: founder } });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.users).toBe(3);
    expect(data.pro).toBe(1);
    expect(data.activeTrials).toBe(2);
    expect(data.expired).toBe(0);
    expect(data.mrr).toBe(data.priceMonthly);
    expect(data.billingProvider).toBe('mock');
    expect(data.signupsByDay).toHaveLength(14);
    expect(data.signupsByDay[13].count).toBe(3); // all three signed up today
    expect(data.latest[0].email).toBe('third@example.com');

    const selfhost = await buildApp({ config: { dataDir: tempDir() } });
    apps.push(selfhost);
    expect((await selfhost.inject({ method: 'GET', url: '/api/admin/metrics' })).statusCode).toBe(400);
  });

  it('never paywalls an admin: expired founder trial still reaches the terminal and metrics', async () => {
    const dataDir = tempDir();
    const first = await buildApp({ config: { mode: 'hosted', sessionSecret: SECRET, billing: 'mock', dataDir } });
    let cookie: string;
    try {
      const res = await first.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'founder@example.com', password: 'hunter22222' },
      });
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
    expect((await app.inject({ method: 'GET', url: '/api/watchlists', cookies: { tyche_session: cookie } })).statusCode).toBe(200);
    const metrics = await app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: { tyche_session: cookie } });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().data.expired).toBe(1);
  });
});
