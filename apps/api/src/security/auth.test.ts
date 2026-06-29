import { describe, it, expect } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createAuthGuard } from './auth';
import type { ApiConfig } from '../env';

function cfg(over: Partial<ApiConfig> = {}): ApiConfig {
  return { authEnabled: true, authToken: 'secret', ...over } as unknown as ApiConfig;
}

function run(guard: ReturnType<typeof createAuthGuard>, method: string, url: string, authorization?: string) {
  const result = { done: 0, code: null as number | null };
  const request = { method, url, headers: authorization ? { authorization } : {} } as unknown as FastifyRequest;
  const reply = {
    code(c: number) {
      result.code = c;
      return this;
    },
    send() {
      /* noop */
    },
  } as unknown as FastifyReply;
  guard(request, reply, () => {
    result.done += 1;
  });
  return result;
}

describe('createAuthGuard', () => {
  it('is a no-op when auth is disabled', () => {
    const guard = createAuthGuard(cfg({ authEnabled: false }));
    expect(run(guard, 'POST', '/api/notes').done).toBe(1);
  });

  it('blocks an unauthenticated mutation with 401', () => {
    const r = run(createAuthGuard(cfg()), 'POST', '/api/notes');
    expect(r.done).toBe(0);
    expect(r.code).toBe(401);
  });

  it('allows a mutation carrying the right bearer token', () => {
    expect(run(createAuthGuard(cfg()), 'POST', '/api/notes', 'Bearer secret').done).toBe(1);
  });

  it('leaves ordinary reads open but protects GET /api/audit', () => {
    const guard = createAuthGuard(cfg());
    expect(run(guard, 'GET', '/api/quote/AAPL').done).toBe(1); // open
    expect(run(guard, 'GET', '/api/audit?limit=20').code).toBe(401); // protected
    expect(run(guard, 'GET', '/api/audit', 'Bearer secret').done).toBe(1); // with token
  });
});
