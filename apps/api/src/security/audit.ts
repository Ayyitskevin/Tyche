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

/** Minimal fetch surface for the HTTP sink, injectable so tests need no network. */
export type AuditFetch = (input: string, init: RequestInit) => Promise<Response>;

/** A slow endpoint must not pin a delivery open forever. */
const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * External-SIEM audit sink: POSTs each event as JSON to an operator-provided
 * webhook (a SIEM/HTTP log collector, or a thin relay), while keeping the same
 * in-memory ring for `recent()`. Delivery is fire-and-forget with a timeout; a
 * failed, non-2xx, or slow endpoint is logged but NEVER throws into the request
 * path — auditing must not break the action it records. `flush()` awaits the
 * in-flight deliveries so a graceful shutdown doesn't strand the last events.
 */
export class HttpAuditSink implements AuditSink {
  private readonly ring = new RingBuffer();
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    private readonly url: string,
    private readonly token: string | null = null,
    private readonly alsoConsole = false,
    private readonly fetchImpl: AuditFetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = WEBHOOK_TIMEOUT_MS,
  ) {}

  record(event: AuditEvent): void {
    this.ring.push(event);
    if (this.alsoConsole) console.info(`[audit] ${JSON.stringify(event)}`);
    const task = this.post(event)
      .catch((err) => {
        console.error(`[audit] failed to deliver event to the webhook: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        this.inflight.delete(task);
      });
    this.inflight.add(task);
  }

  private async post(event: AuditEvent): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`audit webhook responded ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }

  recent(limit: number): AuditEvent[] {
    return this.ring.recent(limit);
  }

  /** Resolve once all in-flight deliveries have settled (shutdown / tests). */
  async flush(): Promise<void> {
    await Promise.allSettled([...this.inflight]);
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
