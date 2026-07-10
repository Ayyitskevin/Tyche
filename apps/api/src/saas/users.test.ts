import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UserRegistry } from './users';

describe('UserRegistry.create — concurrency', () => {
  it('does not create duplicate accounts when two signups for the same email race', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tyche-users-'));
    try {
      const reg = new UserRegistry(dir);
      await reg.init();
      // Both create() calls start before either awaits scrypt, so the second must
      // lose on the synchronous email reservation rather than both inserting.
      const results = await Promise.allSettled([
        reg.create('race@example.com', 'hunter22222'),
        reg.create('race@example.com', 'hunter22222'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rejected).toHaveLength(1);
      expect((rejected[0]!.reason as Error).message).toBe('email_taken');
      expect(reg.list().filter((u) => u.email === 'race@example.com')).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('frees the reservation after a completed create so the email is a normal duplicate afterward', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tyche-users-'));
    try {
      const reg = new UserRegistry(dir);
      await reg.init();
      await reg.create('taken@example.com', 'hunter22222');
      await expect(reg.create('taken@example.com', 'hunter22222')).rejects.toThrow('email_taken');
      expect(reg.list()).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
