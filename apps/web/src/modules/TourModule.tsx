import { TourBasics } from '../app/TourBasics';

/**
 * TOUR — replays the 30-second keyboard tour on demand in any panel. Shares the
 * TourBasics content with the first-login OnboardingScreen, so the two never
 * drift. Capability-less and mode-agnostic: it works in mock, hosted and demo.
 */
export function TourModule() {
  return (
    <div className="h-full overflow-auto px-4 py-3">
      <p className="mb-1 text-sm font-semibold tracking-tight text-sky-400">The 30-second tour</p>
      <p className="mb-4 text-[11px] text-zinc-500">
        The four keystrokes that get you anywhere in Tyche.
      </p>
      <div className="text-[12px] leading-relaxed">
        <TourBasics />
      </div>
      <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
        Next: press <kbd className="rounded bg-zinc-800 px-1 text-zinc-300">⌘K</kbd> and try{' '}
        <span className="font-mono text-zinc-400">HELP</span> to browse every command, or{' '}
        <span className="font-mono text-zinc-400">CHANGELOG</span> to see what&apos;s new.
      </p>
    </div>
  );
}
