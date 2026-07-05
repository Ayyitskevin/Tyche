import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditSink } from '../security/audit';
import type { EmailSender, OutboundEmail } from './email';
import {
  DEFAULT_RETENTION_OPTIONS,
  dueTrialEndingEmails,
  dueWelcomeBackEmails,
  type RetentionOptions,
  runRetentionTick,
  type RetentionUserStore,
} from './retention';
import type { UserRecord } from './users';

const NOW = Date.parse('2026-07-05T12:00:00.000Z');
const DAY = 86_400_000;
const iso = (offsetDays: number): string => new Date(NOW + offsetDays * DAY).toISOString();

const OPTIONS: RetentionOptions = { appBaseUrl: 'https://tyche.test', ...DEFAULT_RETENTION_OPTIONS };

function user(overrides: Partial<UserRecord> & { id: string }): UserRecord {
  return {
    email: `${overrides.id}@example.com`,
    passwordHash: 'x',
    salt: 'x',
    createdAt: iso(-14),
    admin: false,
    tokenEpoch: 1,
    billing: { plan: 'trial', trialEndsAt: iso(2) },
    ...overrides,
  };
}

describe('dueTrialEndingEmails', () => {
  it('selects an active trialer inside the lead window, once', () => {
    const due = dueTrialEndingEmails([user({ id: 'a', billing: { plan: 'trial', trialEndsAt: iso(2) } })], NOW, OPTIONS);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ userId: 'a', marker: 'trialEndingEmailSentAt', action: 'retention.trial_ending' });
    expect(due[0]?.email.to).toBe('a@example.com');
    expect(due[0]?.email.subject).toContain('2 days');
    expect(due[0]?.email.text).toContain('https://tyche.test/');
  });

  it('excludes accounts already sent, paid, expired, or outside the window', () => {
    const users = [
      user({ id: 'sent', billing: { plan: 'trial', trialEndsAt: iso(2) }, trialEndingEmailSentAt: iso(-1) }),
      user({ id: 'paid', billing: { plan: 'pro', trialEndsAt: iso(2) } }),
      user({ id: 'expired', billing: { plan: 'trial', trialEndsAt: iso(-1) } }),
      user({ id: 'early', billing: { plan: 'trial', trialEndsAt: iso(5) } }), // 5 days > 3-day lead
    ];
    expect(dueTrialEndingEmails(users, NOW, OPTIONS)).toEqual([]);
  });

  it('singularizes the copy at exactly one day left', () => {
    const due = dueTrialEndingEmails([user({ id: 'a', billing: { plan: 'trial', trialEndsAt: iso(1) } })], NOW, OPTIONS);
    expect(due[0]?.email.subject).toBe('Your Tyche trial ends in 1 day');
  });
});

describe('dueWelcomeBackEmails', () => {
  it('selects a trialer unseen past the inactivity window', () => {
    const due = dueWelcomeBackEmails(
      [user({ id: 'a', billing: { plan: 'trial', trialEndsAt: iso(10) }, lastSeenAt: iso(-3) })],
      NOW,
      OPTIONS,
    );
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ userId: 'a', marker: 'welcomeBackEmailSentAt', action: 'retention.welcome_back' });
  });

  it('falls back to createdAt when the account never made an authed request', () => {
    const due = dueWelcomeBackEmails(
      [user({ id: 'a', billing: { plan: 'trial', trialEndsAt: iso(10) }, createdAt: iso(-3), lastSeenAt: undefined })],
      NOW,
      OPTIONS,
    );
    expect(due).toHaveLength(1);
  });

  it('excludes recently-active, already-sent, and expired accounts', () => {
    const users = [
      user({ id: 'active', billing: { plan: 'trial', trialEndsAt: iso(10) }, lastSeenAt: new Date(NOW - 3600_000).toISOString() }),
      user({ id: 'sent', billing: { plan: 'trial', trialEndsAt: iso(10) }, lastSeenAt: iso(-3), welcomeBackEmailSentAt: iso(-1) }),
      user({ id: 'expired', billing: { plan: 'trial', trialEndsAt: iso(-1) }, lastSeenAt: iso(-3) }),
    ];
    expect(dueWelcomeBackEmails(users, NOW, OPTIONS)).toEqual([]);
  });
});

// --- runner test doubles -------------------------------------------------

function makeStore(users: UserRecord[]): RetentionUserStore & { updateCalls: number } {
  const store = {
    updateCalls: 0,
    list(): UserRecord[] {
      return users.map((u) => ({ ...u }));
    },
    async update(id: string, patch: Partial<Omit<UserRecord, 'id'>>): Promise<UserRecord | undefined> {
      store.updateCalls += 1;
      const u = users.find((x) => x.id === id);
      if (!u) return undefined;
      Object.assign(u, patch);
      return u;
    },
  };
  return store;
}

function makeSender(fail = false): EmailSender & { sent: OutboundEmail[] } {
  const sent: OutboundEmail[] = [];
  return {
    name: 'http',
    sent,
    async send(email: OutboundEmail): Promise<void> {
      if (fail) throw new Error('smtp down');
      sent.push(email);
    },
  };
}

function makeAudit(): AuditSink & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    record(event: AuditEvent): void {
      events.push(event);
    },
    recent(limit: number): AuditEvent[] {
      return events.slice(-limit).reverse();
    },
  };
}

describe('runRetentionTick', () => {
  it('sends, stamps the marker, audits, and is idempotent across ticks', async () => {
    // Recent lastSeenAt so only the trial-ending campaign is due (not welcome-back).
    const users = [
      user({ id: 'a', billing: { plan: 'trial', trialEndsAt: iso(2) }, lastSeenAt: new Date(NOW - 3600_000).toISOString() }),
    ];
    const store = makeStore(users);
    const email = makeSender();
    const audit = makeAudit();
    const deps = { users: store, email, audit, options: OPTIONS, now: () => NOW };

    const first = await runRetentionTick(deps);
    expect(first).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(email.sent).toHaveLength(1);
    expect(users[0]?.trialEndingEmailSentAt).toBe(new Date(NOW).toISOString());
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ actor: 'system:retention', action: 'retention.trial_ending', outcome: 'allow' });

    // Second pass: the persisted marker means nothing is due — no re-send.
    const second = await runRetentionTick(deps);
    expect(second).toEqual({ due: 0, sent: 0, failed: 0 });
    expect(email.sent).toHaveLength(1);
  });

  it('does not stamp (so it retries) when delivery fails, and audits the error', async () => {
    // Recent lastSeenAt so only the trial-ending campaign is due (not welcome-back).
    const users = [
      user({ id: 'a', billing: { plan: 'trial', trialEndsAt: iso(2) }, lastSeenAt: new Date(NOW - 3600_000).toISOString() }),
    ];
    const store = makeStore(users);
    const email = makeSender(true);
    const audit = makeAudit();

    const result = await runRetentionTick({ users: store, email, audit, options: OPTIONS, now: () => NOW });
    expect(result).toEqual({ due: 1, sent: 0, failed: 1 });
    expect(store.updateCalls).toBe(0);
    expect(users[0]?.trialEndingEmailSentAt).toBeUndefined();
    expect(audit.events[0]).toMatchObject({ action: 'retention.trial_ending', outcome: 'error' });
  });
});
