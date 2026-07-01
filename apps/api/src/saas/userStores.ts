import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ApiConfig } from '../env';
import { FilePersistence } from '../persistence/FilePersistence';
import { SqlitePersistence } from '../persistence/SqlitePersistence';
import type { PersistenceStore } from '../persistence/types';

/**
 * Hosted-mode data isolation: every user gets a private store under
 * `<dataDir>/users/<id>/` — a JSON document dir or a SQLite database, matching
 * the configured backend. Stores are created lazily and cached for the process
 * lifetime; SQLite failures fall back to the file store (same policy as boot).
 */
export class UserStores {
  private readonly cache = new Map<string, Promise<PersistenceStore>>();

  constructor(private readonly config: ApiConfig) {}

  forUser(userId: string): Promise<PersistenceStore> {
    let store = this.cache.get(userId);
    if (!store) {
      store = this.open(userId);
      this.cache.set(userId, store);
    }
    return store;
  }

  private async open(userId: string): Promise<PersistenceStore> {
    const dir = join(this.config.dataDir, 'users', userId);
    if (this.config.persistence === 'sqlite') {
      try {
        const sqlite = new SqlitePersistence(join(dir, 'tyche.db'));
        await sqlite.init();
        return sqlite;
      } catch {
        // Fall through to the file store — a user must never be locked out.
      }
    }
    const file = new FilePersistence(dir);
    await file.init();
    return file;
  }

  /** Account deletion: close the store and remove the user's data directory. */
  async destroy(userId: string): Promise<void> {
    const pending = this.cache.get(userId);
    this.cache.delete(userId);
    if (pending) {
      try {
        (await pending).close?.();
      } catch {
        // Proceed to removal regardless — the directory is the source of truth.
      }
    }
    await rm(join(this.config.dataDir, 'users', userId), { recursive: true, force: true });
  }

  async closeAll(): Promise<void> {
    for (const pending of this.cache.values()) {
      try {
        (await pending).close?.();
      } catch {
        // Best-effort shutdown.
      }
    }
    this.cache.clear();
  }
}
