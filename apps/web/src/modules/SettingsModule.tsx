import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Density, Theme, UserPreferences } from '@tyche/contracts';
import { api } from '../providers/apiClient';
import { usePreferencesStore } from '../state/preferencesStore';
import { useTerminalStore } from '../state/terminalStore';

const THEMES: Theme[] = ['dark', 'midnight', 'high-contrast'];
const DENSITIES: Density[] = ['comfortable', 'compact', 'dense'];

function Segment<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: T[];
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onSelect(o)}
          className={`rounded px-2 py-0.5 text-[11px] ${
            o === value ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function SettingsModule(_props: ModulePanelProps) {
  const preferences = usePreferencesStore((s) => s.preferences);
  const patch = usePreferencesStore((s) => s.patch);
  const providers = useTerminalStore((s) => s.providers);
  const capabilities = useTerminalStore((s) => s.capabilities);
  const mode = useTerminalStore((s) => s.mode);

  function update(partial: Partial<UserPreferences>) {
    patch(partial);
    void api.savePreferences({ ...preferences, ...partial });
  }

  return (
    <div className="space-y-4 p-3 text-sm">
      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Appearance</h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Theme</span>
          <Segment options={THEMES} value={preferences.theme} onSelect={(t) => update({ theme: t })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Density</span>
          <Segment options={DENSITIES} value={preferences.density} onSelect={(d) => update({ density: d })} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Terminal</h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Default command (bare symbol)</span>
          <input
            value={preferences.defaultCommandId}
            onChange={(e) => update({ defaultCommandId: e.target.value.toUpperCase() })}
            className="w-20 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-right font-mono text-xs text-zinc-200 focus:outline-none"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Providers ({mode})
        </h3>
        {providers.map((p) => (
          <div key={p.name} className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-200">{p.name}</span>
              <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase text-zinc-400">{p.mode}</span>
              {p.requiresConfiguration && (
                <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] text-amber-300">needs config</span>
              )}
            </div>
            {p.description && <p className="mt-1 text-[11px] text-zinc-500">{p.description}</p>}
          </div>
        ))}
      </section>

      <section className="space-y-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Capabilities</h3>
        <div className="flex flex-wrap gap-1">
          {Object.entries(capabilities).map(([cap, on]) => (
            <span
              key={cap}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-600 line-through'
              }`}
            >
              {cap}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
