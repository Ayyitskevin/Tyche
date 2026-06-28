import type { AssetClass } from '@tyche/contracts';

/**
 * Bloomberg-style "yellow key" tokens we tolerate but do not depend on. The
 * grammar strips them so that `AAPL US Equity DES` parses identically to
 * `AAPL DES`, without assuming any proprietary market-sector behavior.
 */
export const DEFAULT_YELLOW_KEYS: ReadonlySet<string> = new Set([
  // country / listing hints
  'US',
  'GB',
  'UK',
  'EU',
  'JP',
  'HK',
  'CN',
  'CA',
  'AU',
  'DE',
  'FR',
  'IN',
  'LN',
  'GR',
  'FP',
  'JT',
  // market-sector style hints
  'EQUITY',
  'INDEX',
  'CURNCY',
  'COMDTY',
  'COMMODITY',
  'CORP',
  'GOVT',
  'MTGE',
  'PFD',
  'FX',
  'CRYPTO',
  'FUTURE',
  'FUT',
]);

/** Yellow-key tokens that additionally hint an asset class. */
export const ASSET_CLASS_KEYWORDS: Readonly<Record<string, AssetClass>> = {
  EQUITY: 'equity',
  INDEX: 'index',
  CURNCY: 'fx',
  FX: 'fx',
  COMDTY: 'commodity',
  COMMODITY: 'commodity',
  CORP: 'bond',
  GOVT: 'bond',
  MTGE: 'bond',
  CRYPTO: 'crypto',
  FUTURE: 'future',
  FUT: 'future',
};

/** A token that could be a ticker symbol (e.g. AAPL, BRK.B, BTC-USD). */
export const SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9.\-]{0,11}$/;

export function isSymbolLike(token: string): boolean {
  return SYMBOL_PATTERN.test(token);
}

/** Strict: looks like a symbol AND is upper-cased, the conventional ticker form. */
export function isStrictSymbol(token: string): boolean {
  return SYMBOL_PATTERN.test(token) && token === token.toUpperCase();
}

export function looksLikeCrypto(symbol: string): boolean {
  return /^[A-Z0-9]{2,10}-(USD|USDT|USDC|BTC|ETH|EUR|GBP)$/.test(symbol);
}

export function inferAssetClass(symbol: string, hint: AssetClass | null): AssetClass {
  if (hint) return hint;
  if (looksLikeCrypto(symbol)) return 'crypto';
  return 'equity';
}
