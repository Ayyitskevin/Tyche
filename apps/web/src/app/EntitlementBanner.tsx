import { useMemo, useState } from 'react';
import { entitlementWarning } from '@tyche/ui';
import { useTerminalStore } from '../state/terminalStore';

/**
 * A dismissible-per-session banner shown whenever any non-mock (BYO/live)
 * provider is active. Tyche bundles no licensed data, so honoring each source's
 * entitlements and terms is the operator's responsibility. Mock-only sessions
 * (the default, no keys) show nothing.
 */
export function EntitlementBanner() {
  const providers = useTerminalStore((s) => s.providers);
  const [dismissed, setDismissed] = useState(false);

  const notices = useMemo(
    () => providers.map(entitlementWarning).filter((n): n is NonNullable<typeof n> => n !== null),
    [providers],
  );

  if (dismissed || notices.length === 0) return null;

  const sources = notices.map((n) => n.provider).join(', ');
  const attributionRequired = notices.filter((n) => n.attributionRequired).map((n) => n.provider);

  return (
    <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200/90">
      <span className="shrink-0">⚠</span>
      <p className="flex-1">
        Tyche does not license this data. You are responsible for your market-data entitlements and each
        source’s terms ({sources}); see{' '}
        <a href="https://github.com/Ayyitskevin/Tyche/blob/main/SECURITY.md" target="_blank" rel="noreferrer" className="underline">
          SECURITY.md
        </a>
        .
        {attributionRequired.length > 0 && (
          <span className="text-amber-300"> Attribution required: {attributionRequired.join(', ')}.</span>
        )}
      </p>
      <button
        type="button"
        aria-label="Dismiss entitlement notice"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-300/70 hover:text-amber-200"
      >
        ✕
      </button>
    </div>
  );
}
