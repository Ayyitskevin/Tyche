import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AuditEvent } from '@tyche/contracts';

export type { AuditEvent } from '@tyche/contracts';

/**
 * Audit sink. Records mutating/sensitive actions and exposes the most recent
 * events for operator inspection. The foundation ships a console sink and a
 * durable file sink (selectable via config) so a self-hoster can keep an
 * accountability trail without changing any call site.
 */
export interface AuditSink {
  record(event: AuditEvent): void;
  /** The most recent events, newest first (capped at the sink's buffer size). */
  recent(limit: number): AuditEvent[];
}

const DEFAULT_BUFFER = 500;

/** Bounded in-memory ring of the most recent events, shared by both sinks. */
class RingBuffer {
  private readonly events: AuditEvent[] = [];
  constructor(private readonly max = DEFAULT_BUFFER) {}
  push(event: AuditEvent): void {
    this.events.push(event);
    if (this.events.length > this.max) this.events.shift();
  }
  /** Seed the buffer (oldest → newest), keeping only the last `max`. */
  seed(events: AuditEvent[]): void {
    for (const e of events.slice(-this.max)) this.events.push(e);
  }
  recent(limit: number): AuditEvent[] {
    const n = Math.max(0, Math.min(limit, this.events.length));
    return this.events.slice(this.events.length - n).reverse();
  }
}

export class ConsoleAuditSink implements AuditSink {
  private readonly ring = new RingBuffer();
  constructor(private readonly enabled = true) {}
  record(event: AuditEvent): void {
    this.ring.push(event);
    if (this.enabled) console.info(`[audit] ${JSON.stringify(event)}`);
  }
  recent(limit: number): AuditEvent[] {
    return this.ring.recent(limit);
  }
}

/**
 * Durable audit sink: appends each event as a JSON line to a file and keeps an
 * in-memory ring for fast reads. Writes are serialized; a failed write is logged
 * but never throws into the request path (auditing must not break the action it
 * records). `init()` seeds the ring from the tail of an existing log.
 */
export class FileAuditSink implements AuditSink {
  private readonly ring = new RingBuffer();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly alsoConsole = false,
  ) {}

  async init(): Promise<void> {
    // Tail-loading is O(file size) — the whole log is read once at boot, then only
    // the last `max` lines are kept. Log rotation/retention is the operator's
    // responsibility (see SECURITY.md); an unbounded log spikes boot memory.
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const events: AuditEvent[] = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as AuditEvent);
        } catch {
          // Skip a malformed/partial line rather than fail startup.
        }
      }
      this.ring.seed(events);
    } catch {
      // No existing log yet — start clean.
    }
  }

  record(event: AuditEvent): void {
    this.ring.push(event);
    if (this.alsoConsole) console.info(`[audit] ${JSON.stringify(event)}`);
    const line = `${JSON.stringify(event)}\n`;
    this.queue = this.queue
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(this.filePath, line, 'utf8');
      })
      .catch((err) => {
        console.error(`[audit] failed to persist event: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  recent(limit: number): AuditEvent[] {
    return this.ring.recent(limit);
  }

  /** Resolve once all queued writes have been flushed (shutdown / tests). */
  flush(): Promise<void> {
    return this.queue;
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
