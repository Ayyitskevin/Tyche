import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless signed session tokens: `uid.epoch.expiresMs.signature`. The HMAC
 * covers uid+epoch+expiry, so tokens survive API restarts with no session
 * store, and bumping a user's tokenEpoch invalidates everything outstanding.
 */

const SESSION_TTL_MS = 30 * 86_400_000;

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueSession(secret: string, userId: string, tokenEpoch: number, ttlMs = SESSION_TTL_MS): string {
  const expires = Date.now() + ttlMs;
  const payload = `${userId}.${tokenEpoch}.${expires}`;
  return `${payload}.${sign(secret, payload)}`;
}

export interface SessionClaims {
  userId: string;
  tokenEpoch: number;
}

/** Verify a token's signature and expiry. Epoch matching is the caller's job. */
export function verifySession(secret: string, token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [userId, epochStr, expiresStr, signature] = parts as [string, string, string, string];
  const payload = `${userId}.${epochStr}.${expiresStr}`;
  const expected = Buffer.from(sign(secret, payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const expires = Number(expiresStr);
  const tokenEpoch = Number(epochStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  if (!Number.isInteger(tokenEpoch)) return null;
  return { userId, tokenEpoch };
}

export const SESSION_COOKIE = 'tyche_session';
