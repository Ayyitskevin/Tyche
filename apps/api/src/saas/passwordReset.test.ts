import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { UserRegistry } from './users';
import { ConsoleEmailSender, HttpEmailSender } from './email';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-reset-'));
  dirs.push(dir);
  return dir;
}
const SECRET = 'test-session-secret-0123456789';

afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('EmailSender', () => {
  it('console sender resolves without throwing', async () => {
    await expect(new ConsoleEmailSender().send({ to: 'a@b.co', subject: 's', text: 't' })).resolves.toBeUndefined();
  });

  it('console sender redacts the body (reset token) when redaction is on', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'info').mockImplementation((m?: unknown) => void lines.push(String(m)));
    try {
      await new ConsoleEmailSender(true).send({ to: 'a@b.co', subject: 'Reset', text: 'secret /reset.html?token=deadbeef' });
      await new ConsoleEmailSender(false).send({ to: 'a@b.co', subject: 'Reset', text: 'secret /reset.html?token=deadbeef' });
    } finally {
      spy.mockRestore();
    }
    expect(lines[0]).not.toContain('deadbeef'); // redacted
    expect(lines[0]).toContain('redacted');
    expect(lines[1]).toContain('deadbeef'); // dev sender still prints it
  });

  it('http sender POSTs JSON with a bearer token, and throws on a non-2xx', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const okFetch = async (url: string, init: RequestInit): Promise<Response> => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    };
    await new HttpEmailSender('http://mail/hook', 'tok', 'from@tyche.co', okFetch).send({
      to: 'u@x.co',
      subject: 'Hi',
      text: 'body',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://mail/hook');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      to: 'u@x.co',
      subject: 'Hi',
      text: 'body',
      from: 'from@tyche.co',
    });

    const badFetch = async (): Promise<Response> => new Response(null, { status: 500 });
    await expect(
      new HttpEmailSender('http://mail/hook', null, null, badFetch).send({ to: 'u@x.co', subject: 's', text: 't' }),
    ).rejects.toThrow(/500/);
  });
});

describe('UserRegistry password-reset tokens', () => {
  async function freshRegistry(): Promise<UserRegistry> {
    const reg = new UserRegistry(tempDir(), null);
    await reg.init();
    await reg.create('user@example.com', 'originalpass');
    return reg;
  }

  it('returns null for an unknown email (no account enumeration)', async () => {
    const reg = await freshRegistry();
    expect(await reg.issueResetToken('nobody@example.com')).toBeNull();
  });

  it('resets the password with a valid token and bumps the session epoch', async () => {
    const reg = await freshRegistry();
    const epoch = reg.findByEmail('user@example.com')!.tokenEpoch;
    const token = await reg.issueResetToken('user@example.com');
    expect(token).toBeTruthy();
    const user = await reg.resetPassword(token!, 'brandnewpass');
    expect(user).not.toBeNull();
    expect(user!.tokenEpoch).toBe(epoch + 1);
    expect(await reg.verify('user@example.com', 'brandnewpass')).not.toBeNull();
    expect(await reg.verify('user@example.com', 'originalpass')).toBeNull();
  });

  it('is single-use even under two concurrent confirms (no TOCTOU)', async () => {
    const reg = await freshRegistry();
    const epoch = reg.findByEmail('user@example.com')!.tokenEpoch;
    const token = await reg.issueResetToken('user@example.com');
    // Race two confirms with the SAME token: exactly one wins, epoch bumps once.
    const [a, b] = await Promise.all([reg.resetPassword(token!, 'winner-one'), reg.resetPassword(token!, 'winner-two')]);
    expect([a, b].filter((r) => r !== null)).toHaveLength(1);
    expect(reg.findByEmail('user@example.com')!.tokenEpoch).toBe(epoch + 1);
  });

  it('rejects an expired token', async () => {
    const reg = await freshRegistry();
    const token = await reg.issueResetToken('user@example.com', -1); // already expired
    expect(await reg.resetPassword(token!, 'whatevernew')).toBeNull();
  });

  it('is single-use', async () => {
    const reg = await freshRegistry();
    const token = await reg.issueResetToken('user@example.com');
    expect(await reg.resetPassword(token!, 'firstnewpass')).not.toBeNull();
    expect(await reg.resetPassword(token!, 'secondnewpass')).toBeNull();
  });

  it('rejects a garbage token', async () => {
    const reg = await freshRegistry();
    await reg.issueResetToken('user@example.com');
    expect(await reg.resetPassword('deadbeef', 'newpass12')).toBeNull();
  });

  it('voids a pending reset token when the password is changed by another path', async () => {
    const reg = await freshRegistry();
    const token = await reg.issueResetToken('user@example.com');
    const id = reg.findByEmail('user@example.com')!.id;
    await reg.setPassword(id, 'changedpass');
    expect(await reg.resetPassword(token!, 'afterwards')).toBeNull();
  });
});

describe('hosted mode: password reset routes', () => {
  let app: FastifyInstance;
  let sentBodies: string[];

  beforeEach(async () => {
    sentBodies = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit): Promise<Response> => {
      sentBodies.push(String(init.body));
      return new Response(null, { status: 200 });
    });
    app = await buildApp({
      config: {
        mode: 'hosted',
        sessionSecret: SECRET,
        dataDir: tempDir(),
        publicUrl: 'https://app.tyche.test',
        emailSink: 'http',
        emailWebhookUrl: 'https://mail.test/hook',
      },
    });
  });
  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  async function register(email: string, password = 'hunter22222'): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password } });
    expect(res.statusCode).toBe(201);
    return res.cookies.find((c) => c.name === 'tyche_session')!.value;
  }
  // Delivery now happens OFF the response path, so the email is sent after the
  // 200 returns — poll until it lands. Register also sends a verification email
  // into the same capture array, so match the RESET link specifically.
  async function waitForResetToken(): Promise<string> {
    for (let i = 0; i < 200; i++) {
      const body = [...sentBodies].reverse().map((b) => (JSON.parse(b) as { text: string }).text).find((t) => /reset\.html\?token=/.test(t));
      if (body) return /reset\.html\?token=([a-f0-9]+)/.exec(body)![1]!;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('no reset email captured');
  }

  it('runs the full request -> confirm -> login-with-new-password loop', async () => {
    await register('reset-me@example.com');
    const reqRes = await app.inject({ method: 'POST', url: '/api/auth/reset/request', payload: { email: 'reset-me@example.com' } });
    expect(reqRes.statusCode).toBe(200);
    const token = await waitForResetToken();

    const confirm = await app.inject({ method: 'POST', url: '/api/auth/reset/confirm', payload: { token, newPassword: 'a-fresh-password' } });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().data.user.email).toBe('reset-me@example.com');
    expect(confirm.cookies.find((c) => c.name === 'tyche_session')).toBeDefined(); // signed straight in

    const oldLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'reset-me@example.com', password: 'hunter22222' } });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'reset-me@example.com', password: 'a-fresh-password' } });
    expect(newLogin.statusCode).toBe(200);
  });

  it('answers 200 and sends nothing for an unknown email (no enumeration)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset/request', payload: { email: 'ghost@example.com' } });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 30)); // let any (mistaken) off-path send land
    expect(sentBodies).toHaveLength(0);
  });

  it('answers 200 (never 400) on a malformed request body — preserves the anti-enumeration contract', async () => {
    for (const payload of [{}, { email: 'not-an-email' }, { nope: 1 }]) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/reset/request', payload });
      expect(res.statusCode).toBe(200);
    }
    await new Promise((r) => setTimeout(r, 30));
    expect(sentBodies).toHaveLength(0);
  });

  it('answers 200 even when delivery fails — the response is independent of the send outcome', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => new Response(null, { status: 500 }));
    await register('bounce@example.com');
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset/request', payload: { email: 'bounce@example.com' } });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 30)); // let the .catch run (no unhandled rejection)
  });

  it('a completed reset invalidates the pre-reset session (tokenEpoch bump, route-level)', async () => {
    const cookie = await register('sess@example.com');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } })).statusCode).toBe(200);

    await app.inject({ method: 'POST', url: '/api/auth/reset/request', payload: { email: 'sess@example.com' } });
    const token = await waitForResetToken();
    expect((await app.inject({ method: 'POST', url: '/api/auth/reset/confirm', payload: { token, newPassword: 'rotated-password' } })).statusCode).toBe(200);

    // The old cookie is now dead.
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } })).statusCode).toBe(401);
  });

  it('rejects an invalid token on confirm', async () => {
    await register('two@example.com');
    const bad = await app.inject({ method: 'POST', url: '/api/auth/reset/confirm', payload: { token: 'not-a-real-token', newPassword: 'whateverpass' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.kind).toBe('invalid_token');
  });

  it('validates the new password length on confirm', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/reset/confirm', payload: { token: 'x', newPassword: 'short' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.kind).toBe('bad_request');
  });
});
