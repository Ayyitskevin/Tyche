import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiConfig } from '../env';

/**
 * Optional bearer-token guard. OFF by default for local development. When
 * `TYCHE_AUTH_ENABLED=true`, mutating requests must carry
 * `Authorization: Bearer <TYCHE_AUTH_TOKEN>`. Most read-only routes stay open so
 * the mock terminal remains trivially runnable — but the audit trail
 * (`GET /api/audit`) is protected too, since an operator who enables auth expects
 * the accountability log behind the same token as the actions it records.
 */
export function createAuthGuard(config: ApiConfig) {
  return function authGuard(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
    if (!config.authEnabled) {
      done();
      return;
    }
    const method = request.method.toUpperCase();
    const isMutation = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';
    const isProtectedRead = method === 'GET' && (request.url.split('?')[0] ?? '') === '/api/audit';
    if (!isMutation && !isProtectedRead) {
      done();
      return;
    }
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (config.authToken && token === config.authToken) {
      done();
      return;
    }
    reply.code(401).send({
      error: { kind: 'unauthorized', message: 'A valid bearer token is required for this action.' },
    });
  };
}
