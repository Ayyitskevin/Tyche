import type { DataFreshness } from '@tyche/contracts';
import { formatRelativeTime } from './format';

const TIER_CLASS: Record<string, string> = {
  live: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  delayed: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  eod: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  historical: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  mock: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  unknown: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export interface FreshnessBadgeProps {
  freshness: DataFreshness;
}

export function FreshnessBadge({ freshness }: FreshnessBadgeProps) {
  const tone = TIER_CLASS[freshness.tier] ?? TIER_CLASS.unknown;
  const label =
    freshness.tier === 'delayed' && freshness.delaySeconds
      ? `delayed ${Math.round(freshness.delaySeconds / 60)}m`
      : freshness.tier;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
      title={`As of ${freshness.asOf}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
      <span className="opacity-60">· {formatRelativeTime(freshness.asOf)}</span>
    </span>
  );
}
