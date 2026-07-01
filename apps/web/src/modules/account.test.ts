import { describe, it, expect } from 'vitest';
import { daysUntil, planLabel, statusLine } from './account';

const DAY = 86_400_000;

describe('account helpers', () => {
  it('daysUntil ceils partial days and clamps the past to zero', () => {
    const now = Date.parse('2026-07-01T12:00:00Z');
    expect(daysUntil(new Date(now + 4.2 * DAY).toISOString(), now)).toBe(5);
    expect(daysUntil(new Date(now + 0.1 * DAY).toISOString(), now)).toBe(1);
    expect(daysUntil(new Date(now - DAY).toISOString(), now)).toBe(0);
  });

  it('labels trial, last day, expiry, and pro', () => {
    expect(planLabel({ plan: 'trial', entitlement: 'trial', trialDaysLeft: 9 })).toBe('Trial — 9 days left');
    expect(planLabel({ plan: 'trial', entitlement: 'trial', trialDaysLeft: 1 })).toBe('Trial — last day');
    expect(planLabel({ plan: 'trial', entitlement: 'expired', trialDaysLeft: 0 })).toBe('Trial ended');
    expect(planLabel({ plan: 'none', entitlement: 'expired', trialDaysLeft: 0 })).toBe('Trial ended');
    expect(planLabel({ plan: 'pro', entitlement: 'pro', trialDaysLeft: 0 })).toBe('Pro');
  });

  it('status line prefers the renewal date for pro plans', () => {
    expect(
      statusLine({ plan: 'pro', trialEndsAt: '2026-07-10T00:00:00Z', currentPeriodEnd: '2026-08-01T00:00:00Z' }),
    ).toBe('Renews 2026-08-01');
    expect(statusLine({ plan: 'pro', trialEndsAt: '2026-07-10T00:00:00Z', currentPeriodEnd: null })).toBe(
      'Active subscription',
    );
    expect(statusLine({ plan: 'trial', trialEndsAt: '2026-07-10T00:00:00Z', currentPeriodEnd: null })).toBe(
      'Trial ends 2026-07-10',
    );
  });
});
