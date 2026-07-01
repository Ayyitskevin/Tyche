import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/** Subscription state; managed by the billing layer (mock or Stripe). */
export interface BillingState {
  plan: 'trial' | 'pro' | 'none';
  /** ISO datetime the free trial ends (set at signup). */
  trialEndsAt: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** ISO datetime the current paid period ends, when subscribed. */
  currentPeriodEnd?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  admin: boolean;
  /** Bumped to invalidate all outstanding session tokens (password change). */
  tokenEpoch: number;
  billing: BillingState;
  /** Last authenticated request, hour-granular (activity metrics). */
  lastSeenAt?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  admin: boolean;
  createdAt: string;
  billing: BillingState;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, admin: user.admin, createdAt: user.createdAt, billing: user.billing };
}

const TRIAL_DAYS = 14;

/**
 * Hosted-mode user registry: a small JSON document under the data dir (the
 * per-user terminal data lives in separate per-user stores). Passwords are
 * scrypt-hashed with per-user salts; writes are atomic (temp + rename).
 */
export class UserRegistry {
  private users: UserRecord[] = [];
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataDir: string,
    private readonly adminEmail: string | null = null,
  ) {
    this.file = join(dataDir, 'users.json');
  }

  async init(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as { users?: UserRecord[] };
      this.users = Array.isArray(parsed.users) ? parsed.users : [];
    } catch {
      this.users = [];
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify({ users: this.users }, null, 2);
    this.queue = this.queue.then(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      await rename(tmp, this.file);
    });
    return this.queue;
  }

  findByEmail(email: string): UserRecord | undefined {
    const needle = email.trim().toLowerCase();
    return this.users.find((u) => u.email === needle);
  }

  get(id: string): UserRecord | undefined {
    return this.users.find((u) => u.id === id);
  }

  list(): UserRecord[] {
    return [...this.users];
  }

  count(): number {
    return this.users.length;
  }

  async create(email: string, password: string): Promise<UserRecord> {
    const normalized = email.trim().toLowerCase();
    if (this.findByEmail(normalized)) throw new Error('email_taken');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scryptAsync(password, salt, 64)).toString('hex');
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: `u_${randomBytes(12).toString('hex')}`,
      email: normalized,
      passwordHash,
      salt,
      createdAt: now,
      // When a founder email is configured it is the ONLY registration that
      // gets admin — first-registrant fallback would let a stranger who beats
      // the operator to an exposed deployment own its dashboard. The
      // first-account rule applies only when no admin email is set.
      admin: this.adminEmail !== null ? normalized === this.adminEmail.toLowerCase() : this.users.length === 0,
      tokenEpoch: 1,
      billing: {
        plan: 'trial',
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
      },
    };
    this.users.push(user);
    await this.persist();
    return user;
  }

  async verify(email: string, password: string): Promise<UserRecord | null> {
    const user = this.findByEmail(email);
    if (!user) {
      // Burn the same scrypt cost for unknown emails so response timing does
      // not reveal whether an account exists.
      await scryptAsync(password, 'tyche-timing-equalizer', 64);
      return null;
    }
    const hash = await scryptAsync(password, user.salt, 64);
    const stored = Buffer.from(user.passwordHash, 'hex');
    if (hash.length !== stored.length || !timingSafeEqual(hash, stored)) return null;
    return user;
  }

  /** Merge a partial update onto a user (billing changes, admin flag) and persist. */
  async update(id: string, patch: Partial<Omit<UserRecord, 'id'>>): Promise<UserRecord | undefined> {
    const user = this.get(id);
    if (!user) return undefined;
    Object.assign(user, patch);
    await this.persist();
    return user;
  }

  /** Re-hash with a fresh salt and bump tokenEpoch so every old session dies. */
  async setPassword(id: string, password: string): Promise<UserRecord | undefined> {
    const user = this.get(id);
    if (!user) return undefined;
    user.salt = randomBytes(16).toString('hex');
    user.passwordHash = (await scryptAsync(password, user.salt, 64)).toString('hex');
    user.tokenEpoch += 1;
    await this.persist();
    return user;
  }

  /** Remove an account from the registry (its data dir is the caller's job). */
  async remove(id: string): Promise<boolean> {
    const before = this.users.length;
    this.users = this.users.filter((u) => u.id !== id);
    if (this.users.length === before) return false;
    await this.persist();
    return true;
  }

  /**
   * Stamp activity, throttled to once per hour per user so the registry file
   * isn't rewritten on every request. Fire-and-forget by design.
   */
  touch(id: string, at: string): void {
    const user = this.get(id);
    if (!user) return;
    if (user.lastSeenAt && Date.parse(at) - Date.parse(user.lastSeenAt) < 3_600_000) return;
    user.lastSeenAt = at;
    void this.persist();
  }
}
