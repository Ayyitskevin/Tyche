/** API base URL; overridable via VITE_API_BASE_URL. */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4010';

/** Default demo universe (mirrors the mock provider's seed symbols). */
export const DEFAULT_SYMBOLS = [
  'AAPL',
  'MSFT',
  'NVDA',
  'TSLA',
  'SPY',
  'QQQ',
  'BTC-USD',
  'ETH-USD',
] as const;

/** Regioned index-ETF proxies for the WEI board (demo; all mock-synthesizable). */
export const WORLD_INDEX_REGIONS: Array<{ region: string; members: Array<{ symbol: string; label: string }> }> = [
  {
    region: 'Americas',
    members: [
      { symbol: 'SPY', label: 'S&P 500' },
      { symbol: 'QQQ', label: 'Nasdaq 100' },
      { symbol: 'DIA', label: 'Dow 30' },
      { symbol: 'IWM', label: 'Russell 2000' },
      { symbol: 'EWZ', label: 'Brazil' },
    ],
  },
  {
    region: 'EMEA',
    members: [
      { symbol: 'VGK', label: 'Europe' },
      { symbol: 'EWU', label: 'UK' },
      { symbol: 'EWG', label: 'Germany' },
      { symbol: 'EZU', label: 'Eurozone' },
    ],
  },
  {
    region: 'APAC',
    members: [
      { symbol: 'EWJ', label: 'Japan' },
      { symbol: 'MCHI', label: 'China' },
      { symbol: 'EWY', label: 'S. Korea' },
      { symbol: 'EWA', label: 'Australia' },
    ],
  },
];

/** Derived flat symbol list for the batch fetch. */
export const WORLD_INDEX_SYMBOLS = WORLD_INDEX_REGIONS.flatMap((r) => r.members.map((m) => m.symbol));

/** Grouped commodities for the COMM board (demo; all seeded in the mock provider). */
export const COMMODITY_GROUPS: Array<{ group: string; members: Array<{ symbol: string; label: string }> }> = [
  {
    group: 'Energy',
    members: [
      { symbol: 'WTI-USD', label: 'WTI Crude' },
      { symbol: 'NG-USD', label: 'Natural Gas' },
    ],
  },
  {
    group: 'Metals',
    members: [
      { symbol: 'XAU-USD', label: 'Gold' },
      { symbol: 'XAG-USD', label: 'Silver' },
      { symbol: 'HG-USD', label: 'Copper' },
    ],
  },
  {
    group: 'Agriculture',
    members: [{ symbol: 'ZW-USD', label: 'Wheat' }],
  },
];

/** Derived flat symbol list for the batch fetch. */
export const COMMODITY_SYMBOLS = COMMODITY_GROUPS.flatMap((g) => g.members.map((m) => m.symbol));

/** Color palette for panel link-groups. */
export const LINK_COLORS = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185'] as const;

export const WORKSPACE_GRID_COLS = 12;
export const WORKSPACE_ROW_HEIGHT = 30;

export const STORAGE_KEYS = {
  workspace: 'tyche:workspace',
  lastWorkspaceId: 'tyche:lastWorkspaceId',
} as const;
