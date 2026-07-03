import { useTerminalStore } from '../state/terminalStore';

/**
 * A persistent (non-dismissible) ribbon shown on read-only public demo
 * instances (TYCHE_DEMO). Sets the expectation up front — you can drive the
 * whole terminal, but nothing you change is saved server-side — and points at
 * the two ways to get a real, writable instance.
 */
export function DemoRibbon() {
  const demo = useTerminalStore((s) => s.demo);
  if (!demo) return null;

  return (
    <div className="flex items-center gap-2 border-b border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[11px] text-sky-200/90">
      <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.5 font-medium text-sky-300">DEMO</span>
      <p className="flex-1">
        Read-only public demo — explore freely; changes aren’t saved.{' '}
        <a
          href="https://github.com/Ayyitskevin/Tyche"
          target="_blank"
          rel="noreferrer noopener"
          className="underline hover:text-sky-100"
        >
          Self-host it free
        </a>{' '}
        or sign up for a writable, private instance.
      </p>
    </div>
  );
}
