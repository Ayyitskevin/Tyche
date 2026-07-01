/**
 * Onboarding role presets (hosted mode, first login). Each preset seeds a
 * starter workspace through the real command path, so a new user's first
 * screen is a working terminal for THEIR job, not an empty grid.
 */
export interface RolePreset {
  id: 'trader' | 'macro' | 'analyst' | 'blank';
  title: string;
  blurb: string;
  /** Command lines executed in order (same grammar as the command bar). */
  seeds: string[];
  workspaceName: string;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'trader',
    title: 'Active trader',
    blurb: 'Streaming quotes, an intraday chart, movers, and price alerts.',
    seeds: ['QM', 'AAPL GIP', 'MOST', 'ALERT'],
    workspaceName: 'Trading desk',
  },
  {
    id: 'analyst',
    title: 'Equity researcher',
    blurb: 'Company profile, financials, estimates, events, and a research journal.',
    seeds: ['AAPL DES', 'AAPL FA', 'AAPL EM', 'NOTE'],
    workspaceName: 'Research',
  },
  {
    id: 'macro',
    title: 'Macro / markets watcher',
    blurb: 'Economic series, world indices, and the news tape.',
    seeds: ['ECO GDP', 'WEI', 'TOP'],
    workspaceName: 'Macro view',
  },
  {
    id: 'blank',
    title: 'Start from scratch',
    blurb: 'An empty grid — press ⌘K and build your own.',
    seeds: [],
    workspaceName: 'Untitled workspace',
  },
];
