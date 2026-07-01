/**
 * Small in-process sliding-window rate limiter for the auth endpoints
 * (credential stuffing / signup abuse). Per-key (client IP) hit timestamps,
 * pruned on touch — no timers, no dependencies. For multi-node deployments
 * put a shared limiter at the proxy instead; this is the safe default for the
 * single-container shape Tyche ships in.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Record an attempt for `key`; returns false when the key is over budget. */
  allow(key: string, nowMs = Date.now()): boolean {
    const cutoff = nowMs - this.windowMs;
    const past = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (past.length >= this.limit) {
      this.hits.set(key, past);
      return false;
    }
    past.push(nowMs);
    this.hits.set(key, past);
    // Opportunistic global prune so abandoned keys can't grow the map forever.
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) {
        if (times.every((t) => t <= cutoff)) this.hits.delete(k);
      }
    }
    return true;
  }
}
