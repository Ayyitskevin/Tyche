import type { ReactNode } from 'react';

/**
 * The 30-second keyboard tour, shared by the first-login OnboardingScreen and
 * the TOUR command's panel so the two never drift. Presentational only — no
 * state, no mode assumptions, so it renders identically in mock, hosted and
 * demo modes.
 */
function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded bg-zinc-800 px-1 text-zinc-300">{children}</kbd>;
}

function Cmd({ children }: { children: ReactNode }) {
  return <span className="font-mono text-zinc-400">{children}</span>;
}

const STEPS: { keys: ReactNode; text: ReactNode }[] = [
  {
    keys: <Kbd>⌘K</Kbd>,
    text: (
      <>
        Open the command bar, then type — <Cmd>AAPL GP</Cmd> charts Apple, <Cmd>HELP</Cmd> lists every command.
      </>
    ),
  },
  {
    keys: <Kbd>Tab</Kbd>,
    text: (
      <>
        Cycle focus between panels; <Kbd>Esc</Kbd> closes the command bar.
      </>
    ),
  },
  {
    keys: <Kbd>⌘S</Kbd>,
    text: (
      <>
        Save the workspace — every shortcut is rebindable in <Cmd>SETTINGS</Cmd>.
      </>
    ),
  },
  {
    keys: <Cmd>ACCOUNT</Cmd>,
    text: <>Manage your plan and trial status.</>,
  },
];

export function TourBasics() {
  return (
    <ul className="space-y-1.5">
      {STEPS.map((step, i) => (
        <li key={i} className="flex items-baseline gap-2">
          <span className="w-14 shrink-0 text-right">{step.keys}</span>
          <span className="min-w-0 flex-1 text-zinc-500">{step.text}</span>
        </li>
      ))}
    </ul>
  );
}
