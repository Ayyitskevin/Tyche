import { describe, it, expect } from 'vitest';
import { AIContextPacketSchema, type AIChatRequest, type AIContextPacket, type DataProvenance } from '@tyche/contracts';
import { generateMockAIResponse } from './copilot';

const prov: DataProvenance = {
  provider: 'mock',
  providerMode: 'mock',
  capability: 'quotes',
  retrievedAt: '2026-06-28T13:45:00.000Z',
  freshness: { asOf: '2026-06-28T13:45:00.000Z', tier: 'mock' },
};

function req(context: AIContextPacket, content = 'summarize what is on screen'): AIChatRequest {
  return { messages: [{ role: 'user', content }], context };
}

const empty = AIContextPacketSchema.parse({});

describe('generateMockAIResponse (v2 enrichment)', () => {
  it('summarizes panel data, surfaces notes, and cites provenance', () => {
    const context = AIContextPacketSchema.parse({
      activeSymbol: 'AAPL',
      activeAssetClass: 'equity',
      openPanels: [{ moduleId: 'description', symbol: 'AAPL', title: 'AAPL · DES', summary: 'AAPL 187.40 (+1.2%)', provenance: prov }],
      provenance: [prov],
      notes: [{ id: 'n1', title: 'AAPL thesis', symbol: 'AAPL', excerpt: 'hold' }],
    });
    const res = generateMockAIResponse(req(context));
    expect(res.message.content).toContain('AAPL 187.40 (+1.2%)');
    expect(res.message.content).toMatch(/Notes in scope: AAPL thesis/);
    expect(res.grounded).toBe(true);
    expect(res.citations.some((c) => c.capability === 'quotes')).toBe(true);
    expect(res.citations.some((c) => c.capability === 'notes')).toBe(true);
    expect(res.mode).toBe('mock');
  });

  it('still declines personalized advice', () => {
    const res = generateMockAIResponse(req(empty, 'should i buy AAPL?'));
    expect(res.message.content).toMatch(/can't provide personalized/i);
  });

  it('says it has nothing to ground on for a sparse packet', () => {
    const res = generateMockAIResponse(req(empty));
    expect(res.grounded).toBe(false);
    expect(res.message.content).toMatch(/nothing to ground/i);
  });
});
