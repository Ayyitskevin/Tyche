/**
 * Caching layer interface. The foundation ships an in-memory implementation;
 * the interface is intentionally small so a Redis/file-backed store can be
 * dropped in later without touching call sites.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

export class MemoryCache implements CacheStore {
  private readonly store = new Map<string, Entry>();
  constructor(private readonly defaultTtlMs: number | null = null) {}

  get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(undefined);
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value as T);
  }

  set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttl !== null && ttl !== undefined ? Date.now() + ttl : null;
    this.store.set(key, { value, expiresAt });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  /** Convenience: fetch-through caching. */
  async wrap<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await loader();
    await this.set(key, value, ttlMs);
    return value;
  }
}
