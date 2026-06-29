import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { AlertRuleSchema } from '@tyche/contracts';
import { FilePersistence } from './FilePersistence';

const dir = join(tmpdir(), `tyche-fp-${randomUUID()}`);
let store: FilePersistence;

function alert(over: Record<string, unknown>) {
  return AlertRuleSchema.parse({
    id: `a_${randomUUID()}`,
    symbol: 'AAPL',
    operator: 'gt',
    threshold: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });
}

beforeAll(async () => {
  store = new FilePersistence(dir);
  await store.init();
});

describe('FilePersistence alert CRUD', () => {
  it('round-trips and deletes an alert', async () => {
    const rule = alert({ id: 'a1' });
    await store.saveAlert(rule);
    expect((await store.listAlerts()).map((a) => a.id)).toContain('a1');
    expect(await store.deleteAlert('a1')).toBe(true);
    expect((await store.listAlerts()).map((a) => a.id)).not.toContain('a1');
  });
});

describe('FilePersistence.markAlertTriggered (compare-and-set)', () => {
  it('fires a oneShot exactly once and preserves other fields', async () => {
    const rule = alert({ id: 'a2', threshold: 1, oneShot: true, note: 'keep-me' });
    await store.saveAlert(rule);
    expect(await store.markAlertTriggered('a2', '2026-06-29T00:00:00.000Z', true)).toBe(true);
    expect(await store.markAlertTriggered('a2', '2026-06-29T00:00:01.000Z', true)).toBe(false); // already inactive
    const stored = (await store.listAlerts()).find((a) => a.id === 'a2')!;
    expect(stored.active).toBe(false);
    expect(stored.lastTriggeredAt).toBe('2026-06-29T00:00:00.000Z');
    expect(stored.note).toBe('keep-me'); // targeted mutation, no clobber
  });

  it('keeps a non-oneShot active and re-stamps lastTriggeredAt', async () => {
    const rule = alert({ id: 'a3', threshold: 1, oneShot: false });
    await store.saveAlert(rule);
    expect(await store.markAlertTriggered('a3', '2026-06-29T00:00:00.000Z', false)).toBe(true);
    expect(await store.markAlertTriggered('a3', '2026-06-29T00:00:02.000Z', false)).toBe(true);
    const stored = (await store.listAlerts()).find((a) => a.id === 'a3')!;
    expect(stored.active).toBe(true);
    expect(stored.lastTriggeredAt).toBe('2026-06-29T00:00:02.000Z');
  });

  it('returns false for a missing rule', async () => {
    expect(await store.markAlertTriggered('nope', '2026-06-29T00:00:00.000Z', true)).toBe(false);
  });
});

describe('FilePersistence migration (v1 → v2)', () => {
  it('backfills note tags/pinned and missing collections from a v1 document', async () => {
    const v1Dir = join(tmpdir(), `tyche-fp-v1-${randomUUID()}`);
    await mkdir(v1Dir, { recursive: true });
    // A pre-v2 document: notes lack tags/pinned, and `portfolios` is absent entirely.
    const v1Doc = {
      version: 1,
      preferences: { theme: 'midnight', density: 'comfortable', updatedAt: '2026-01-01T00:00:00.000Z' },
      workspaces: [],
      watchlists: [],
      notes: [{ id: 'old', symbol: 'AAPL', title: 'Legacy', body: 'note', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      alerts: [],
    };
    await writeFile(join(v1Dir, 'tyche-db.json'), JSON.stringify(v1Doc), 'utf8');

    const migrated = new FilePersistence(v1Dir);
    await migrated.init();

    const snapshot = await migrated.snapshot();
    expect(snapshot.version).toBe(2);
    expect(snapshot.portfolios).toEqual([]);
    expect(snapshot.savedScreens).toEqual([]); // collection absent in the legacy doc → backfilled
    expect(await migrated.listSavedScreens()).toEqual([]);
    const note = (await migrated.listNotes()).find((n) => n.id === 'old')!;
    expect(note.tags).toEqual([]);
    expect(note.pinned).toBe(false);
    expect(note.title).toBe('Legacy'); // existing fields preserved
  });
});
