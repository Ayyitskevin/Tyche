import { useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { executeInput } from '../terminal/execute';
import { DESKS, deskSeeds, recommendedDesk, type Desk } from './desks';

/**
 * The LAUNCH research launchpad — a control panel that fans out a curated
 * multi-panel "desk" for a symbol in one click, through the real command path
 * (so each panel is a genuine command and degrades on its own capability gap).
 * The recommended desk is chosen by asset class. Descriptive research only.
 */
export function LaunchpadModule({ symbol, assetClass, state, setState }: ModulePanelProps) {
  const [draft, setDraft] = useState(symbol ?? '');
  const deskSymbol = draft.trim().toUpperCase();
  const recommended = recommendedDesk(assetClass);
  const lastDesk = state.lastDesk as string | undefined;

  const openDesk = (desk: Desk) => {
    const seeds = deskSeeds(desk, deskSymbol || null);
    if (seeds.length === 0) return; // symbol desk with no symbol — button is disabled
    for (const line of seeds) executeInput(line);
    setState({ lastDesk: desk.id });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <div>
        <h2 className="text-zinc-100">Research launchpad</h2>
        <p className="text-xs text-zinc-500">
          Open a curated multi-panel desk in one click. Descriptive research only — no advice.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-400">
        Symbol
        <input
          aria-label="Launchpad symbol"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. AAPL"
          className="w-28 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono uppercase text-zinc-100 placeholder:normal-case placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
        />
      </label>

      <div className="flex flex-col gap-2">
        {DESKS.map((desk) => {
          const needsSymbol = desk.scope === 'symbol' && !deskSymbol;
          return (
            <div key={desk.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-100">{desk.title}</span>
                  {desk.id === recommended && (
                    <span className="rounded bg-sky-500/20 px-1 text-[10px] text-sky-300">recommended</span>
                  )}
                  {desk.id === lastDesk && <span className="text-[10px] text-zinc-500">· last opened</span>}
                </div>
                <button
                  type="button"
                  disabled={needsSymbol}
                  onClick={() => openDesk(desk)}
                  className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-transparent disabled:text-zinc-600"
                >
                  Open
                </button>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{desk.blurb}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {desk.commands.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-400"
                  >
                    {c}
                  </span>
                ))}
              </div>
              {needsSymbol && (
                <p className="mt-1 text-[10px] text-amber-400/80">Enter a symbol to open this desk.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
