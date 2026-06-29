import type { ModulePanelProps } from '@tyche/module-sdk';
import type {
  Density,
  PluginInfo,
  ProviderCapabilities,
  ProviderDescriptor,
  Theme,
  UserPreferences,
} from '@tyche/contracts';
import { PROVIDER_CAPABILITY_KEYS } from '@tyche/contracts';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { usePreferencesStore } from '../state/preferencesStore';
import { useTerminalStore } from '../state/terminalStore';

const PLUGIN_STATUS_STYLE: Record<PluginInfo['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  quarantined: 'bg-red-500/15 text-red-300',
  disabled: 'bg-zinc-700 text-zinc-300',
};

function PluginCard({
  info,
  disabledByPref,
  onToggle,
}: {
  info: PluginInfo;
  disabledByPref: boolean;
  onToggle: () => void;
}) {
  const { manifest } = info;
  const checkByCap = new Map(info.conformance.map((c) => [c.capability, c]));
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-200">{manifest.name}</span>
        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase text-zinc-400">{manifest.kind}</span>
        <span className="font-mono text-[9px] text-zinc-500">v{manifest.version}</span>
        <span className={`rounded px-1 py-0.5 text-[9px] ${PLUGIN_STATUS_STYLE[info.status]}`}>{info.status}</span>
        {manifest.homepage && (
          <a href={manifest.homepage} target="_blank" rel="noreferrer" className="text-[9px] text-sky-400 underline">
            site
          </a>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          {disabledByPref ? 'Enable' : 'Disable'}
        </button>
      </div>
      {info.reason && <p className="mt-1 text-[10px] text-amber-300/80">{info.reason}</p>}
      {manifest.capabilities.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {manifest.capabilities.map((cap) => {
            const check = checkByCap.get(cap);
            const mark = check ? (check.passed ? '✓' : '✗') : '·';
            const tone = check ? (check.passed ? 'text-emerald-400' : 'text-red-400') : 'text-zinc-600';
            return (
              <span key={cap} className="flex items-center gap-0.5 rounded bg-zinc-800/70 px-1 text-[10px] text-zinc-400" title={check?.error}>
                <span className={tone}>{mark}</span>
                {cap}
              </span>
            );
          })}
        </div>
      )}
      {manifest.author && <p className="mt-1 text-[9px] text-zinc-600">by {manifest.author}</p>}
    </div>
  );
}

const THEMES: Theme[] = ['dark', 'midnight', 'high-contrast'];
const DENSITIES: Density[] = ['comfortable', 'compact', 'dense'];

/** A compact ✓/— grid over every capability key. */
function CapabilityGrid({ capabilities }: { capabilities: ProviderCapabilities }) {
  return (
    <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5 sm:grid-cols-4">
      {PROVIDER_CAPABILITY_KEYS.map((key) => {
        const on = capabilities[key];
        return (
          <span
            key={key}
            className={`flex items-center gap-1 text-[10px] ${on ? 'text-zinc-300' : 'text-zinc-600'}`}
          >
            <span className={on ? 'text-emerald-400' : 'text-zinc-700'}>{on ? '✓' : '—'}</span>
            {key}
          </span>
        );
      })}
    </div>
  );
}

/** Declared freshness guarantees, rendered as labels (not live readings). */
function FreshnessGuarantees({ descriptor }: { descriptor: ProviderDescriptor }) {
  if (descriptor.freshness.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {descriptor.freshness.map((g) => (
        <span key={g.capability} className="rounded bg-zinc-800/60 px-1 text-[9px] text-zinc-500">
          {g.capability}: {g.tier}
          {g.delaySeconds ? ` (+${g.delaySeconds}s)` : ''}
        </span>
      ))}
    </div>
  );
}

function ProviderCard({ descriptor }: { descriptor: ProviderDescriptor }) {
  const nonMock = descriptor.mode !== 'mock';
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-200">{descriptor.name}</span>
        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase text-zinc-400">{descriptor.mode}</span>
        {descriptor.requiresConfiguration && (
          <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] text-amber-300">needs config</span>
        )}
        {descriptor.attributionRequired && (
          <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] text-amber-300">attribution required</span>
        )}
        {descriptor.homepage && (
          <a
            href={descriptor.homepage}
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-sky-400 underline"
          >
            site
          </a>
        )}
      </div>
      {descriptor.description && <p className="mt-1 text-[11px] text-zinc-500">{descriptor.description}</p>}
      {nonMock && descriptor.attribution && (
        <p className="mt-1 text-[10px] text-amber-300/80">attribution: {descriptor.attribution}</p>
      )}
      <CapabilityGrid capabilities={descriptor.capabilities} />
      <FreshnessGuarantees descriptor={descriptor} />
      {descriptor.rateLimit?.notes && (
        <p className="mt-1 text-[9px] text-zinc-600">rate limit: {descriptor.rateLimit.notes}</p>
      )}
    </div>
  );
}

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
  const plugins = useApiData(() => api.getPlugins(), []);
  const audit = useApiData(() => api.getAudit(50), []);

  function update(partial: Partial<UserPreferences>) {
    patch(partial);
    void api.savePreferences({ ...preferences, ...partial });
  }

  function togglePlugin(id: string) {
    const disabled = preferences.disabledPlugins ?? [];
    const next = disabled.includes(id) ? disabled.filter((p) => p !== id) : [...disabled, id];
    update({ disabledPlugins: next });
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
          Providers ({mode}) — what each data source can do
        </h3>
        {providers.length === 0 ? (
          <p className="text-[11px] text-zinc-600">No providers reported yet.</p>
        ) : (
          providers.map((p) => <ProviderCard key={p.name} descriptor={p} />)
        )}

        {/* Union coverage across every enabled provider — the same set the
            capability-gap logic uses to decide empty states. */}
        <div className="rounded border border-zinc-700 bg-zinc-900/70 p-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-200">All providers (union)</span>
            <span className="text-[10px] text-zinc-500">total terminal coverage</span>
          </div>
          <CapabilityGrid capabilities={capabilities} />
          {PROVIDER_CAPABILITY_KEYS.some((k) => !capabilities[k]) && (
            <p className="mt-1.5 text-[10px] text-zinc-500">
              Greyed capabilities aren’t supplied by any enabled provider — modules needing them show a
              capability-unavailable state until you configure a provider that does.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Plugins</h3>
        {plugins.loading ? (
          <p className="text-[11px] text-zinc-600">Loading…</p>
        ) : (plugins.data ?? []).length === 0 ? (
          <p className="text-[11px] text-zinc-600">
            No plugins installed. Point <span className="font-mono">TYCHE_PLUGINS</span> at a local provider plugin
            (see docs/PLUGINS.md). Plugins are conformance-gated before they can serve data.
          </p>
        ) : (
          <>
            {(plugins.data ?? []).map((info) => (
              <PluginCard
                key={info.manifest.id}
                info={info}
                disabledByPref={(preferences.disabledPlugins ?? []).includes(info.manifest.id)}
                onToggle={() => togglePlugin(info.manifest.id)}
              />
            ))}
            <p className="text-[10px] text-zinc-600">Enable/disable changes take effect on the next API restart.</p>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Recent activity (audit)
        </h3>
        <p className="text-[10px] text-zinc-600">
          A record of mutating actions. The durable trail is written to the configured sink (stdout or a
          file via <span className="font-mono">TYCHE_AUDIT_SINK=file</span>); this is the most recent.
        </p>
        {audit.loading && audit.data === null ? (
          <p className="text-[11px] text-zinc-600">Loading…</p>
        ) : (audit.data ?? []).length === 0 ? (
          <p className="text-[11px] text-zinc-600">No audited actions yet this session.</p>
        ) : (
          <div className="max-h-40 space-y-0.5 overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-1.5 font-mono text-[10px]">
            {(audit.data ?? []).map((e, i) => (
              <div key={`${e.at}-${i}`} className="flex items-center gap-2">
                <span className="shrink-0 text-zinc-600">{e.at.replace('T', ' ').slice(0, 19)}</span>
                <span className="shrink-0 text-zinc-300">{e.action}</span>
                {e.resource && <span className="truncate text-zinc-600">{e.resource}</span>}
                <span
                  className={`ml-auto shrink-0 ${
                    e.outcome === 'allow' ? 'text-emerald-400/80' : 'text-red-400'
                  }`}
                >
                  {e.outcome}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
