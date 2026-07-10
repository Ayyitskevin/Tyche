import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
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
  /** Billing cadence of the active subscription: monthly or annual. */
  interval?: 'month' | 'year';
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
  /** sha256 of the outstanding single-use password-reset token (raw token only ever emailed). */
  resetTokenHash?: string;
  /** ISO expiry of the outstanding reset token; a used/expired token is cleared. */
  resetTokenExpiresAt?: string;
  /** True once the account's email address has been confirmed via the emailed link. */
  emailVerified?: boolean;
  /** sha256 of the outstanding single-use email-verification token. */
  verifyTokenHash?: string;
  /** ISO expiry of the outstanding verification token; a used/expired token is cleared. */
  verifyTokenExpiresAt?: string;
  /** ISO datetime the day-11 "trial ending" retention email was sent (one-shot). */
  trialEndingEmailSentAt?: string;
  /** ISO datetime the "welcome back" re-engagement email was sent (one-shot). */
  welcomeBackEmailSentAt?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  admin: boolean;
  createdAt: string;
  billing: BillingState;
  /** Absent on pre-verification records; the client treats undefined as unverified. */
  emailVerified: boolean;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    admin: user.admin,
    createdAt: user.createdAt,
    billing: user.billing,
    emailVerified: user.emailVerified === true,
  };
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
  // Emails claimed by an in-flight create() but not yet pushed (the record only
  // exists after the scrypt await). Consulted alongside findByEmail so two
  // concurrent signups for the same address can't both slip past the uniqueness
  // check while parked on the hash and create duplicate accounts.
  private readonly reserving = new Set<string>();

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

  /**
   * Drain all pending writes (e.g. the fire-and-forget persist behind an
   * off-response-path verification/reset email). Called on graceful shutdown so
   * on-disk state is settled before the process exits.
   */
  async flush(): Promise<void> {
    await this.queue;
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
    // Claim the email SYNCHRONOUSLY (before the scrypt await yields the loop),
    // so a racing create() for the same address loses the check-and-insert race.
    if (this.findByEmail(normalized) || this.reserving.has(normalized)) throw new Error('email_taken');
    this.reserving.add(normalized);
    try {
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
    } finally {
      this.reserving.delete(normalized);
    }
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
  private async applyNewPassword(user: UserRecord, password: string): Promise<void> {
    user.salt = randomBytes(16).toString('hex');
    user.passwordHash = (await scryptAsync(password, user.salt, 64)).toString('hex');
    user.tokenEpoch += 1;
    // Any pending reset link is void once the password changes by any path.
    delete user.resetTokenHash;
    delete user.resetTokenExpiresAt;
  }

  /** Re-hash with a fresh salt and bump tokenEpoch so every old session dies. */
  async setPassword(id: string, password: string): Promise<UserRecord | undefined> {
    const user = this.get(id);
    if (!user) return undefined;
    await this.applyNewPassword(user, password);
    await this.persist();
    return user;
  }

  /**
   * Issue a single-use password-reset token for an email, if an account exists.
   * Returns the RAW token (emailed to the user; only its sha256 is stored) or
   * null when no account matches — the caller responds 200 either way so the
   * endpoint can't be used to enumerate accounts. A high-entropy random token
   * needs only a fast hash at rest (unlike a low-entropy password → scrypt).
   */
  async issueResetToken(email: string, ttlMs = 3_600_000): Promise<string | null> {
    const user = this.findByEmail(email);
    if (!user) return null;
    const token = randomBytes(32).toString('hex');
    user.resetTokenHash = createHash('sha256').update(token).digest('hex');
    user.resetTokenExpiresAt = new Date(Date.now() + ttlMs).toISOString();
    await this.persist();
    return token;
  }

  /**
   * Consume a reset token: set the new password (fresh salt + tokenEpoch bump,
   * killing every session) and clear the token so it cannot be reused. Returns
   * the updated user, or null if the token is unknown or expired.
   */
  async resetPassword(token: string, password: string): Promise<UserRecord | null> {
    const presented = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
    const now = Date.now();
    const user = this.users.find((u) => {
      if (!u.resetTokenHash || !u.resetTokenExpiresAt) return false;
      if (Date.parse(u.resetTokenExpiresAt) <= now) return false;
      const stored = Buffer.from(u.resetTokenHash, 'hex');
      return stored.length === presented.length && timingSafeEqual(stored, presented);
    });
    if (!user) return null;
    // Claim the token SYNCHRONOUSLY, before the scrypt await in applyNewPassword.
    // Node is single-threaded, so this check-and-clear is atomic: a second
    // concurrent confirm with the same token now fails the find above (single
    // use), and only one of the racing calls bumps tokenEpoch.
    delete user.resetTokenHash;
    delete user.resetTokenExpiresAt;
    await this.applyNewPassword(user, password);
    await this.persist();
    return user;
  }

  /**
   * Issue a single-use email-verification token for a user id (at registration,
   * or on resend). Same posture as reset tokens: 256-bit random, only the
   * sha256 stored, raw token only ever emailed. Default TTL 24h — a signup
   * link lives longer than a security-sensitive reset link.
   */
  async issueVerifyToken(id: string, ttlMs = 24 * 3_600_000): Promise<string | null> {
    const user = this.get(id);
    if (!user || user.emailVerified === true) return null;
    const token = randomBytes(32).toString('hex');
    user.verifyTokenHash = createHash('sha256').update(token).digest('hex');
    user.verifyTokenExpiresAt = new Date(Date.now() + ttlMs).toISOString();
    await this.persist();
    return token;
  }

  /**
   * Consume a verification token: mark the email verified and clear the token
   * (single-use; claimed synchronously — no await between match and clear).
   * Returns the updated user, or null if the token is unknown or expired.
   * Deliberately does NOT bump tokenEpoch: verifying an address is not a
   * credential change and must not sign the user out anywhere.
   */
  async verifyEmail(token: string): Promise<UserRecord | null> {
    const presented = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
    const now = Date.now();
    const user = this.users.find((u) => {
      if (!u.verifyTokenHash || !u.verifyTokenExpiresAt) return false;
      if (Date.parse(u.verifyTokenExpiresAt) <= now) return false;
      const stored = Buffer.from(u.verifyTokenHash, 'hex');
      return stored.length === presented.length && timingSafeEqual(stored, presented);
    });
    if (!user) return null;
    delete user.verifyTokenHash;
    delete user.verifyTokenExpiresAt;
    user.emailVerified = true;
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
