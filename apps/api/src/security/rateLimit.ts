import { MemoryRateLimitStore, type RateLimitStore } from './rateLimitStore';

/**
 * Small sliding-window rate limiter for the auth endpoints (credential stuffing
 * / signup abuse). Holds the policy — budget + window — and delegates the
 * per-key hit accounting to a {@link RateLimitStore}. The default store is
 * in-process (node-local); pass a shared store (SQLite/Redis) to enforce ONE
 * budget across a multi-node deployment. See rateLimitStore.ts.
 */
export class RateLimiter {
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly store: RateLimitStore = new MemoryRateLimitStore(),
  ) {}

  /** Record an attempt for `key`; resolves false when the key is over budget. */
  async allow(key: string, nowMs = Date.now()): Promise<boolean> {
    const { allowed } = await this.store.hit(key, this.limit, this.windowMs, nowMs);
    return allowed;
  }
}
