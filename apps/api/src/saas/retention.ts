import type { AuditSink } from '../security/audit';
import { entitlement, trialDaysLeft } from './billing';
import type { EmailSender, OutboundEmail } from './email';
import type { UserRecord } from './users';

/**
 * Lifecycle retention emails, hosted mode. Two one-shot campaigns:
 *
 *  - **trial ending** — a nudge in the last few days of the free trial (the
 *    LAUNCH Week-3 "first paying customers" lever), and
 *  - **welcome back** — a gentle re-engagement for a trialer who signed up but
 *    hasn't returned (the Week-2 "day-2 return" goal).
 *
 * Selection is pure (below) so the windows, plan gating and idempotency are
 * unit-testable without a clock or a mailer. The runner sends via the pluggable
 * `EmailSender` and stamps a persisted marker on the user record AFTER a
 * successful send, so a restart never re-sends and a delivery failure is retried
 * next tick. Every send (and every failure) is audited.
 *
 * Copy stays within Tyche's guardrails: research-only, bring-your-own-data — no
 * advice, no orders.
 */

const DAY_MS = 86_400_000;

export interface RetentionOptions {
  /** App base URL (no trailing slash) for links in the mail body. */
  appBaseUrl: string;
  /** Send the trial-ending mail when the trial has this many days left (or fewer). */
  trialEndingLeadDays: number;
  /** Send welcome-back once a trialer has been unseen for at least this many days. */
  welcomeBackInactiveDays: number;
}

/** Defaults: warn ~3 days out (day 11 of a 14-day trial); re-engage after 2 quiet days. */
export const DEFAULT_RETENTION_OPTIONS: Omit<RetentionOptions, 'appBaseUrl'> = {
  trialEndingLeadDays: 3,
  welcomeBackInactiveDays: 2,
};

/** The one-shot marker field a send stamps so it never repeats. */
export type RetentionMarker = 'trialEndingEmailSentAt' | 'welcomeBackEmailSentAt';

export interface DueEmail {
  userId: string;
  email: OutboundEmail;
  marker: RetentionMarker;
  /** Audit action name for this campaign. */
  action: string;
}

/**
 * Accounts due the "trial ending" mail: still on an active trial, inside the
 * lead window, and not already sent. `plan !== 'trial'` (already paid) and an
 * already-expired trial are both excluded — this is a pre-expiry nudge.
 */
export function dueTrialEndingEmails(
  users: readonly UserRecord[],
  nowMs: number,
  opts: RetentionOptions,
): DueEmail[] {
  const out: DueEmail[] = [];
  for (const u of users) {
    if (u.trialEndingEmailSentAt) continue; // one-shot
    if (u.billing.plan !== 'trial') continue; // already paid, or no trial
    if (entitlement(u.billing, nowMs) !== 'trial') continue; // still-active trials only
    const daysLeft = trialDaysLeft(u.billing, nowMs);
    if (daysLeft <= 0 || daysLeft > opts.trialEndingLeadDays) continue; // inside the window
    const days = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    out.push({
      userId: u.id,
      marker: 'trialEndingEmailSentAt',
      action: 'retention.trial_ending',
      email: {
        to: u.email,
        subject: `Your Tyche trial ends in ${days}`,
        text:
          `Your Tyche free trial ends in ${days}.\n\n` +
          `Upgrade to stay on the Pro tier and keep your saved workspaces, alerts and ` +
          `notes when the trial closes:\n\n` +
          `${opts.appBaseUrl}/\n\n` +
          `Open the terminal and run ACCOUNT to manage your plan. Tyche is a research ` +
          `terminal — it never places orders or gives advice, and your data exports ` +
          `anytime, even after the trial ends.`,
      },
    });
  }
  return out;
}

/**
 * Trialers due the "welcome back" mail: signed up, on an active trial, unseen
 * for at least the inactivity window, and not already sent. Uses `lastSeenAt`
 * (falling back to `createdAt` for an account that never made an authed
 * request). Expired/paid accounts are out of scope for this nudge.
 */
export function dueWelcomeBackEmails(
  users: readonly UserRecord[],
  nowMs: number,
  opts: RetentionOptions,
): DueEmail[] {
  const out: DueEmail[] = [];
  const cutoffMs = opts.welcomeBackInactiveDays * DAY_MS;
  for (const u of users) {
    if (u.welcomeBackEmailSentAt) continue; // one-shot
    if (u.billing.plan !== 'trial') continue; // focus the day-2 nudge on trialers
    if (entitlement(u.billing, nowMs) !== 'trial') continue; // not an already-lapsed account
    const lastSeenMs = Date.parse(u.lastSeenAt ?? u.createdAt);
    if (!Number.isFinite(lastSeenMs)) continue; // unparseable timestamp — skip, don't guess
    if (nowMs - lastSeenMs < cutoffMs) continue; // still active/recent
    out.push({
      userId: u.id,
      marker: 'welcomeBackEmailSentAt',
      action: 'retention.welcome_back',
      email: {
        to: u.email,
        subject: 'Your Tyche workspace is waiting',
        text:
          `You started a Tyche trial but haven't been back in a couple of days — your ` +
          `workspace is right where you left it:\n\n` +
          `${opts.appBaseUrl}/\n\n` +
          `New here? Press Cmd/Ctrl-K and run TOUR for the 30-second tour, or HELP to ` +
          `browse every command. Tyche is a research terminal — use the keyless data ` +
          `sources or bring your own keys; there's nothing to install.`,
      },
    });
  }
  return out;
}

/** Structural slice of the user registry the runner needs (keeps it test-friendly). */
export interface RetentionUserStore {
  list(): UserRecord[];
  update(id: string, patch: Partial<Omit<UserRecord, 'id'>>): Promise<UserRecord | undefined>;
}

export interface RetentionTickDeps {
  users: RetentionUserStore;
  email: EmailSender;
  audit: AuditSink;
  options: RetentionOptions;
  /** Injectable clock for tests; defaults to the wall clock. */
  now?: () => number;
}

export interface RetentionTickResult {
  due: number;
  sent: number;
  failed: number;
}

/**
 * One retention pass: gather every due email across both campaigns, send each,
 * and (on success) stamp its one-shot marker + audit it. A send that throws is
 * counted, audited as an error, and left unstamped so the next tick retries it.
 */
export async function runRetentionTick(deps: RetentionTickDeps): Promise<RetentionTickResult> {
  const nowMs = (deps.now ?? Date.now)();
  const users = deps.users.list();
  const due = [
    ...dueTrialEndingEmails(users, nowMs, deps.options),
    ...dueWelcomeBackEmails(users, nowMs, deps.options),
  ];
  let sent = 0;
  let failed = 0;
  for (const item of due) {
    const at = new Date(nowMs).toISOString();
    try {
      await deps.email.send(item.email);
      // Stamp only AFTER a successful send: a delivery failure must be retried,
      // not silently marked done.
      const patch: Partial<UserRecord> =
        item.marker === 'trialEndingEmailSentAt'
          ? { trialEndingEmailSentAt: at }
          : { welcomeBackEmailSentAt: at };
      await deps.users.update(item.userId, patch);
      deps.audit.record({
        at,
        actor: 'system:retention',
        action: item.action,
        resource: item.userId,
        outcome: 'allow',
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      deps.audit.record({
        at,
        actor: 'system:retention',
        action: item.action,
        resource: item.userId,
        outcome: 'error',
        detail: { reason: err instanceof Error ? err.message : 'delivery_failed' },
      });
    }
  }
  return { due: due.length, sent, failed };
}
