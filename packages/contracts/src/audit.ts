import { z } from 'zod';
import { IsoDateTime } from './common';

/**
 * Audit events — an append-only record of mutating/sensitive actions, for
 * self-hosting operators who need an accountability trail. The foundation can
 * write these to stdout or a durable file sink; this contract is the shape the
 * API exposes for inspection.
 */
export const AuditOutcomeSchema = z.enum(['allow', 'deny', 'error']);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditEventSchema = z.object({
  at: IsoDateTime,
  actor: z.string(),
  action: z.string(),
  resource: z.string().optional(),
  outcome: AuditOutcomeSchema,
  detail: z.record(z.unknown()).optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
