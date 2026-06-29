import { describe, it, expect } from 'vitest';
import { NoteSchema, NoteExportSchema } from './notes';

const iso = '2026-06-28T13:45:00.000Z';

describe('contracts: Note', () => {
  it('defaults tags, pinned, and symbol for a minimal note', () => {
    const parsed = NoteSchema.parse({ id: 'n1', title: 'Thesis', body: 'x', createdAt: iso, updatedAt: iso });
    expect(parsed.tags).toEqual([]);
    expect(parsed.pinned).toBe(false);
    expect(parsed.symbol).toBeNull();
  });

  it('round-trips tags, pinned, and a symbol', () => {
    const parsed = NoteSchema.parse({
      id: 'n2',
      title: 'AAPL',
      body: '**bold**',
      symbol: 'AAPL',
      tags: ['earnings', 'long'],
      pinned: true,
      createdAt: iso,
      updatedAt: iso,
    });
    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.tags).toEqual(['earnings', 'long']);
    expect(parsed.pinned).toBe(true);
  });

  it('rejects a non-array tags field', () => {
    const result = NoteSchema.safeParse({ id: 'n3', title: 't', body: 'b', tags: 'oops', createdAt: iso, updatedAt: iso });
    expect(result.success).toBe(false);
  });
});

describe('contracts: NoteExport', () => {
  it('round-trips an export envelope', () => {
    const note = NoteSchema.parse({ id: 'n1', title: 't', body: 'b', createdAt: iso, updatedAt: iso });
    const exported = NoteExportSchema.parse({ version: 1, exportedAt: iso, notes: [note] });
    expect(exported.version).toBe(1);
    expect(exported.notes).toHaveLength(1);
    expect(exported.notes[0]!.id).toBe('n1');
  });

  it('defaults version and an empty notes array', () => {
    const parsed = NoteExportSchema.parse({ exportedAt: iso });
    expect(parsed.version).toBe(1);
    expect(parsed.notes).toEqual([]);
  });
});
