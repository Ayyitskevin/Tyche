import { describe, it, expect } from 'vitest';
import type { FastifyReply } from 'fastify';
import { createProviderRegistry } from '@tyche/data-adapters';
import { gapProvenance, serveCapability } from './helpers';

const registry = createProviderRegistry(); // mock-only

/** Minimal reply double capturing the status code and sent payload. */
function fakeReply() {
  const out: { code: number; payload: unknown } = { code: 200, payload: null };
  const reply = {
    code(c: number) {
      out.code = c;
      return reply;
    },
    send(p: unknown) {
      out.payload = p;
    },
  } as unknown as FastifyReply;
  return { reply, out };
}

describe('gapProvenance', () => {
  it('names the serving provider for a supported capability, tier unknown', () => {
    const p = gapProvenance(registry, 'quotes');
    expect(p.provider).toBe('mock');
    expect(p.providerMode).toBe('mock');
    expect(p.capability).toBe('quotes');
    expect(p.freshness.tier).toBe('unknown');
  });

  it('reports provider "none" (primary mode) for an unsupplied capability', () => {
    const p = gapProvenance(registry, 'bonds'); // mock does not supply bonds
    expect(p.provider).toBe('none');
    expect(p.providerMode).toBe('mock'); // falls back to the primary provider's mode
    expect(p.freshness.tier).toBe('unknown');
  });
});

describe('serveCapability', () => {
  it('attaches gap provenance (not null) on a capability gap', async () => {
    const { reply, out } = fakeReply();
    await serveCapability(reply, registry, 'bonds', async () => ({ data: [], provenance: null }));
    expect(out.code).toBe(200);
    const payload = out.payload as { error: { kind: string }; provenance: { provider: string; freshness: { tier: string } } };
    expect(payload.error.kind).toBe('capability_unavailable');
    expect(payload.provenance).not.toBeNull();
    expect(payload.provenance.provider).toBe('none');
    expect(payload.provenance.freshness.tier).toBe('unknown');
  });

  it('passes through the loader result on success', async () => {
    const { reply, out } = fakeReply();
    await serveCapability(reply, registry, 'quotes', async () => ({ data: { ok: true }, provenance: null }));
    expect(out.code).toBe(200);
    expect(out.payload).toEqual({ data: { ok: true }, provenance: null });
  });
});
