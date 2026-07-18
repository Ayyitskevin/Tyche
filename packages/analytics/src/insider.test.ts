import { describe, it, expect } from 'vitest';
import type { InsiderTransaction } from '@tyche/contracts';
import { insiderActivity, insiderRole, CLUSTER_THRESHOLD } from './insider';

const tx = (o: Partial<InsiderTransaction>): InsiderTransaction => ({
  symbol: 'AAPL',
  owner: 'Jane',
  date: '2024-05-01',
  code: 'P',
  acquiredDisposed: 'A',
  shares: 100,
  form: '4',
  ...o,
});

describe('insiderRole', () => {
  it('buckets relationships into coarse roles', () => {
    expect(insiderRole('Chief Executive Officer')).toBe('Officer');
    expect(insiderRole('Director')).toBe('Director');
    expect(insiderRole('10% Owner')).toBe('10% Owner');
    expect(insiderRole('Beneficial Owner')).toBe('Other');
    expect(insiderRole(undefined)).toBe('Other');
  });
});

describe('insiderActivity', () => {
  it('is safe on an empty set', () => {
    const s = insiderActivity([]);
    expect(s).toMatchObject({ transactionCount: 0, netShares: 0, buyValue: null, sellValue: null, netValue: null, clusterBuy: false });
    expect(s.byRole).toEqual([]);
  });

  it('nets buys against sells and computes priced value', () => {
    const s = insiderActivity([
      tx({ owner: 'A', acquiredDisposed: 'A', shares: 1000, pricePerShare: 10, relationship: 'Director' }),
      tx({ owner: 'B', acquiredDisposed: 'A', shares: 500, pricePerShare: 10, relationship: 'CFO' }),
      tx({ owner: 'C', acquiredDisposed: 'D', shares: 300, pricePerShare: 20, relationship: 'Director' }),
    ]);
    expect(s.buyShares).toBe(1500);
    expect(s.sellShares).toBe(300);
    expect(s.netShares).toBe(1200);
    expect(s.buyValue).toBe(15000); // 1000*10 + 500*10
    expect(s.sellValue).toBe(6000); // 300*20
    expect(s.netValue).toBe(9000);
    expect(s.distinctBuyers).toBe(2);
    expect(s.distinctSellers).toBe(1);
  });

  it('flags a cluster buy at the threshold of distinct OPEN-MARKET (code P) buyers', () => {
    const buys = Array.from({ length: CLUSTER_THRESHOLD }, (_, i) => tx({ owner: `Insider${i}`, code: 'P', acquiredDisposed: 'A', shares: 100 }));
    expect(insiderActivity(buys).clusterBuy).toBe(true);
    expect(insiderActivity(buys.slice(0, CLUSTER_THRESHOLD - 1)).clusterBuy).toBe(false);
  });

  it('does NOT treat grants/awards (code A) as a cluster buy — only open-market purchases count', () => {
    const awards = Array.from({ length: CLUSTER_THRESHOLD + 2 }, (_, i) =>
      tx({ owner: `Grantee${i}`, code: 'A', acquiredDisposed: 'A', shares: 5000, relationship: 'Officer' }),
    );
    const s = insiderActivity(awards);
    expect(s.buyCount).toBe(CLUSTER_THRESHOLD + 2); // still counted as acquisitions
    expect(s.openMarketBuyers).toBe(0); // but none is an open-market purchase
    expect(s.clusterBuy).toBe(false); // so no false "insiders are buying" signal
  });

  it('marks valueComplete only when every directional transaction was priced', () => {
    const allPriced = insiderActivity([
      tx({ owner: 'A', acquiredDisposed: 'A', shares: 100, pricePerShare: 10 }),
      tx({ owner: 'B', acquiredDisposed: 'D', shares: 50, pricePerShare: 20 }),
    ]);
    expect(allPriced.valueComplete).toBe(true);

    const onePartial = insiderActivity([
      tx({ owner: 'A', acquiredDisposed: 'A', shares: 100, pricePerShare: 10 }),
      tx({ owner: 'B', acquiredDisposed: 'D', shares: 50, pricePerShare: null }), // unpriced disposal
    ]);
    expect(onePartial.valueComplete).toBe(false); // netValue would be one-sided; UI must flag it

    expect(insiderActivity([]).valueComplete).toBe(false); // no directional activity at all
  });

  it('counts non-directional transactions without attributing a side; null value when unpriced', () => {
    const s = insiderActivity([
      tx({ acquiredDisposed: null, shares: 999, form: '3' }), // initial statement, no A/D
      tx({ owner: 'A', acquiredDisposed: 'A', shares: 100, pricePerShare: null }), // unpriced buy
    ]);
    expect(s.transactionCount).toBe(2);
    expect(s.buyShares).toBe(100); // the null-A/D row is not attributed to a side
    expect(s.sellShares).toBe(0);
    expect(s.buyValue).toBeNull(); // no priced buy
    expect(s.netValue).toBeNull();
  });

  it('breaks down by role, biggest |net| first, dropping empty roles', () => {
    const s = insiderActivity([
      tx({ owner: 'A', acquiredDisposed: 'A', shares: 5000, relationship: 'Director' }),
      tx({ owner: 'B', acquiredDisposed: 'D', shares: 200, relationship: 'CFO' }),
    ]);
    expect(s.byRole[0]!.role).toBe('Director'); // |5000| > |200|
    expect(s.byRole.map((r) => r.role)).toEqual(['Director', 'Officer']);
    expect(s.byRole.find((r) => r.role === 'Officer')!.netShares).toBe(-200);
  });

  it('tracks the first and last transaction dates', () => {
    const s = insiderActivity([tx({ date: '2024-05-10' }), tx({ date: '2024-01-02' }), tx({ date: '2024-03-15' })]);
    expect(s.firstDate).toBe('2024-01-02');
    expect(s.lastDate).toBe('2024-05-10');
  });
});
