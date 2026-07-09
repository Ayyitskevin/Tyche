import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rateLimit';

describe('RateLimiter', () => {
  it('allows up to the limit inside the window, then blocks', async () => {
    const rl = new RateLimiter(3, 60_000);
    const t0 = 1_000_000;
    expect(await rl.allow('ip', t0)).toBe(true);
    expect(await rl.allow('ip', t0 + 1)).toBe(true);
    expect(await rl.allow('ip', t0 + 2)).toBe(true);
    expect(await rl.allow('ip', t0 + 3)).toBe(false);
  });

  it('window slides: old attempts expire and free budget', async () => {
    const rl = new RateLimiter(2, 1_000);
    const t0 = 5_000;
    expect(await rl.allow('ip', t0)).toBe(true);
    expect(await rl.allow('ip', t0 + 100)).toBe(true);
    expect(await rl.allow('ip', t0 + 200)).toBe(false);
    expect(await rl.allow('ip', t0 + 1_150)).toBe(true); // first attempt aged out
  });

  it('keys are independent', async () => {
    const rl = new RateLimiter(1, 60_000);
    expect(await rl.allow('a', 0)).toBe(true);
    expect(await rl.allow('b', 0)).toBe(true);
    expect(await rl.allow('a', 1)).toBe(false);
  });
});
