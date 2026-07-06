import { useCallback, useEffect, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { EmptyState, ErrorState, LoadingState } from '@tyche/ui';
import { api, type AdminMetrics } from '../providers/apiClient';
import { useTerminalStore } from '../state/terminalStore';

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`font-mono text-lg ${accent ? 'text-emerald-300' : 'text-zinc-100'}`}>{value}</div>
    </div>
  );
}

/**
 * ADMIN — the founder dashboard (hosted mode, admin accounts): account counts,
 * trial funnel, MRR, a 14-day signups timeline, latest accounts, and — for
 * closed-signup team deployments — seat usage plus invite provisioning.
 */
export function AdminModule(_props: ModulePanelProps) {
  const appMode = useTerminalStore((s) => s.appMode);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.getAdminMetrics();
    if (res.ok && res.data) setMetrics(res.data);
    else if (!res.ok) setError(res.error);
  }, []);

  useEffect(() => {
    if (appMode !== 'hosted') return;
    void load();
  }, [appMode, load]);

  if (appMode !== 'hosted') {
    return <EmptyState message="The founder dashboard only exists in hosted mode (TYCHE_MODE=hosted)." />;
  }
  if (error?.kind === 'forbidden') {
    return <EmptyState message="Admin accounts only. Ask the deployment owner for access." />;
  }
  if (error) return <ErrorState message={error.message} />;
  if (!metrics) return <LoadingState label="Loading metrics…" />;

  const maxSignups = Math.max(1, ...metrics.signupsByDay.map((d) => d.count));
  const seatLabel = metrics.seats.limit === null ? `${metrics.seats.used} / ∞` : `${metrics.seats.used} / ${metrics.seats.limit}`;
  const seatsFull = metrics.seats.limit !== null && metrics.seats.used >= metrics.seats.limit;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy(true);
    setInviteMsg(null);
    const res = await api.adminInvite(email);
    setBusy(false);
    if (res.ok) {
      setInviteEmail('');
      setInviteMsg(`Invite sent to ${email}.`);
      void load();
    } else {
      setInviteMsg(!res.ok ? res.error.message : 'Could not send the invite.');
    }
  }

  async function revoke(email: string) {
    setBusy(true);
    await api.adminRevokeInvite(email);
    setBusy(false);
    void load();
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2 text-xs">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Stat label="Accounts" value={String(metrics.users)} />
        <Stat label="Active trials" value={String(metrics.activeTrials)} />
        <Stat label="Pro" value={String(metrics.pro)} />
        <Stat label="MRR" value={`$${metrics.mrr}`} accent />
      </div>
      <div className="flex flex-wrap gap-3 px-1 text-[11px] text-zinc-500">
        <span>
          Active today: <span className="text-sky-300">{metrics.activeToday}</span>
        </span>
        <span>
          This week: <span className="text-sky-300">{metrics.activeWeek}</span>
        </span>
        <span>
          Trials ending ≤3d: <span className="text-amber-300">{metrics.trialsEndingSoon}</span>
        </span>
        <span>
          Expired: <span className="text-zinc-300">{metrics.expired}</span>
        </span>
        <span>
          Seats: <span className={seatsFull ? 'text-amber-300' : 'text-sky-300'}>{seatLabel}</span>
        </span>
        <span>
          ${metrics.priceMonthly}/mo · {metrics.billingProvider} billing
        </span>
      </div>

      <div>
        <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-zinc-500">Signups — last 14 days</div>
        <div className="flex h-16 items-end gap-0.5 px-1" role="img" aria-label="Signups per day, last 14 days">
          {metrics.signupsByDay.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center" title={`${day.date}: ${day.count}`}>
              <div
                className={`w-full rounded-sm ${day.count > 0 ? 'bg-sky-500/60' : 'bg-zinc-800'}`}
                style={{ height: `${Math.max(6, (day.count / maxSignups) * 56)}px` }}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-zinc-500">
          Team — invite a seat {metrics.seats.limit !== null && `(${metrics.seats.used}/${metrics.seats.limit} used)`}
        </div>
        <form onSubmit={(e) => void invite(e)} className="flex gap-1.5 px-1">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@company.com"
            aria-label="Invite email"
            className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 focus:border-sky-500/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || seatsFull}
            title={seatsFull ? 'All seats are in use — revoke a pending invite or raise TYCHE_SEATS.' : undefined}
            className="shrink-0 rounded border border-sky-700 px-2 py-1 text-[11px] text-sky-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Invite
          </button>
        </form>
        {inviteMsg && <p className="mt-1 px-1 text-[10px] text-zinc-500">{inviteMsg}</p>}
        {metrics.pendingInvites.length > 0 && (
          <ul className="mt-1.5 px-1">
            {metrics.pendingInvites.map((inv) => (
              <li key={inv.email} className="flex items-center justify-between border-t border-zinc-900 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300" title={inv.email}>
                  {inv.email}
                </span>
                <span className="px-2 text-[10px] text-zinc-600">expires {inv.expiresAt.slice(0, 10)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revoke(inv.email)}
                  className="shrink-0 text-[10px] text-red-400/80 hover:text-red-300 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-zinc-500">Latest accounts</div>
        <table className="w-full text-left">
          <tbody>
            {metrics.latest.map((account) => (
              <tr key={account.email} className="border-t border-zinc-900">
                <td className="max-w-0 truncate px-1 py-1 font-mono text-[11px] text-zinc-300" title={account.email}>
                  {account.email}
                  {account.admin ? ' ★' : ''}
                </td>
                <td className="px-1 py-1 text-[11px] text-zinc-500">{account.createdAt.slice(0, 10)}</td>
                <td
                  className={`px-1 py-1 text-right text-[11px] ${
                    account.entitlement === 'pro'
                      ? 'text-emerald-300'
                      : account.entitlement === 'trial'
                        ? 'text-sky-300'
                        : 'text-zinc-500'
                  }`}
                >
                  {account.entitlement}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
