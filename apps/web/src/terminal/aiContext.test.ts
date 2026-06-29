import { describe, it, expect } from 'vitest';
import type { DataProvenance, Panel } from '@tyche/contracts';
import { AIContextPacketSchema } from '@tyche/contracts';
import { buildContextPacket } from './aiContext';
import type { ApiNote } from '../providers/apiClient';

const prov = (capability: string): DataProvenance => ({
  provider: 'mock',
  providerMode: 'mock',
  capability,
  retrievedAt: '2026-06-28T13:45:00.000Z',
  freshness: { asOf: '2026-06-28T13:45:00.000Z', tier: 'mock' },
});

function panel(id: string, moduleId: string, symbol: string | null, title: string): Panel {
  return { id, moduleId, symbol, title, state: {} } as unknown as Panel;
}

const note: ApiNote = {
  id: 'n1',
  symbol: 'AAPL',
  title: 'Thesis',
  body: 'x'.repeat(300),
  createdAt: '2026-06-28T00:00:00.000Z',
  updatedAt: '2026-06-28T00:00:00.000Z',
};

describe('buildContextPacket', () => {
  const packet = buildContextPacket({
    activeInstrument: { symbol: 'AAPL', assetClass: 'equity' },
    recentCommands: ['AAPL DES'],
    panels: [panel('p1', 'description', 'AAPL', 'AAPL · DES'), panel('p2', 'quote-monitor', null, 'QM')],
    panelContext: {
      p1: { summary: 'AAPL 187.40 (+1.2%)', provenance: prov('quotes') },
      p2: { summary: null, provenance: prov('quotes') }, // same provider:capability → deduped
    },
    notes: [note],
    watchlistSymbols: ['AAPL', 'AAPL', 'MSFT'],
    selection: null,
  });

  it('maps panels with their summary and provenance', () => {
    expect(packet.openPanels[0]!.summary).toBe('AAPL 187.40 (+1.2%)');
    expect(packet.openPanels[0]!.provenance?.capability).toBe('quotes');
    expect(packet.openPanels[1]!.summary).toBeUndefined();
  });

  it('deduplicates provenance by provider:capability', () => {
    expect(packet.provenance).toHaveLength(1);
  });

  it('folds notes into AINoteRef excerpts (length-capped)', () => {
    expect(packet.notes?.[0]).toMatchObject({ id: 'n1', title: 'Thesis', symbol: 'AAPL' });
    expect(packet.notes?.[0]!.excerpt.length).toBe(160);
  });

  it('dedupes watchlist symbols', () => {
    expect(packet.watchlistSymbols).toEqual(['AAPL', 'MSFT']);
  });

  it('produces a schema-valid packet', () => {
    expect(AIContextPacketSchema.safeParse(packet).success).toBe(true);
  });

  it('yields a sparse-but-valid packet for an empty workspace', () => {
    const sparse = buildContextPacket({
      activeInstrument: null,
      recentCommands: [],
      panels: [],
      panelContext: {},
      notes: [],
      watchlistSymbols: [],
    });
    expect(sparse.openPanels).toEqual([]);
    expect(sparse.provenance).toEqual([]);
    expect(sparse.notes).toBeUndefined();
    expect(AIContextPacketSchema.safeParse(sparse).success).toBe(true);
  });
});
