/**
 * Pure view helpers for the DEX pools module. Kept out of the component so the
 * micro-price formatting (meme tokens live many decimals below $1) is testable.
 */

/** USD price with precision that follows magnitude: 2dp above $1, more below. */
export function formatPoolPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0.00';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(2);
  // Below $1: keep ~3 significant digits without scientific notation.
  const decimals = Math.min(10, Math.max(2, 2 - Math.floor(Math.log10(value))));
  return value.toFixed(decimals);
}

/** Compact USD amount for volume/liquidity/FDV columns ("$1.2M"), or "—". */
export function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** The default DEX query for an active symbol: its base token ("ETH-USD" → "ETH"). */
export function defaultDexQuery(symbol: string | null | undefined): string {
  const base = (symbol ?? '').trim().toUpperCase().split(/[-/\s]/)[0];
  return base || 'ETH';
}
