import { describe, it, expect } from 'vitest';
import type { Filing } from '@tyche/contracts';
import { decodeEightKItem, eightKEvents, isEightK, EIGHT_K_ITEMS } from './eightK';

const fil = (o: Partial<Filing>): Filing => ({
  id: 'f1',
  symbol: 'AAPL',
  form: '8-K',
  title: 'Apple Inc. — Current report (8-K)',
  filedAt: '2024-05-01T00:00:00.000Z',
  documents: [],
  items: [],
  ...o,
});

describe('decodeEightKItem', () => {
  it('decodes a known code to its authoritative SEC label + category', () => {
    const d = decodeEightKItem('2.02');
    expect(d).toMatchObject({ code: '2.02', label: EIGHT_K_ITEMS['2.02']!.label, category: 'Financial Results', known: true });
  });

  it('tolerates an "Item " prefix and a trailing period', () => {
    expect(decodeEightKItem('Item 5.02.').code).toBe('5.02');
    expect(decodeEightKItem('  9.01 ').code).toBe('9.01');
  });

  it('never fabricates a label for an unknown code — echoes the code, flagged unknown', () => {
    const d = decodeEightKItem('2.99');
    expect(d).toMatchObject({ code: '2.99', label: 'Item 2.99', category: 'Other', known: false });
  });
});

describe('isEightK', () => {
  it('matches 8-K and its variants, rejects other forms', () => {
    expect(isEightK('8-K')).toBe(true);
    expect(isEightK('8-K/A')).toBe(true);
    expect(isEightK('8-K12B')).toBe(true);
    expect(isEightK('10-K')).toBe(false);
    expect(isEightK('DEF 14A')).toBe(false);
  });
});

describe('eightKEvents', () => {
  it('is safe on an empty / no-8-K set', () => {
    expect(eightKEvents([])).toMatchObject({ eventCount: 0, untaggedCount: 0, firstDate: null, lastDate: null });
    const noEights = eightKEvents([fil({ form: '10-Q', items: [] }), fil({ form: 'DEF 14A', items: [] })]);
    expect(noEights.events).toEqual([]);
    expect(noEights.byCategory).toEqual([]);
  });

  it('keeps only 8-K forms, newest first, decoding each tagged item', () => {
    const a = eightKEvents([
      fil({ id: 'old', form: '8-K', filedAt: '2024-01-10T00:00:00.000Z', items: ['1.01', '9.01'] }),
      fil({ id: '10q', form: '10-Q', filedAt: '2024-06-01T00:00:00.000Z', items: [] }), // ignored
      fil({ id: 'new', form: '8-K', filedAt: '2024-05-20T00:00:00.000Z', items: ['2.02', '9.01'] }),
    ]);
    expect(a.events.map((e) => e.id)).toEqual(['new', 'old']); // newest first, 10-Q dropped
    expect(a.events[0]!.items.map((i) => i.code)).toEqual(['2.02', '9.01']);
    expect(a.firstDate).toBe('2024-01-10');
    expect(a.lastDate).toBe('2024-05-20');
  });

  it('flags 8-Ks with no tagged items rather than dropping or guessing them', () => {
    const a = eightKEvents([fil({ id: 'bare', form: '8-K', items: [] })]);
    expect(a.eventCount).toBe(1);
    expect(a.events[0]!.untagged).toBe(true);
    expect(a.untaggedCount).toBe(1);
  });

  it('tallies distinct categories per event, most-frequent first', () => {
    const a = eightKEvents([
      fil({ id: '1', filedAt: '2024-05-03T00:00:00.000Z', items: ['2.02', '9.01'] }), // Financial Results + Exhibits
      fil({ id: '2', filedAt: '2024-05-02T00:00:00.000Z', items: ['2.02'] }), // Financial Results
      fil({ id: '3', filedAt: '2024-05-01T00:00:00.000Z', items: ['5.02'] }), // Management & Governance
    ]);
    expect(a.byCategory[0]).toEqual({ category: 'Financial Results', count: 2 });
    const cats = a.byCategory.map((c) => c.category);
    expect(cats).toContain('Exhibits');
    expect(cats).toContain('Management & Governance');
  });

  it('does not double-count a category repeated within one event', () => {
    // A single event tagged with two Business & Operations items counts that category once.
    const a = eightKEvents([fil({ items: ['1.01', '1.02'] })]);
    expect(a.byCategory).toEqual([{ category: 'Business & Operations', count: 1 }]);
  });

  it('honors a limit, keeping the newest events', () => {
    const filings = Array.from({ length: 5 }, (_, i) =>
      fil({ id: `e${i}`, filedAt: `2024-0${i + 1}-01T00:00:00.000Z`, items: ['8.01'] }),
    );
    const a = eightKEvents(filings, { limit: 2 });
    expect(a.events.map((e) => e.id)).toEqual(['e4', 'e3']); // two newest
    expect(a.eventCount).toBe(2);
  });
});
