import { useState } from 'react';
import { api } from '../providers/apiClient';

/**
 * Shown when the signed-in account's trial has ended and no subscription is
 * active (the API answers 402 for terminal routes). The account's data is
 * intact — this is a gate, not a deletion.
 */
export function PaywallScreen({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    setError(null);
    const res = await api.billingCheckout();
    if (res.ok && res.data) {
      window.location.href = res.data.url;
      return;
    }
    setError(!res.ok ? res.error.message : 'Checkout failed. Try again.');
    setBusy(false);
  }

  function signOut() {
    void api.authLogout().then(() => window.location.reload());
  }

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-200">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-sky-400">Tyche</span>
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">trial ended</span>
        </div>
        <p className="mb-1 text-xs text-zinc-400">
          Your free trial has ended. Upgrade to keep using the terminal — your workspaces, watchlists,
          alerts, and notes are all saved and waiting.
        </p>
        <p className="mb-4 text-[11px] text-zinc-500">Signed in as {email}</p>
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void upgrade()}
          className="w-full rounded bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/30 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Upgrade to Pro'}
        </button>
        <button type="button" onClick={signOut} className="mt-3 text-xs text-zinc-500 hover:text-zinc-300">
          Sign out
        </button>
        <p className="mt-4 text-[10px] leading-snug text-zinc-600">
          Tyche sells software and hosting — never market data. Live data stays bring-your-own-key, no
          investment advice is given, and no orders can be placed.
        </p>
      </div>
    </div>
  );
}
