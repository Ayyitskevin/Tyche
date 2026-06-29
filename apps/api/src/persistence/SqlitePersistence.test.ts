import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NoteSchema, SavedScreenSchema, WatchlistSchema } from '@tyche/contracts';
import { PERSISTENCE_VERSION } from './types';
import { SqlitePersistence } from './SqlitePersistence';

const iso = '2026-06-29T00:00:00.000Z';
function dbPath() {
  return join(tmpdir(), `tyche-sqlite-${randomUUID()}.db`);
}

describe('SqlitePersistence', () => {
  it('writes the schema version and idempotently seeds only when empty', async () => {
    const path = dbPath();
    const a = new SqlitePersistence(path);
    await a.init();
    // Add a second watchlist, then close.
    await a.saveWatchlist(WatchlistSchema.parse({ id: 'wl_2', name: 'Two', symbols: [], createdAt: iso, updatedAt: iso }));
    a.close();

    // Reopen the same file: init must NOT reseed (no duplicate default watchlist).
    const b = new SqlitePersistence(path);
    await b.init();
    const ids = (await b.listWatchlists()).map((w) => w.id).sort();
    expect(ids).toEqual(['wl_2', 'wl_default']);
    expect((await b.snapshot()).version).toBe(PERSISTENCE_VERSION);
    b.close();
  });

  it('persists data across reopen', async () => {
    const path = dbPath();
    const a = new SqlitePersistence(path);
    await a.init();
    await a.saveNote(NoteSchema.parse({ id: 'persisted', symbol: 'MSFT', title: 'keep', body: 'x', createdAt: iso, updatedAt: iso }));
    await a.saveSavedScreen(
      SavedScreenSchema.parse({ id: 'sc', name: 'Energy', query: { filters: [{ field: 'sector', op: 'eq', value: 'Energy' }] }, createdAt: iso, updatedAt: iso }),
    );
    a.close();

    const b = new SqlitePersistence(path);
    await b.init();
    const restored = (await b.listNotes()).find((n) => n.id === 'persisted');
    expect(restored?.title).toBe('keep');
    expect(restored?.symbol).toBe('MSFT');
    // Saved screens (incl. a categorical filter) survive the reopen too.
    const screen = (await b.listSavedScreens()).find((s) => s.id === 'sc');
    expect(screen?.query.filters[0]).toEqual({ field: 'sector', op: 'eq', value: 'Energy' });
    b.close();
  });

  it('creates an index on notes.symbol', async () => {
    const path = dbPath();
    const store = new SqlitePersistence(path);
    await store.init();
    // Inspect the schema via a fresh read connection (WAL allows concurrent readers).
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const reader = new DatabaseSync(path);
    const idx = reader
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_notes_symbol'")
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe('idx_notes_symbol');
    reader.close();
    store.close();
  });
});
