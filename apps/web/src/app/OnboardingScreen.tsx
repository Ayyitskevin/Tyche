import { useState } from 'react';
import { api } from '../providers/apiClient';
import { usePreferencesStore } from '../state/preferencesStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import { executeInput } from '../terminal/execute';
import { saveCurrentWorkspace } from '../workspace/persistence';
import { ROLE_PRESETS, type RolePreset } from './onboarding';

/**
 * First-login role picker (hosted mode). Seeds a starter workspace through the
 * real command path and records the choice in preferences, so it shows exactly
 * once. Doubles as the welcome tour: the keyboard basics are on this screen.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function pick(preset: RolePreset) {
    if (busy) return;
    setBusy(true);
    if (preset.seeds.length > 0) {
      useWorkspaceStore.getState().rename(preset.workspaceName);
      for (const line of preset.seeds) executeInput(line);
      await saveCurrentWorkspace();
    }
    usePreferencesStore.getState().patch({ onboardingRole: preset.id });
    await api.savePreferences({ onboardingRole: preset.id });
    onDone();
  }

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-200">
      <div className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-sky-400">Welcome to Tyche</span>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Pick a starting point — it opens a working layout you can tear apart immediately.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy}
              onClick={() => void pick(preset)}
              className="rounded border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-sky-500/50 disabled:opacity-50"
            >
              <div className="text-sm font-medium text-zinc-100">{preset.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{preset.blurb}</div>
              {preset.seeds.length > 0 && (
                <div className="mt-2 font-mono text-[10px] text-zinc-600">{preset.seeds.join(' · ')}</div>
              )}
            </button>
          ))}
        </div>
        <div className="mt-5 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
          <span className="text-zinc-300">The 30-second tour:</span> press{' '}
          <kbd className="rounded bg-zinc-800 px-1">⌘K</kbd> and type — <span className="font-mono">AAPL GP</span>{' '}
          charts Apple, <span className="font-mono">HELP</span> lists every command.{' '}
          <kbd className="rounded bg-zinc-800 px-1">Tab</kbd> cycles panels,{' '}
          <kbd className="rounded bg-zinc-800 px-1">⌘E</kbd> saves the workspace, and{' '}
          <span className="font-mono">ACCOUNT</span> manages your plan.
        </div>
      </div>
    </div>
  );
}
