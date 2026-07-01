import { useEffect, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { EmptyState, ErrorState, LoadingState } from '@tyche/ui';
import { api, type BillingSummary } from '../providers/apiClient';
import { useTerminalStore } from '../state/terminalStore';
import { planLabel, statusLine } from './account';

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

  async function upgrade() {
    setBusy(true);
    const res = await api.billingCheckout();
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

  const btn =
    'rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50';

  return (
    <div className="flex h-full flex-col gap-2 p-2 text-xs">
      <div>
        <Row label="Signed in as" value={user.email} />
        <Row label="Role" value={user.admin ? 'Admin' : 'Member'} />
        {billing && <Row label="Plan" value={planLabel(billing)} />}
        {billing && <Row label="Status" value={statusLine(billing)} />}
        {billingOff && <Row label="Plan" value="Billing disabled on this deployment" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {billing && billing.plan !== 'pro' && (
          <button type="button" disabled={busy} onClick={() => void upgrade()} className={`${btn} border-sky-700 text-sky-300`}>
            Upgrade to Pro
          </button>
        )}
        {billing && billing.plan === 'pro' && (
          <button type="button" disabled={busy} onClick={() => void managePortal()} className={btn}>
            Manage billing
          </button>
        )}
        <button type="button" onClick={signOut} className={btn}>
          Sign out
        </button>
      </div>
      <p className="mt-auto text-[10px] leading-snug text-zinc-600">
        Tyche sells software and hosting — never market data. Live data sources stay bring-your-own-key,
        no investment advice is given, and no orders can be placed.
      </p>
    </div>
  );
}
