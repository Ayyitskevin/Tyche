import { useEffect, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { EmptyState, ErrorState, LoadingState } from '@tyche/ui';
import { api, type BillingSummary } from '../providers/apiClient';
import { useTerminalStore } from '../state/terminalStore';
import { intervalLabel, planLabel, statusLine } from './account';

function PasswordChange() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await api.authChangePassword(current, next);
    setBusy(false);
    if (res.ok) {
      setStatus('Password updated. Other sessions were signed out.');
      setCurrent('');
      setNext('');
    } else {
      setStatus(res.error.message);
    }
  }

  const field =
    'w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-100 focus:border-sky-500/40 focus:outline-none';

  return (
    <details className="rounded border border-zinc-900 px-2 py-1.5">
      <summary className="cursor-pointer text-[11px] text-zinc-400">Change password</summary>
      <form onSubmit={(e) => void submit(e)} className="mt-2 space-y-1.5">
        <input
          type="password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          aria-label="Current password"
          className={field}
        />
        <input
          type="password"
          required
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password (min 8 characters)"
          aria-label="New password"
          className={field}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
        {status && <p className="text-[11px] text-zinc-500">{status}</p>}
      </form>
    </details>
  );
}

function DeleteAccount() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await api.authDeleteAccount(password);
    if (res.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setStatus(res.error.message);
  }

  return (
    <details className="rounded border border-red-900/40 px-2 py-1.5">
      <summary className="cursor-pointer text-[11px] text-red-400/80">Delete account</summary>
      <form onSubmit={(e) => void submit(e)} className="mt-2 space-y-1.5">
        <p className="text-[10px] leading-snug text-zinc-500">
          Irreversible: your account and all of its data are removed. Export first if you want a copy.
        </p>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Confirm with your password"
          aria-label="Password to confirm deletion"
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-100 focus:border-red-500/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
        {status && <p className="text-[11px] text-zinc-500">{status}</p>}
      </form>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-zinc-900 px-1 py-1.5 first:border-t-0">
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="max-w-[60%] truncate font-mono text-xs text-zinc-200" title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * ACCOUNT — the hosted-mode account & billing panel: plan/trial status, the
 * upgrade path (checkout), self-serve billing management (portal), sign out.
 * In self-host mode it renders an explanatory empty state instead.
 */
export function AccountModule(_props: ModulePanelProps) {
  const appMode = useTerminalStore((s) => s.appMode);
  const user = useTerminalStore((s) => s.user);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [billingOff, setBillingOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (appMode !== 'hosted') return;
    let mounted = true;
    void api.getBilling().then((res) => {
      if (!mounted) return;
      if (res.ok && res.data) setBilling(res.data);
      else if (!res.ok && res.error.kind === 'billing_disabled') setBillingOff(true);
      else setError(!res.ok ? res.error.message : 'Failed to load billing status.');
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, [appMode]);

  if (appMode !== 'hosted') {
    return (
      <EmptyState message="Accounts are only used in hosted mode. This self-hosted terminal has no billing — everything is already yours." />
    );
  }
  if (error) return <ErrorState message={error} />;
  if (!loaded || !user) return <LoadingState label="Loading account…" />;

  async function upgrade(interval: 'month' | 'year') {
    setBusy(true);
    const res = await api.billingCheckout(interval);
    if (res.ok && res.data) {
      window.location.href = res.data.url;
      return;
    }
    setError(!res.ok ? res.error.message : 'Checkout failed.');
    setBusy(false);
  }

  async function managePortal() {
    setBusy(true);
    const res = await api.billingPortal();
    if (res.ok && res.data) {
      window.location.href = res.data.url;
      return;
    }
    setError(!res.ok ? res.error.message : 'Could not open the billing portal.');
    setBusy(false);
  }

  function signOut() {
    void api.authLogout().then(() => window.location.reload());
  }

  async function exportData() {
    setBusy(true);
    const res = await api.exportAccount();
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(!res.ok ? res.error.message : 'Export failed.');
      return;
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tyche-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const btn =
    'rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50';

  return (
    <div className="flex h-full flex-col gap-2 p-2 text-xs">
      <div>
        <Row label="Signed in as" value={user.email} />
        <Row label="Role" value={user.admin ? 'Admin' : 'Member'} />
        {billing && <Row label="Plan" value={planLabel(billing)} />}
        {billing && <Row label="Status" value={statusLine(billing)} />}
        {billing && billing.plan === 'pro' && billing.interval && (
          <Row label="Billing" value={intervalLabel(billing.interval)} />
        )}
        {billingOff && <Row label="Plan" value="Billing disabled on this deployment" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {billing && billing.plan !== 'pro' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void upgrade('month')}
            className={`${btn} border-sky-700 text-sky-300`}
          >
            Upgrade — Monthly
          </button>
        )}
        {billing && billing.plan !== 'pro' && billing.annualAvailable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void upgrade('year')}
            className={`${btn} border-sky-700 text-sky-300`}
            title="Annual billing — 2 months free vs monthly"
          >
            Upgrade — Annual (2 months free)
          </button>
        )}
        {billing && billing.plan === 'pro' && (
          <button type="button" disabled={busy} onClick={() => void managePortal()} className={btn}>
            Manage billing
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void exportData()} className={btn}>
          Export my data
        </button>
        <button type="button" onClick={signOut} className={btn}>
          Sign out
        </button>
      </div>
      <PasswordChange />
      <DeleteAccount />
      <p className="mt-auto text-[10px] leading-snug text-zinc-600">
        Tyche sells software and hosting — never market data. Live data sources stay bring-your-own-key,
        no investment advice is given, and no orders can be placed.
      </p>
    </div>
  );
}
