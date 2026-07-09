import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Pluggable backend for the auth rate limiter. The limiter holds the policy
 * (budget + window); the store holds the shared *state* — one atomic
 * sliding-window count-and-record per key. Splitting them this way lets a
 * multi-node deployment enforce ONE budget across every API instance instead of
 * `limit × nodes`: point every node at a shared store (SQLite on a shared
 * volume, or your own Redis impl behind this same interface).
 */
export interface RateLimitDecision {
  /** True when the hit was within budget and has been recorded. */
  allowed: boolean;
  /** Attempts still available in the current window after this call (0 when blocked). */
  remaining: number;
}

export interface RateLimitStore {
  /**
   * Atomically prune expired hits for `key`, decide against `limit` over the
   * trailing `windowMs`, and — only when allowed — record this hit at `nowMs`.
   * Must be a single atomic step so concurrent callers (threads or nodes)
   * cannot both slip past the limit on the same key.
   */
  hit(key: string, limit: number, windowMs: number, nowMs: number): Promise<RateLimitDecision>;
  /** Release backend resources (close a DB handle, etc.). */
  close?(): void;
}

/**
 * In-process default: per-key hit timestamps in a Map, pruned on touch. Zero
 * dependencies, but node-local — every instance keeps its own counts, so it
 * does NOT bound a budget across a horizontally-scaled deployment. That is what
 * {@link SqliteRateLimitStore} (or a Redis impl) is for.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  hit(key: string, limit: number, windowMs: number, nowMs: number): Promise<RateLimitDecision> {
    const cutoff = nowMs - windowMs;
    const past = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (past.length >= limit) {
      this.hits.set(key, past);
      return Promise.resolve({ allowed: false, remaining: 0 });
    }
    past.push(nowMs);
    this.hits.set(key, past);
    // Opportunistic global prune so abandoned keys can't grow the map forever.
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) {
        if (times.every((t) => t <= cutoff)) this.hits.delete(k);
      }
    }
    return Promise.resolve({ allowed: true, remaining: limit - past.length });
  }
}

/**
 * SQLite-backed shared store using Node's built-in `node:sqlite` (no native
 * dependency). Hit timestamps live in one `rate_hits` table keyed by the
 * limiter key, so every process/node pointing at the same database file
 * enforces a single sliding-window budget. Each `hit()` runs inside a
 * `BEGIN IMMEDIATE` transaction and the connection sets `busy_timeout`, so
 * concurrent writers serialize instead of racing or throwing `SQLITE_BUSY`.
 *
 * Construct via {@link SqliteRateLimitStore.open} so a runtime without
 * `node:sqlite` (or an unopenable path) surfaces as a rejected promise the
 * caller can fall back from — mirroring the persistence layer's policy.
 */
export class SqliteRateLimitStore implements RateLimitStore {
  private constructor(private readonly db: DatabaseSync) {}

  static async open(path: string): Promise<SqliteRateLimitStore> {
    if (path !== ':memory:') await mkdir(dirname(path), { recursive: true }).catch(() => {});
    // require() (not dynamic import) keeps the `node:sqlite` builtin opaque to
    // bundlers while still loading lazily so a missing builtin can be caught.
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(path);
    try {
      db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 2000;
        CREATE TABLE IF NOT EXISTS rate_hits (k TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_rate_hits_k_ts ON rate_hits (k, ts);
      `);
    } catch (err) {
      db.close();
      throw err;
    }
    return new SqliteRateLimitStore(db);
  }

  hit(key: string, limit: number, windowMs: number, nowMs: number): Promise<RateLimitDecision> {
    const cutoff = nowMs - windowMs;
    const db = this.db;
    // BEGIN IMMEDIATE takes the write lock up front so a concurrent process
    // can't read-then-write the same key between our count and insert.
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM rate_hits WHERE k = ? AND ts <= ?').run(key, cutoff);
      const row = db.prepare('SELECT COUNT(*) AS n FROM rate_hits WHERE k = ?').get(key) as { n: number };
      const used = Number(row.n);
      if (used >= limit) {
        db.exec('COMMIT');
        return Promise.resolve({ allowed: false, remaining: 0 });
      }
      db.prepare('INSERT INTO rate_hits (k, ts) VALUES (?, ?)').run(key, nowMs);
      // Bound the table: sweep every key's expired rows once it grows large, so
      // keys that are never touched again can't leak rows forever.
      const total = db.prepare('SELECT COUNT(*) AS n FROM rate_hits').get() as { n: number };
      if (Number(total.n) > 10_000) db.prepare('DELETE FROM rate_hits WHERE ts <= ?').run(cutoff);
      db.exec('COMMIT');
      return Promise.resolve({ allowed: true, remaining: limit - used - 1 });
    } catch (err) {
      // Guard the rollback: if BEGIN itself failed there is no active
      // transaction, and an unguarded ROLLBACK would mask the real error.
      try {
        db.exec('ROLLBACK');
      } catch {
        /* no active transaction */
      }
      throw err;
    }
  }

  close(): void {
    this.db.close();
  }
}
