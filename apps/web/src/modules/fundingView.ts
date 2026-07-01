/** Format a per-interval funding rate (decimal) as a signed percentage. */
export function formatRatePct(rate: number, decimals = 4): string {
  const pct = rate * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

/** Human countdown to the next funding timestamp ("2h 14m"), or "—". */
export function fundingCountdown(nextFundingAt: string | undefined, nowMs: number): string {
  if (!nextFundingAt) return '—';
  const ms = Date.parse(nextFundingAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
