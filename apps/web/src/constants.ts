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

/** Index-ish symbols used by the WEI board (demo). */
export const WORLD_INDEX_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT'] as const;

/** Color palette for panel link-groups. */
export const LINK_COLORS = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185'] as const;

export const WORKSPACE_GRID_COLS = 12;
export const WORKSPACE_ROW_HEIGHT = 30;

export const STORAGE_KEYS = {
  workspace: 'tyche:workspace',
  lastWorkspaceId: 'tyche:lastWorkspaceId',
} as const;
