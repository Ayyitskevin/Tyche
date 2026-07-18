import type { InsiderTransaction } from '@tyche/contracts';

/**
 * Aggregated insider (Section 16) activity over a set of Form 3/4/5 transactions.
 * Educational analytics only — a descriptive summary of *reported* filings, not a
 * signal or investment advice.
 */
export interface InsiderRoleBucket {
  /** Bucketed role: 'Director' | 'Officer' | '10% Owner' | 'Other'. */
  role: string;
  buyShares: number;
  sellShares: number;
  netShares: number;
}

export interface InsiderActivitySummary {
  transactionCount: number;
  /** Count of acquired ('A') transactions. */
  buyCount: number;
  /** Count of disposed ('D') transactions. */
  sellCount: number;
  buyShares: number;
  sellShares: number;
  /** buyShares − sellShares (signed). */
  netShares: number;
  /** Sum of shares×price on priced buys, USD; null when no buy was priced. */
  buyValue: number | null;
  sellValue: number | null;
  /** buyValue − sellValue; null only when neither side had any priced transaction. */
  netValue: number | null;
  /** Distinct insiders who acquired / disposed (any transaction code). */
  distinctBuyers: number;
  distinctSellers: number;
  /** Distinct insiders making OPEN-MARKET/private purchases (SEC code 'P') / sales (code 'S'). */
  openMarketBuyers: number;
  openMarketSellers: number;
  /**
   * ≥ {@link CLUSTER_THRESHOLD} distinct insiders making OPEN-MARKET purchases / sales — a
   * "cluster". Grants, awards, option exercises and gifts do NOT count, so this stays a
   * purchase/sale signal rather than a compensation artifact.
   */
  clusterBuy: boolean;
  clusterSell: boolean;
  /**
   * True only when every acquired/disposed transaction was priced, so `netValue` covers ALL
   * directional activity rather than a partial, one-sided total.
   */
  valueComplete: boolean;
  firstDate: string | null;
  lastDate: string | null;
  /** Per-role buy/sell/net breakdown, ordered by |netShares| desc (empty roles dropped). */
  byRole: InsiderRoleBucket[];
}

/** How many distinct insiders on one side constitutes a cluster buy/sell. */
export const CLUSTER_THRESHOLD = 3;

/** Bucket a free-text Section-16 relationship into a coarse role. */
export function insiderRole(relationship: string | undefined): string {
  if (!relationship) return 'Other';
  const r = relationship.toLowerCase();
  if (r.includes('director')) return 'Director';
  if (r.includes('10%') || r.includes('ten percent')) return '10% Owner';
  if (
    r.includes('officer') ||
    r.includes('president') ||
    r.includes('chief') ||
    r.includes('cfo') ||
    r.includes('ceo') ||
    r.includes('vp') ||
    r.includes('vice')
  ) {
    return 'Officer';
  }
  return 'Other';
}

/**
 * Summarize insider transactions into net buying/selling, distinct-insider counts,
 * cluster flags, per-role breakdown, and (where priced) dollar value. Only A/D
 * transactions contribute to buy/sell aggregates — non-directional codes (e.g. a
 * Form 3 initial statement, or a transaction with no acquired/disposed flag) are
 * counted in `transactionCount` but not attributed to a side. Dependency-free and
 * safe on an empty set. Educational analytics only; not investment advice.
 */
export function insiderActivity(transactions: InsiderTransaction[]): InsiderActivitySummary {
  let buyShares = 0;
  let sellShares = 0;
  let buyCount = 0;
  let sellCount = 0;
  let buyValueAcc = 0;
  let sellValueAcc = 0;
  let buyPriced = false;
  let sellPriced = false;
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  const openBuyers = new Set<string>();
  const openSellers = new Set<string>();
  let unpricedDirectional = false;
  const roles = new Map<string, { buy: number; sell: number }>();
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const t of transactions) {
    if (t.date) {
      if (firstDate === null || t.date < firstDate) firstDate = t.date;
      if (lastDate === null || t.date > lastDate) lastDate = t.date;
    }
    const role = insiderRole(t.relationship);
    let bucket = roles.get(role);
    if (!bucket) {
      bucket = { buy: 0, sell: 0 };
      roles.set(role, bucket);
    }
    const shares = Number.isFinite(t.shares) ? t.shares : 0;
    const priced = t.pricePerShare != null && Number.isFinite(t.pricePerShare);
    const code = (t.code || '').toUpperCase();
    if (t.acquiredDisposed === 'A') {
      buyShares += shares;
      buyCount += 1;
      buyers.add(t.owner);
      bucket.buy += shares;
      if (priced) {
        buyValueAcc += shares * (t.pricePerShare as number);
        buyPriced = true;
      } else {
        unpricedDirectional = true;
      }
      if (code === 'P') openBuyers.add(t.owner); // open-market / private PURCHASE only
    } else if (t.acquiredDisposed === 'D') {
      sellShares += shares;
      sellCount += 1;
      sellers.add(t.owner);
      bucket.sell += shares;
      if (priced) {
        sellValueAcc += shares * (t.pricePerShare as number);
        sellPriced = true;
      } else {
        unpricedDirectional = true;
      }
      if (code === 'S') openSellers.add(t.owner); // open-market / private SALE only
    }
  }

  const buyValue = buyPriced ? Math.round(buyValueAcc) : null;
  const sellValue = sellPriced ? Math.round(sellValueAcc) : null;
  const netValue = buyValue === null && sellValue === null ? null : (buyValue ?? 0) - (sellValue ?? 0);

  const byRole: InsiderRoleBucket[] = [...roles.entries()]
    .map(([role, b]) => ({ role, buyShares: b.buy, sellShares: b.sell, netShares: b.buy - b.sell }))
    .filter((r) => r.buyShares > 0 || r.sellShares > 0)
    .sort((a, b) => Math.abs(b.netShares) - Math.abs(a.netShares));

  return {
    transactionCount: transactions.length,
    buyCount,
    sellCount,
    buyShares,
    sellShares,
    netShares: buyShares - sellShares,
    buyValue,
    sellValue,
    netValue,
    distinctBuyers: buyers.size,
    distinctSellers: sellers.size,
    openMarketBuyers: openBuyers.size,
    openMarketSellers: openSellers.size,
    clusterBuy: openBuyers.size >= CLUSTER_THRESHOLD,
    clusterSell: openSellers.size >= CLUSTER_THRESHOLD,
    valueComplete: (buyCount > 0 || sellCount > 0) && !unpricedDirectional,
    firstDate,
    lastDate,
    byRole,
  };
}
