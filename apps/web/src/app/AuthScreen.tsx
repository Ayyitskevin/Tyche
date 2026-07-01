import { useState, type FormEvent } from 'react';
import { api, type AuthUser } from '../providers/apiClient';

/**
 * Hosted-mode sign-in / sign-up gate. Terminal-styled, keyboard-friendly
 * (autofocus, Enter submits). Registration starts a free trial; the copy makes
 * the data posture explicit (no bundled market data, no advice, no orders).
 */
export function AuthScreen({ onAuthed }: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === 'login' ? await api.authLogin(email, password) : await api.authRegister(email, password);
    setBusy(false);
    if (res.ok && res.data) {
      onAuthed(res.data.user);
    } else {
      setError(!res.ok ? res.error.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-200">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-sky-400">Tyche</span>
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">hosted terminal</span>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          {mode === 'login' ? 'Sign in to your terminal.' : 'Create an account — 14-day free trial, no card required.'}
        </p>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Email</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm focus:border-sky-500/60 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm focus:border-sky-500/60 focus:outline-none"
            />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/30 disabled:opacity-50"
          >
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Start free trial'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="mt-3 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {mode === 'login' ? 'No account? Start a free trial →' : 'Already have an account? Sign in →'}
        </button>
        <p className="mt-4 text-[10px] leading-snug text-zinc-600">
          Research software only: no market data is bundled or resold, no investment advice is given,
          and no orders can be placed.
        </p>
      </div>
    </div>
  );
}
