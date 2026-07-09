import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MemoryRateLimitStore,
  SqliteRateLimitStore,
  type RateLimitStore,
} from './rateLimitStore';

// One behavioural suite run against every backend, so the shared store is
// provably interchangeable with the in-process default.
const backends: Array<{ name: string; make: () => Promise<RateLimitStore> }> = [
  { name: 'MemoryRateLimitStore', make: () => Promise.resolve(new MemoryRateLimitStore()) },
  { name: 'SqliteRateLimitStore', make: () => SqliteRateLimitStore.open(':memory:') },
];

for (const backend of backends) {
  describe(backend.name, () => {
    it('allows up to the limit in the window, then blocks, and reports remaining', async () => {
      const store = await backend.make();
      const t0 = 1_000_000;
      expect(await store.hit('ip', 3, 60_000, t0)).toEqual({ allowed: true, remaining: 2 });
      expect(await store.hit('ip', 3, 60_000, t0 + 1)).toEqual({ allowed: true, remaining: 1 });
      expect(await store.hit('ip', 3, 60_000, t0 + 2)).toEqual({ allowed: true, remaining: 0 });
      expect(await store.hit('ip', 3, 60_000, t0 + 3)).toEqual({ allowed: false, remaining: 0 });
      store.close?.();
    });

    it('slides: expired hits free budget and a blocked hit is not recorded', async () => {
      const store = await backend.make();
      const t0 = 5_000;
      expect((await store.hit('ip', 2, 1_000, t0)).allowed).toBe(true);
      expect((await store.hit('ip', 2, 1_000, t0 + 100)).allowed).toBe(true);
      // Over budget: blocked — and because it wasn't recorded, once the first two
      // age out the window is fully clear again.
      expect((await store.hit('ip', 2, 1_000, t0 + 200)).allowed).toBe(false);
      expect(await store.hit('ip', 2, 1_000, t0 + 1_150)).toEqual({ allowed: true, remaining: 1 });
      store.close?.();
    });

    it('keeps keys independent', async () => {
      const store = await backend.make();
      expect((await store.hit('a', 1, 60_000, 0)).allowed).toBe(true);
      expect((await store.hit('b', 1, 60_000, 0)).allowed).toBe(true);
      expect((await store.hit('a', 1, 60_000, 1)).allowed).toBe(false);
      store.close?.();
    });
  });
}

// The whole point of the SQLite backend: two independent connections to the same
// database file share one budget — i.e. two API nodes enforce a single limit.
describe('SqliteRateLimitStore (shared file across connections)', () => {
  let dir: string;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('enforces one budget across two connections to the same DB', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tyche-rl-'));
    const path = join(dir, 'ratelimit.db');
    const nodeA = await SqliteRateLimitStore.open(path);
    const nodeB = await SqliteRateLimitStore.open(path);
    try {
      const t0 = 2_000_000;
      // Budget of 2: node A spends one, node B spends the other, then EITHER node
      // is blocked — the count is shared, not per-connection.
      expect((await nodeA.hit('ip', 2, 60_000, t0)).allowed).toBe(true);
      expect((await nodeB.hit('ip', 2, 60_000, t0 + 1)).allowed).toBe(true);
      expect((await nodeA.hit('ip', 2, 60_000, t0 + 2)).allowed).toBe(false);
      expect((await nodeB.hit('ip', 2, 60_000, t0 + 3)).allowed).toBe(false);
    } finally {
      nodeA.close();
      nodeB.close();
    }
  });
});
