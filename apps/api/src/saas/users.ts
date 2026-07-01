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
      // The first account, or the configured founder email, becomes the admin.
      admin: this.users.length === 0 || (this.adminEmail !== null && normalized === this.adminEmail.toLowerCase()),
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
    if (!user) return null;
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
}
