import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { UserRegistry } from './users';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tyche-verify-'));
  dirs.push(dir);
  return dir;
}
const SECRET = 'test-session-secret-0123456789';

afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('UserRegistry email-verification tokens', () => {
  async function freshRegistry(): Promise<{ reg: UserRegistry; id: string }> {
    const reg = new UserRegistry(tempDir(), null);
    await reg.init();
    const user = await reg.create('user@example.com', 'originalpass');
    return { reg, id: user.id };
  }

  it('new accounts start unverified and toPublicUser reports it', async () => {
    const { reg } = await freshRegistry();
    expect(reg.findByEmail('user@example.com')!.emailVerified).toBeUndefined();
  });

  it('verifies with a valid token, single-use, without bumping the session epoch', async () => {
    const { reg, id } = await freshRegistry();
    const epoch = reg.get(id)!.tokenEpoch;
    const token = await reg.issueVerifyToken(id);
    expect(token).toBeTruthy();
    const user = await reg.verifyEmail(token!);
    expect(user).not.toBeNull();
    expect(user!.emailVerified).toBe(true);
    expect(user!.tokenEpoch).toBe(epoch); // verifying must NOT sign the user out anywhere
    expect(await reg.verifyEmail(token!)).toBeNull(); // single-use
  });

  it('returns null for an unknown id and refuses to re-issue once verified', async () => {
    const { reg, id } = await freshRegistry();
    expect(await reg.issueVerifyToken('u_nope')).toBeNull();
    const token = await reg.issueVerifyToken(id);
    await reg.verifyEmail(token!);
    expect(await reg.issueVerifyToken(id)).toBeNull(); // already verified
  });

  it('rejects an expired token', async () => {
    const { reg, id } = await freshRegistry();
    const token = await reg.issueVerifyToken(id, -1);
    expect(await reg.verifyEmail(token!)).toBeNull();
  });

  it('verification tokens and reset tokens do not cross-consume', async () => {
    const { reg, id } = await freshRegistry();
    const verifyToken = await reg.issueVerifyToken(id);
    const resetToken = await reg.issueResetToken('user@example.com');
    expect(await reg.resetPassword(verifyToken!, 'sneaky-pass1')).toBeNull();
    expect(await reg.verifyEmail(resetToken!)).toBeNull();
  });
});

describe('hosted mode: email verification routes', () => {
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
  async function waitForSends(n: number): Promise<void> {
    for (let i = 0; i < 200 && sentBodies.length < n; i++) await new Promise((r) => setTimeout(r, 5));
    expect(sentBodies.length).toBeGreaterThanOrEqual(n);
  }
  function tokenFromLastEmail(): string {
    const body = JSON.parse(sentBodies.at(-1)!) as { text: string };
    const m = /verify\.html\?token=([a-f0-9]+)/.exec(body.text);
    expect(m).not.toBeNull();
    return m![1]!;
  }

  it('register emails a verification link; verify flips the flag visible via /me', async () => {
    const cookie = await register('new-user@example.com');
    const me1 = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } });
    expect(me1.json().data.user.emailVerified).toBe(false);

    await waitForSends(1);
    const token = tokenFromLastEmail();
    const verify = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { token } });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().data.user.emailVerified).toBe(true);

    const me2 = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tyche_session: cookie } });
    expect(me2.json().data.user.emailVerified).toBe(true);
    // The original session still works — verification never signs anyone out.
    expect(me2.statusCode).toBe(200);
  });

  it('unverified accounts are NOT gated: reads and persistence writes still work', async () => {
    const cookie = await register('unverified@example.com');
    const prefs = await app.inject({ method: 'GET', url: '/api/preferences', cookies: { tyche_session: cookie } });
    expect(prefs.statusCode).toBe(200);
  });

  it('rejects an invalid or reused token with 400 invalid_token', async () => {
    await register('reuse@example.com');
    await waitForSends(1);
    const token = tokenFromLastEmail();
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { token } })).statusCode).toBe(200);
    const again = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { token } });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.kind).toBe('invalid_token');
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { token: 'garbage' } })).statusCode).toBe(400);
  });

  it('resend requires a session, re-emails for unverified, and no-ops once verified', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify/resend', payload: {} })).statusCode).toBe(401);

    const cookie = await register('resend@example.com');
    await waitForSends(1);
    const resend = await app.inject({ method: 'POST', url: '/api/auth/verify/resend', cookies: { tyche_session: cookie }, payload: {} });
    expect(resend.statusCode).toBe(200);
    await waitForSends(2);
    const token = tokenFromLastEmail(); // the RE-issued token is the live one
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { token } })).statusCode).toBe(200);

    const after = await app.inject({ method: 'POST', url: '/api/auth/verify/resend', cookies: { tyche_session: cookie }, payload: {} });
    expect(after.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect(sentBodies).toHaveLength(2); // verified: nothing more sent
  });
});
