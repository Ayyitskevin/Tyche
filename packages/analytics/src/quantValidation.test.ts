/**
 * Cross-module golden fixtures, degenerate (unavailable ≠ 0) cases, and
 * metamorphic / property-style invariants for the representative analytics set.
 * Drives the real shipped entry points — never re-implements the formulas.
 */
import { describe, it, expect } from 'vitest';
import type { Candle, FundingRate, OrderBook } from '@tyche/contracts';
import { discountedCashFlow, impliedGrowthRate, type DcfInputs } from './dcf';
import { costOfEquity, costOfEquityAnnotated, wacc } from './capm';
import { correlation, correlationMatrix, beta } from './portfolioRisk';
import { marketSensitivity } from './marketBeta';
import { altmanZScore, beneishMScore, piotroskiFScore } from './scoring';
import { compMultiples, type CompFinancials } from './relativeValue';
import { fundingAnalytics } from './fundingAnalytics';
import { bookAnalytics, costToFill } from './bookAnalytics';
import { tradeFlow } from './tradeFlow';
import { dexAnalytics } from './dexAnalytics';
import { performanceStats } from './performance';
import { sharpeRatio } from './risk';
import { annualizeFundingPct, reconciles, unavailableNotZero } from './validation';
import { formulasNeedingReview, getFormula } from './formulas';
import type { PeriodBundle } from './fundamentals';
import type { FinancialStatement, DexPool, TradePrint } from '@tyche/contracts';

// --- helpers ----------------------------------------------------------------

const c = (t: string, close: number): Candle => ({
  t: `${t}T00:00:00.000Z`,
  o: close,
  h: close,
  l: close,
  c: close,
});

function stmt(
  type: FinancialStatement['type'],
  fiscalDate: string,
  items: Record<string, number>,
): FinancialStatement {
  return {
    symbol: 'TEST',
    type,
    period: 'annual',
    fiscalDate,
    currency: 'USD',
    lineItems: Object.entries(items).map(([key, value], i) => ({ key, label: key, value, order: i })),
  };
}

function bundle(
  fiscalDate: string,
  income: Record<string, number>,
  balance: Record<string, number>,
  cashFlow: Record<string, number> = {},
): PeriodBundle {
  return {
    fiscalDate,
    income: stmt('income', fiscalDate, income),
    balance: stmt('balance', fiscalDate, balance),
    cashFlow: stmt('cash_flow', fiscalDate, cashFlow),
  };
}

// --- golden fixtures --------------------------------------------------------

describe('golden: DCF + reverse DCF', () => {
  // Hand-checkable (same fixture as dcf.test.ts, re-asserted here with meta):
  //   FCF1=110 pv=100, FCF2=121 pv=100 → sumPv=200
  //   TV=121*1.02/(0.10-0.02)=1542.75, pvTV=1275, EV=1475, /10 = 147.5
  const base: DcfInputs = {
    baseFcf: 100,
    forecastYears: 2,
    growthRate: 0.1,
    terminalGrowthRate: 0.02,
    discountRate: 0.1,
    netDebt: 0,
    sharesOutstanding: 10,
  };

  it('matches the hand-derived equity value and stamps formula provenance', () => {
    const r = discountedCashFlow(base);
    expect(r.equityValue).toBeCloseTo(1475, 4);
    expect(r.fairValuePerShare).toBeCloseTo(147.5, 4);
    expect(r.meta.formulaId).toBe('dcf.gordon-growth.v1');
    expect(r.meta.status).toBe('estimated');
    expect(r.meta.units).toBe('currency');
    // Component reconciliation: EV = sumPvFcf + pvTerminal
    expect(reconciles(r.enterpriseValue, [r.sumPvFcf, r.pvTerminalValue!], 1e-6)).toBe(true);
  });

  it('marks divergent terminals unavailable (not zero equity)', () => {
    const r = discountedCashFlow({ ...base, discountRate: 0.02, terminalGrowthRate: 0.02 });
    expect(r.terminalValue).toBeNull();
    expect(r.equityValue).toBeNull();
    expect(r.meta.status).toBe('unavailable');
    expect(unavailableNotZero(r.equityValue)).toBe(true);
  });

  it('reverse DCF recovers growth and nulls non-positive base FCF', () => {
    const equity = discountedCashFlow(base).equityValue!;
    expect(impliedGrowthRate(base, equity)).toBeCloseTo(0.1, 4);
    expect(impliedGrowthRate({ ...base, baseFcf: 0 }, equity)).toBeNull();
  });
});

describe('golden: CAPM + WACC', () => {
  it('cost of equity is r_f + β·ERP with annotated provenance', () => {
    expect(costOfEquity({ riskFreeRate: 0.04, beta: 1.2, equityRiskPremium: 0.05 })).toBeCloseTo(0.1, 6);
    const a = costOfEquityAnnotated({ riskFreeRate: 0.04, beta: 1.2, equityRiskPremium: 0.05 });
    expect(a.value).toBeCloseTo(0.1, 6);
    expect(a.meta.formulaId).toBe('capm.cost-of-equity.v1');
    expect(a.meta.units).toBe('ratio');
  });

  it('WACC golden: 0.8·0.10 + 0.2·0.0395 = 0.0879 and unit-invariant', () => {
    const r = wacc({
      costOfEquity: 0.1,
      pretaxCostOfDebt: 0.05,
      taxRate: 0.21,
      equityValue: 800,
      debtValue: 200,
    });
    expect(r.wacc).toBeCloseTo(0.0879, 6);
    expect(r.meta.formulaId).toBe('capm.wacc.v1');
    expect(r.meta.status).toBe('estimated');
    // Invariance under equivalent capital units (×0.01)
    const scaled = wacc({
      costOfEquity: 0.1,
      pretaxCostOfDebt: 0.05,
      taxRate: 0.21,
      equityValue: 8,
      debtValue: 2,
    });
    expect(scaled.wacc).toBeCloseTo(r.wacc!, 6);
  });

  it('WACC is unavailable (null) when total capital is zero — not a zero rate', () => {
    const r = wacc({
      costOfEquity: 0.1,
      pretaxCostOfDebt: 0.05,
      taxRate: 0.21,
      equityValue: 0,
      debtValue: 0,
    });
    expect(r.wacc).toBeNull();
    expect(r.meta.status).toBe('unavailable');
    expect(unavailableNotZero(r.wacc)).toBe(true);
  });
});

describe('golden + metamorphic: correlation / beta', () => {
  const a = [0.01, -0.02, 0.03, -0.01, 0.02];
  const twice = a.map((x) => 2 * x);
  const inv = a.map((x) => -x);

  it('perfect positive / negative correlation goldens', () => {
    expect(correlation(a, twice)).toBeCloseTo(1, 6);
    expect(correlation(a, inv)).toBeCloseTo(-1, 6);
    expect(beta(twice, a)).toBeCloseTo(2, 6);
  });

  it('symmetry and boundedness (metamorphic)', () => {
    for (let i = 0; i < 20; i++) {
      const x = Array.from({ length: 8 }, () => (Math.sin(i + 1) * (i + 1) * 0.01) % 0.05);
      const y = Array.from({ length: 8 }, (_, k) => Math.cos(i + k) * 0.02);
      const rxy = correlation(x, y);
      const ryx = correlation(y, x);
      if (rxy === null) {
        expect(ryx).toBeNull();
        continue;
      }
      expect(ryx).toBeCloseTo(rxy, 10);
      expect(rxy).toBeGreaterThanOrEqual(-1);
      expect(rxy).toBeLessThanOrEqual(1);
    }
  });

  it('flat series → null (unavailable ≠ 0)', () => {
    expect(correlation(a, [0, 0, 0, 0, 0])).toBeNull();
    expect(beta(a, [0, 0, 0, 0, 0])).toBeNull();
    const m = correlationMatrix([a, [0, 0, 0, 0, 0]]);
    expect(m[1]![1]).toBeNull(); // flat self-correlation is unavailable, not 0
    expect(m[0]![1]).toBeNull();
  });

  it('marketSensitivity date-aligns and nulls flat benchmarks', () => {
    const bench = [c('2024-01-02', 100), c('2024-01-03', 110), c('2024-01-04', 104.5), c('2024-01-05', 106.59)];
    const asset = [c('2024-01-02', 100), c('2024-01-03', 120), c('2024-01-04', 108), c('2024-01-05', 112.32)];
    const s = marketSensitivity(asset, bench, 'AAPL', 'SPY');
    expect(s.beta).toBeCloseTo(2, 6);
    expect(s.correlation).toBeCloseTo(1, 6);
    expect(s.meta.formulaId).toBe('risk.market-sensitivity.v1');
    expect(s.meta.status).toBe('estimated');

    const flat = marketSensitivity(asset, [c('2024-01-02', 50), c('2024-01-03', 50), c('2024-01-04', 50)], 'AAPL', 'SPY');
    expect(flat.beta).toBeNull();
    expect(flat.meta.status).toBe('unavailable');
  });
});

describe('metamorphic: higher WACC → lower DCF equity (other inputs fixed)', () => {
  const base: DcfInputs = {
    baseFcf: 100,
    forecastYears: 5,
    growthRate: 0.08,
    terminalGrowthRate: 0.025,
    discountRate: 0.09,
  };

  it('is strictly decreasing in discount rate over a valid range', () => {
    const rates = [0.07, 0.08, 0.09, 0.1, 0.12];
    const values = rates.map((discountRate) => discountedCashFlow({ ...base, discountRate }).equityValue);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).not.toBeNull();
      expect(values[i - 1]).not.toBeNull();
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });
});

describe('golden + reconciliation: Altman / Piotroski / Beneish', () => {
  // Hand-built balance + income so every Altman component is defined.
  const healthy = bundle(
    '2024-12-31',
    { totalRevenue: 1000, operatingIncome: 150, netIncome: 100, grossProfit: 400, sellingGeneralAdmin: 80 },
    {
      totalAssets: 1000,
      currentAssets: 400,
      currentLiabilities: 200,
      retainedEarnings: 300,
      totalLiabilities: 400,
      totalEquity: 600,
      totalDebt: 250,
      accountsReceivable: 80,
      propertyPlantEquipment: 300,
      sharesOutstanding: 100,
    },
    { operatingCashFlow: 120, depreciationAmortization: 40 },
  );
  const prior = bundle(
    '2023-12-31',
    { totalRevenue: 900, operatingIncome: 120, netIncome: 80, grossProfit: 350, sellingGeneralAdmin: 70 },
    {
      totalAssets: 900,
      currentAssets: 350,
      currentLiabilities: 200,
      retainedEarnings: 250,
      totalLiabilities: 400,
      totalEquity: 500,
      totalDebt: 260,
      accountsReceivable: 70,
      propertyPlantEquipment: 280,
      sharesOutstanding: 100,
    },
    { operatingCashFlow: 90, depreciationAmortization: 35 },
  );

  it('Altman Z′ reconciles score to weighted components', () => {
    const z = altmanZScore(healthy);
    expect(z.complete).toBe(true);
    expect(z.score).not.toBeNull();
    expect(z.meta.formulaId).toBe('scoring.altman-z-prime.v1');
    expect(z.meta.status).toBe('estimated');
    // score is rounded to 2dp — reconcile unrounded contributions then allow 0.01
    const sum = z.components.reduce((s, c) => s + (c.contribution as number), 0);
    expect(Math.abs(z.score! - Math.round(sum * 100) / 100)).toBeLessThanOrEqual(0.011);
    expect(reconciles(sum, z.components.map((c) => c.contribution), 1e-9)).toBe(true);
  });

  it('Altman withholds score when any line item is missing (all-or-null)', () => {
    const incomplete = bundle('2024-12-31', { totalRevenue: 1000 }, { totalAssets: 1000 });
    const z = altmanZScore(incomplete);
    expect(z.complete).toBe(false);
    expect(z.score).toBeNull();
    expect(z.meta.status === 'partial' || z.meta.status === 'unavailable').toBe(true);
    expect(unavailableNotZero(z.score)).toBe(true);
  });

  it('Piotroski counts only evaluable passes; band null when incomplete', () => {
    const f = piotroskiFScore(healthy, prior);
    expect(f.complete).toBe(true);
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(9);
    expect(f.meta.formulaId).toBe('scoring.piotroski-f.v1');
    // Only current year → YoY signals null, not fabricated fails
    const partial = piotroskiFScore(healthy, undefined);
    expect(partial.complete).toBe(false);
    expect(partial.band).toBeNull();
    expect(partial.meta.status).toBe('partial');
  });

  it('Beneish M reconciles M = −4.84 + Σ(weight·index) when complete', () => {
    const m = beneishMScore(healthy, prior);
    expect(m.complete).toBe(true);
    expect(m.score).not.toBeNull();
    expect(m.meta.formulaId).toBe('scoring.beneish-m.v1');
    const raw = -4.84 + m.components.reduce((s, c) => s + (c.contribution as number), 0);
    expect(m.score).toBeCloseTo(Math.round(raw * 100) / 100, 6);
  });
});

describe('golden: peer comps multiples', () => {
  const full: CompFinancials = {
    symbol: 'AAA',
    marketCap: 1000,
    revenue: 500,
    priorRevenue: 400,
    netIncome: 100,
    operatingIncome: 120,
    grossProfit: 300,
    depreciationAmortization: 30,
    totalEquity: 400,
    totalDebt: 200,
    cash: 50,
    freeCashFlow: 80,
  };

  it('hand-checkable multiples with provenance', () => {
    const r = compMultiples(full);
    expect(r.pe).toBeCloseTo(10, 6);
    expect(r.ps).toBeCloseTo(2, 6);
    expect(r.enterpriseValue).toBeCloseTo(1150, 6);
    expect(r.meta.formulaId).toBe('comps.multiples.v1');
    expect(r.meta.status).toBe('estimated');
  });

  it('loss-making P/E is null, not a negative multiple', () => {
    const r = compMultiples({ ...full, netIncome: -20 });
    expect(r.pe).toBeNull();
    expect(unavailableNotZero(r.pe)).toBe(true);
  });
});

describe('golden: funding carry + book depth', () => {
  it('funding annualization matches contract and stamps meta', () => {
    const rates: FundingRate[] = [
      {
        symbol: 'BTC-USDT',
        venue: 'binance',
        rate: 0.0001,
        intervalHours: 8,
        annualizedPct: annualizeFundingPct(0.0001, 8)!,
        asOf: '2026-07-19T00:00:00.000Z',
        markPrice: 101,
        indexPrice: 100,
      },
    ];
    const a = fundingAnalytics(rates);
    expect(a.rows[0]!.annualizedPct).toBeCloseTo(10.95, 6);
    expect(a.rows[0]!.dailyPct).toBeCloseTo(0.03, 6);
    expect(a.rows[0]!.premiumBps).toBeCloseTo(100, 6);
    expect(a.meta.formulaId).toBe('funding.carry.v1');
    expect(fundingAnalytics([]).meta.status).toBe('unavailable');
  });

  it('book mid/spread/slippage null when a side is missing', () => {
    const book: OrderBook = {
      symbol: 'BTC-USDT',
      timestamp: '2026-07-19T00:00:00.000Z',
      bids: [{ price: 100, size: 1 }],
      asks: [{ price: 101, size: 1 }],
    };
    const a = bookAnalytics(book);
    expect(a.mid).toBe(100.5);
    expect(a.spreadBps).toBeCloseTo((1 / 100.5) * 10000, 4);
    expect(a.meta.formulaId).toBe('book.depth-slippage.v1');
    expect(a.meta.status).toBe('estimated');

    const oneSided = bookAnalytics({ ...book, asks: [] });
    expect(oneSided.mid).toBeNull();
    expect(oneSided.meta.status).toBe('unavailable');
  });

  it('costToFill never fabricates a price beyond book depth', () => {
    const book: OrderBook = {
      symbol: 'X',
      timestamp: '2026-07-19T00:00:00.000Z',
      bids: [{ price: 99, size: 1 }],
      asks: [{ price: 101, size: 1 }], // only 101 notional on the ask
    };
    const fill = costToFill(book, 'buy', 500);
    expect(fill.filled).toBe(false);
    expect(fill.filledNotional).toBeCloseTo(101, 6);
    expect(fill.avgPrice).toBeCloseTo(101, 6);
  });

  it('one-sided book costToFill returns null avgPrice (unavailable ≠ 0)', () => {
    const book: OrderBook = {
      symbol: 'X',
      timestamp: '2026-07-19T00:00:00.000Z',
      bids: [{ price: 99, size: 1 }],
      asks: [],
    };
    const fill = costToFill(book, 'buy', 100);
    expect(fill.avgPrice).toBeNull();
    expect(fill.slippageBps).toBeNull();
    expect(unavailableNotZero(fill.avgPrice)).toBe(true);
  });
});

describe('golden: trade flow + DEX + performance + Sharpe null discipline', () => {
  it('tradeFlow VWAP golden and empty ratios stay null with provenance', () => {
    const tape: TradePrint[] = [
      { symbol: 'X', timestamp: '2026-07-19T00:00:00.000Z', price: 100, size: 10, side: 'buy' },
      { symbol: 'X', timestamp: '2026-07-19T00:00:01.000Z', price: 101, size: 10, side: 'sell' },
    ];
    const f = tradeFlow(tape);
    expect(f.vwap).toBeCloseTo(100.5, 6);
    expect(f.buyShare).toBeCloseTo(0.5, 6);
    expect(f.netVolume).toBe(0);
    expect(f.meta.formulaId).toBe('flow.trade-tape.v1');
    expect(f.meta.status).toBe('estimated');
    expect(tradeFlow([]).vwap).toBeNull();
    expect(tradeFlow([]).meta.status).toBe('unavailable');
  });

  it('dexAnalytics never treats missing liquidity as zero depth', () => {
    const base = { symbol: 'AAA', name: 'A', address: '0xa' };
    const quote = { symbol: 'BBB', name: 'B', address: '0xb' };
    const pools: DexPool[] = [
      {
        pairAddress: '0x1',
        dex: 'uni',
        chain: 'ethereum',
        baseToken: base,
        quoteToken: quote,
        priceUsd: 2,
        liquidityUsd: 1000,
        volume24hUsd: 100,
        buys24h: 10,
        sells24h: 5,
        change24hPct: null,
        fdvUsd: null,
        url: null,
        asOf: '2026-07-19T00:00:00.000Z',
      },
      {
        pairAddress: '0x2',
        dex: 'sushi',
        chain: 'ethereum',
        baseToken: base,
        quoteToken: quote,
        priceUsd: 2.1,
        liquidityUsd: null,
        volume24hUsd: 50,
        buys24h: null,
        sells24h: null,
        change24hPct: null,
        fdvUsd: null,
        url: null,
        asOf: '2026-07-19T00:00:00.000Z',
      },
    ];
    const d = dexAnalytics(pools);
    // LWAP uses only the pool with positive liquidity.
    expect(d.lwapUsd).toBeCloseTo(2, 6);
    expect(d.totalLiquidityUsd).toBeCloseTo(1000, 6);
    expect(d.rows.find((r) => r.dex === 'sushi')!.liquidityShare).toBeNull();
    expect(d.meta.formulaId).toBe('dex.pool-structure.v1');
    expect(dexAnalytics([]).meta.status).toBe('unavailable');
  });

  it('performance and sharpe stamp meta; flat series sharpe is null', () => {
    const candles = [
      c('2024-01-02', 100),
      c('2024-01-03', 110),
      c('2024-01-04', 105),
      c('2024-06-01', 120),
    ];
    const s = performanceStats(candles, 'TEST');
    expect(s.meta.formulaId).toBe('risk.performance.v1');
    // Mixed-unit bundle: per-field units, not a single misleading top-level units.
    expect(s.meta.units).toBeUndefined();
    expect(s.meta.fieldUnits?.lastPrice).toBe('currency');
    expect(s.meta.fieldUnits?.sharpe).toBe('dimensionless');
    expect(s.meta.asOf).toBe('2024-06-01');
    expect(s.meta.status).toBe('estimated');
    expect(s.sharpe).not.toBeNull();
    const flat = [c('2024-01-02', 50), c('2024-01-03', 50), c('2024-01-04', 50)];
    const flatStats = performanceStats(flat, 'FLAT');
    expect(flatStats.sharpe).toBeNull();
    expect(flatStats.meta.status).not.toBe('estimated');
    expect(unavailableNotZero(flatStats.sharpe)).toBe(true);
    expect(sharpeRatio([0, 0, 0])).toBeNull();
    expect(unavailableNotZero(sharpeRatio([0, 0, 0]))).toBe(true);
  });

  it('trade/DEX/performance formula ids stay registered with authority and units', () => {
    for (const id of ['flow.trade-tape.v1', 'dex.pool-structure.v1', 'risk.performance.v1', 'risk.sharpe.v1']) {
      const f = getFormula(id);
      expect(f, id).toBeDefined();
      expect(f!.authority).toBeTruthy();
      expect(f!.needsHumanReview).toBe(false);
      expect(f!.disclaimer.toLowerCase()).toMatch(/not investment advice/);
      expect(f!.units).toBeTruthy();
    }
    expect(formulasNeedingReview().map((f) => f.id)).not.toContain('flow.trade-tape.v1');
  });
});
