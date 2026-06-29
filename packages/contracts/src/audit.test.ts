import { describe, it, expect } from 'vitest';
import { AuditEventSchema } from './audit';

const base = { at: '2026-06-29T12:00:00.000Z', actor: 'local', action: 'note.save', outcome: 'allow' };

describe('contracts: AuditEvent', () => {
  it('accepts a well-formed event with an optional resource/detail', () => {
    expect(AuditEventSchema.safeParse({ ...base, resource: 'n_1', detail: { count: 2 } }).success).toBe(true);
  });

  it('requires a valid outcome enum', () => {
    expect(AuditEventSchema.safeParse({ ...base, outcome: 'maybe' }).success).toBe(false);
  });

  it('rejects a non-datetime timestamp', () => {
    expect(AuditEventSchema.safeParse({ ...base, at: 'yesterday' }).success).toBe(false);
  });
});
