import type { Position } from '@tyche/contracts';

/**
 * Portfolio mark-to-market math. Pure and dependency-free: positions carry only
 * durable inputs (symbol, quantity, average cost); live prices are supplied by
 * the caller so marks are computed fresh and never persisted. Educational
 * analytics only — nothing here is investment advice, and there is no notion of
 * placing or settling a trade.
 */

/** A position valued against a live price. Any field is null when an input is missing. */
export interface PositionMark {
  symbol: string;
  quantity: number;
  averageCost: number | null;
  marketPrice: number | null;
  /** quantity × marketPrice */
  marketValue: number | null;
  /** quantity × averageCost */
  costValue: number | null;
  /** (marketPrice − averageCost) × quantity */
  unrealizedPnl: number | null;
  /** unrealizedPnl ÷ |costValue| × 100 */
  unrealizedPnlPct: number | null;
  /** marketValue ÷ gross portfolio market value × 100 */
  weight: number | null;
}

export interface PortfolioSummary {
  positionCount: number;
  /** How many positions had a live price (the rest show "—"). */
  pricedCount: number;
  marketValue: number;
  costValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number | null;
  cash: number;
  /** marketValue + cash */
  totalValue: number;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Value a set of positions against live prices, returning per-position marks and
 * a portfolio summary. `priceFor` returns the latest price for a symbol (or
 * null/undefined when unknown); `cash` is uninvested balance.
 */
export function markPortfolio(
  positions: Position[],
  priceFor: (symbol: string) => number | null | undefined,
  cash = 0,
): { marks: PositionMark[]; summary: PortfolioSummary } {
  const prelim = positions.map((position) => {
    const price = finite(priceFor(position.symbol));
    const averageCost = finite(position.averageCost);
    const quantity = position.quantity;
    const marketValue = price === null ? null : quantity * price;
    const costValue = averageCost === null ? null : quantity * averageCost;
    const unrealizedPnl = price === null || averageCost === null ? null : (price - averageCost) * quantity;
    const unrealizedPnlPct =
      unrealizedPnl === null || costValue === null || costValue === 0
        ? null
        : (unrealizedPnl / Math.abs(costValue)) * 100;
    return { position, price, averageCost, marketValue, costValue, unrealizedPnl, unrealizedPnlPct };
  });

  const grossMarketValue = prelim.reduce((sum, m) => sum + (m.marketValue ?? 0), 0);

  const marks: PositionMark[] = prelim.map((m) => ({
    symbol: m.position.symbol,
    quantity: m.position.quantity,
    averageCost: m.averageCost,
    marketPrice: m.price,
    marketValue: m.marketValue,
    costValue: m.costValue,
    unrealizedPnl: m.unrealizedPnl,
    unrealizedPnlPct: m.unrealizedPnlPct,
    weight: m.marketValue === null || grossMarketValue === 0 ? null : (m.marketValue / grossMarketValue) * 100,
  }));

  const marketValue = prelim.reduce((sum, m) => sum + (m.marketValue ?? 0), 0);
  const costValue = prelim.reduce((sum, m) => sum + (m.costValue ?? 0), 0);
  const unrealizedPnl = prelim.reduce((sum, m) => sum + (m.unrealizedPnl ?? 0), 0);
  // Denominate P&L% only on the cost of positions that actually contributed P&L,
  // so the percentage is consistent with the dollar figure above it.
  const pnlCostBasis = prelim.reduce((sum, m) => sum + (m.unrealizedPnl === null ? 0 : (m.costValue ?? 0)), 0);

  const summary: PortfolioSummary = {
    positionCount: positions.length,
    pricedCount: prelim.filter((m) => m.price !== null).length,
    marketValue,
    costValue,
    unrealizedPnl,
    unrealizedPnlPct: pnlCostBasis === 0 ? null : (unrealizedPnl / Math.abs(pnlCostBasis)) * 100,
    cash,
    totalValue: marketValue + cash,
  };

  return { marks, summary };
}
