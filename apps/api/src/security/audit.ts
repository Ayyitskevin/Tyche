/**
 * Audit-event interface. The foundation logs to stdout; the interface exists so
 * team/enterprise deployments can route audit events to a durable sink later
 * without changing call sites.
 */
export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  resource?: string;
  outcome: 'allow' | 'deny' | 'error';
  detail?: Record<string, unknown>;
}

export interface AuditSink {
  record(event: AuditEvent): void;
}

export class ConsoleAuditSink implements AuditSink {
  constructor(private readonly enabled = true) {}
  record(event: AuditEvent): void {
    if (!this.enabled) return;
    // Structured, single-line audit record.
    console.info(`[audit] ${JSON.stringify(event)}`);
  }
}

export function auditEvent(
  actor: string,
  action: string,
  outcome: AuditEvent['outcome'],
  extra: Partial<AuditEvent> = {},
): AuditEvent {
  return { at: new Date().toISOString(), actor, action, outcome, ...extra };
}
