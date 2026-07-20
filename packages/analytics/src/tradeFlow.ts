import type { TradePrint, TradeSide } from '@tyche/contracts';
import { analyticalMeta, type AnalyticalMeta } from './analyticalMeta';

export interface TradeFlow {
  count: number;
  /** Σ size across all prints. */
  totalVolume: number;
  /** Σ price × size (traded notional). */
  notional: number;
  /** Volume-weighted average price = notional ÷ totalVolume; null when no volume. */
  vwap: number | null;
  /** Mean print size; null when there are no prints. */
  avgSize: number | null;
  buyVolume: number;
  sellVolume: number;
  unknownVolume: number;
  /** buyVolume ÷ (buyVolume + sellVolume) over CLASSIFIED prints, 0–1; null when none are classified. */
  buyShare: number | null;
  /** buyVolume − sellVolume (signed base units). */
  netVolume: number;
  /** Σ sign × price × size (buy +, sell −, unknown 0) — signed traded notional. */
  netNotional: number;
  buyCount: number;
  sellCount: number;
  /** The single largest print by size; null when there are no prints. */
  largest: { price: number; size: number; side: TradeSide } | null;
  /** Highest / lowest print price; null when there are no prints. */
  high: number | null;
  low: number | null;
  meta: AnalyticalMeta;
}

const emptyMeta = (): AnalyticalMeta =>
  analyticalMeta({
    formulaId: 'flow.trade-tape.v1',
    status: 'unavailable',
    units: 'dimensionless',
    source: 'trade prints',
    notes: 'Empty or non-positive tape — ratios undefined',
    value: null,
  });

const EMPTY: TradeFlow = {
  count: 0,
  totalVolume: 0,
  notional: 0,
  vwap: null,
  avgSize: null,
  buyVolume: 0,
  sellVolume: 0,
  unknownVolume: 0,
  buyShare: null,
  netVolume: 0,
  netNotional: 0,
  buyCount: 0,
  sellCount: 0,
  largest: null,
  high: null,
  low: null,
  meta: emptyMeta(),
};

/**
 * Order-flow analytics over a trade-tape snapshot: traded volume and notional,
 * the VWAP, the buy/sell split by aggressor side, net flow, and the largest
 * print. Aggressor-side splits count only prints the venue classified (side
 * 'buy'/'sell'); unclassified prints ('unknown') are tallied separately and never
 * guessed. Empty-safe: with no prints every ratio is null, not a fabricated zero.
 * Descriptive market-microstructure analytics — not a signal, not advice.
 *
 * Formula id: `flow.trade-tape.v1`.
 */
export function tradeFlow(trades: TradePrint[]): TradeFlow {
  const prints = trades.filter((t) => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.size) && t.size > 0);
  const count = prints.length;
  if (count === 0) return { ...EMPTY, meta: emptyMeta() };

  let totalVolume = 0;
  let notional = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let unknownVolume = 0;
  let netNotional = 0;
  let buyCount = 0;
  let sellCount = 0;
  let largest = prints[0]!;
  let high = prints[0]!.price;
  let low = prints[0]!.price;

  for (const t of prints) {
    totalVolume += t.size;
    notional += t.price * t.size;
    if (t.size > largest.size) largest = t;
    if (t.price > high) high = t.price;
    if (t.price < low) low = t.price;
    if (t.side === 'buy') {
      buyVolume += t.size;
      buyCount += 1;
      netNotional += t.price * t.size;
    } else if (t.side === 'sell') {
      sellVolume += t.size;
      sellCount += 1;
      netNotional -= t.price * t.size;
    } else {
      unknownVolume += t.size;
    }
  }

  const classified = buyVolume + sellVolume;
  const vwap = totalVolume > 0 ? notional / totalVolume : null;
  return {
    count,
    totalVolume,
    notional,
    vwap,
    avgSize: totalVolume / count,
    buyVolume,
    sellVolume,
    unknownVolume,
    buyShare: classified > 0 ? buyVolume / classified : null,
    netVolume: buyVolume - sellVolume,
    netNotional,
    buyCount,
    sellCount,
    largest: { price: largest.price, size: largest.size, side: largest.side },
    high,
    low,
    meta: analyticalMeta({
      formulaId: 'flow.trade-tape.v1',
      status: 'estimated',
      units: 'dimensionless',
      source: 'trade prints',
      asOf: prints[prints.length - 1]?.timestamp,
      notes: 'VWAP / buy-share over classified aggressor sides only; unknown never guessed',
      value: vwap,
    }),
  };
}
