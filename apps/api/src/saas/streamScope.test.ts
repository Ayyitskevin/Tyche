import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app';

const SECRET = 'test-session-secret-0123456789';

/** Register a user over HTTP and return the tyche_session cookie value. */
async function register(base: string, email: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter22222' }),
  });
  expect(res.status).toBe(201);
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('tyche_session='));
  return setCookie!.split(';')[0]!.split('=')[1]!;
}

/** Open an SSE stream with the given session, read for `ms`, count `alert` frames. */
async function countAlertFrames(url: string, session: string, ms: number): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  let buf = '';
  try {
    const res = await fetch(url, {
      headers: { cookie: `tyche_session=${session}`, accept: 'text/event-stream' },
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
  } catch {
    // AbortError once the window closes — expected.
  } finally {
    clearTimeout(timer);
  }
  return (buf.match(/event: alert/g) ?? []).length;
}

describe('hosted SSE alert stream is per-user scoped', () => {
  it('delivers a fired rule only to its owner and records the fire in their store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tyche-sse-'));
    const app = await buildApp({
      config: { mode: 'hosted', sessionSecret: SECRET, dataDir: dir, providers: ['mock'] },
      hubIntervalMs: 40,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    try {
      const a = await register(base, 'a@example.com');
      const b = await register(base, 'b@example.com');

      // A owns an always-firing AAPL rule (gt 0 fires once, on the first tick).
      const created = await fetch(`${base}/api/alerts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `tyche_session=${a}` },
        body: JSON.stringify({ symbol: 'AAPL', operator: 'gt', threshold: 0 }),
      });
      expect(created.status).toBe(200);

      const [aFrames, bFrames] = await Promise.all([
        countAlertFrames(`${base}/api/stream/alerts?symbols=AAPL`, a, 600),
        countAlertFrames(`${base}/api/stream/alerts?symbols=AAPL`, b, 600),
      ]);
      // A's connection resolves A's store (has the rule) → fires. If per-user
      // scoping broke (root-store fallback), A's rule wouldn't be found and A
      // would get nothing — so aFrames>0 guards the scoping directly.
      expect(aFrames).toBeGreaterThan(0);
      // B has no rules; a correctly-scoped stream never evaluates A's rule for B.
      expect(bFrames).toBe(0);

      // The fire persisted in A's store...
      const aAlerts = (await (await fetch(`${base}/api/alerts`, { headers: { cookie: `tyche_session=${a}` } })).json()) as {
        data: Array<{ lastTriggeredAt: string | null }>;
      };
      expect(aAlerts.data[0]!.lastTriggeredAt).not.toBeNull();
      // ...and not in B's (B has no alerts at all).
      const bAlerts = (await (await fetch(`${base}/api/alerts`, { headers: { cookie: `tyche_session=${b}` } })).json()) as {
        data: unknown[];
      };
      expect(bAlerts.data).toHaveLength(0);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
