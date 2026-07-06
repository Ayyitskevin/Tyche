import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A pending seat invitation: an emailed, single-use token that lets one person join. */
export interface InviteRecord {
  /** Normalized (lowercase) invited email. */
  email: string;
  /** sha256 of the raw invite token; the raw token is only ever emailed. */
  tokenHash: string;
  createdAt: string;
  /** ISO expiry; an expired invite is pruned and cannot be accepted. */
  expiresAt: string;
  /** Admin email that issued the invite (audit trail). */
  createdBy: string;
}

/** Public shape of a pending invite for the admin dashboard (no token material). */
export interface PendingInvite {
  email: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * A seat is consumed either by an existing account OR by an outstanding invite,
 * so provisioning can't oversubscribe a closed instance between "invite sent"
 * and "invite accepted". `limit === null` means unlimited (the default).
 */
export function seatsUsed(userCount: number, pendingInvites: number): number {
  return userCount + pendingInvites;
}

export function seatAvailable(limit: number | null, userCount: number, pendingInvites: number): boolean {
  return limit === null || seatsUsed(userCount, pendingInvites) < limit;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hosted-mode invite registry: a small JSON document under the data dir, atomic
 * writes (temp + rename), mirroring `UserRegistry`. Only invite-token *hashes*
 * are stored; the raw token is emailed and never persisted. Expired invites are
 * pruned on load and whenever the pending set is read, so they free their seat.
 */
export class InviteRegistry {
  private invites: InviteRecord[] = [];
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string) {
    this.file = join(dataDir, 'invites.json');
  }

  async init(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as { invites?: InviteRecord[] };
      this.invites = Array.isArray(parsed.invites) ? parsed.invites : [];
    } catch {
      this.invites = [];
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify({ invites: this.invites }, null, 2);
    this.queue = this.queue.then(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      await rename(tmp, this.file);
    });
    return this.queue;
  }

  async flush(): Promise<void> {
    await this.queue;
  }

  /** Drop expired invites; returns whether anything changed. */
  private prune(nowMs: number): boolean {
    const before = this.invites.length;
    this.invites = this.invites.filter((i) => Date.parse(i.expiresAt) > nowMs);
    return this.invites.length !== before;
  }

  /** Count of outstanding (non-expired) invites. */
  pendingCount(nowMs = Date.now()): number {
    if (this.prune(nowMs)) void this.persist();
    return this.invites.length;
  }

  /** Pending invites for the admin dashboard (newest first), token material stripped. */
  listPending(nowMs = Date.now()): PendingInvite[] {
    if (this.prune(nowMs)) void this.persist();
    return [...this.invites]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ email, createdAt, expiresAt }) => ({ email, createdAt, expiresAt }));
  }

  /**
   * Issue (or replace) an invite for an email and return the RAW token (emailed;
   * only its hash is stored). Re-inviting the same address supersedes the prior
   * invite rather than consuming a second seat.
   */
  async issue(email: string, createdBy: string, ttlMs = DEFAULT_TTL_MS, nowMs = Date.now()): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const token = randomBytes(32).toString('hex');
    const record: InviteRecord = {
      email: normalized,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlMs).toISOString(),
      createdBy,
    };
    this.invites = this.invites.filter((i) => i.email !== normalized);
    this.invites.push(record);
    await this.persist();
    return token;
  }

  /**
   * Consume a raw invite token: return the matched (non-expired) invite and
   * delete it (single use), or null if unknown/expired. Claimed synchronously
   * so a concurrent second accept can't match the same token.
   */
  async consume(token: string, nowMs = Date.now()): Promise<InviteRecord | null> {
    const presented = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
    const idx = this.invites.findIndex((i) => {
      if (Date.parse(i.expiresAt) <= nowMs) return false;
      const stored = Buffer.from(i.tokenHash, 'hex');
      return stored.length === presented.length && timingSafeEqual(stored, presented);
    });
    if (idx === -1) return null;
    const [record] = this.invites.splice(idx, 1);
    await this.persist();
    return record ?? null;
  }

  /** Revoke a pending invite by email; returns whether one was removed. */
  async revoke(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const before = this.invites.length;
    this.invites = this.invites.filter((i) => i.email !== normalized);
    if (this.invites.length === before) return false;
    await this.persist();
    return true;
  }

  /** Whether an outstanding invite exists for an email. */
  hasPending(email: string, nowMs = Date.now()): boolean {
    const normalized = email.trim().toLowerCase();
    return this.invites.some((i) => i.email === normalized && Date.parse(i.expiresAt) > nowMs);
  }
}
