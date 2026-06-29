import { describe, it, expect } from 'vitest';
import { AIContextPacketSchema } from './index';

const prov = {
  provider: 'mock',
  providerMode: 'mock' as const,
  capability: 'quotes',
  retrievedAt: '2026-06-28T13:45:00.000Z',
  freshness: { asOf: '2026-06-28T13:45:00.000Z', tier: 'mock' as const },
};

describe('contracts: AIContextPacket v2', () => {
  it('parses a v2 packet with panel summary/provenance, notes, and selection rows', () => {
    const r = AIContextPacketSchema.safeParse({
      activeSymbol: 'AAPL',
      activeAssetClass: 'equity',
      openPanels: [
        { moduleId: 'description', symbol: 'AAPL', title: 'AAPL · DES', summary: 'AAPL 187.40 (+1.2%)', provenance: prov },
      ],
      selection: { description: '2 quote rows', rows: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }] },
      recentCommands: ['AAPL DES'],
      watchlistSymbols: ['AAPL'],
      provenance: [prov],
      notes: [{ id: 'n1', title: 'Thesis', symbol: 'AAPL', excerpt: 'long-term hold thesis' }],
    });
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
  });

  it('still parses a sparse packet (all new fields optional)', () => {
    const r = AIContextPacketSchema.safeParse({ activeSymbol: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.openPanels).toEqual([]);
      expect(r.data.notes).toBeUndefined();
    }
  });
});
