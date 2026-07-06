import type { BillingSummary } from '../providers/apiClient';

/** Days until an ISO datetime, ceiling'd, never negative. */
export function daysUntil(iso: string, nowMs: number): number {
  const ms = Date.parse(iso) - nowMs;
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

/** Human plan line for the ACCOUNT panel and the header chip. */
export function planLabel(summary: Pick<BillingSummary, 'plan' | 'entitlement' | 'trialDaysLeft'>): string {
  if (summary.plan === 'pro') return 'Pro';
  if (summary.entitlement === 'trial') {
    return summary.trialDaysLeft === 1 ? 'Trial — last day' : `Trial — ${summary.trialDaysLeft} days left`;
  }
  return 'Trial ended';
}

/** Secondary status line: renewal date for pro, end date otherwise. */
export function statusLine(summary: Pick<BillingSummary, 'plan' | 'trialEndsAt' | 'currentPeriodEnd'>): string {
  if (summary.plan === 'pro' && summary.currentPeriodEnd) {
    return `Renews ${summary.currentPeriodEnd.slice(0, 10)}`;
  }
  if (summary.plan === 'pro') return 'Active subscription';
  return `Trial ends ${summary.trialEndsAt.slice(0, 10)}`;
}

/** Human label for a billing cadence, for the ACCOUNT "Billing" row. */
export function intervalLabel(interval: BillingSummary['interval']): string {
  if (interval === 'year') return 'Annual';
  if (interval === 'month') return 'Monthly';
  return '—';
}
