import type { ModulePanelProps } from '@tyche/module-sdk';
import {
  beta as computeBeta,
  finiteReturns,
  simpleReturns,
  closes,
  costOfEquity,
  wacc,
  bundlePeriods,
  lineItem,
} from '@tyche/analytics';
import { formatPercent } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useReportProvenance, useReportSummary } from './common';

const MM = 1_000_000;
const BENCHMARK = 'SPY';

interface WaccSeeds {
  beta: number | null;
  marketCap: number | null;
  debt: number | null;
}

function noSeed(): Promise<EnvelopeResult<WaccSeeds>> {
  return Promise.resolve({ ok: false, error: { kind: 'none', message: '' }, provenance: null });
}

/** Best-effort seeds for a ticker: β vs the benchmark, market cap, and total debt. */
async function loadSeeds(symbol: string): Promise<EnvelopeResult<WaccSeeds>> {
  const [hist, bench, inst, fin] = await Promise.all([
    api.getHistory(symbol, { range: '5y', interval: '1d' }),
    api.getHistory(BENCHMARK, { range: '5y', interval: '1d' }),
    api.getInstrument(symbol),
    api.getFinancials(symbol, { period: 'annual' }),
  ]);

  let betaVal: number | null = null;
  if (hist.ok && bench.ok) {
    const a = finiteReturns(simpleReturns(closes(hist.data.candles)));
    const b = finiteReturns(simpleReturns(closes(bench.data.candles)));
    const n = Math.min(a.length, b.length);
    if (n > 20) betaVal = computeBeta(a.slice(a.length - n), b.slice(b.length - n));
  }
  const marketCap = inst.ok ? (inst.data.marketCap ?? null) : null;
  const debt = fin.ok ? lineItem(bundlePeriods(fin.data)[0]?.balance, 'totalDebt') : null;
  return { ok: true, data: { beta: betaVal, marketCap, debt }, provenance: hist.ok ? hist.provenance : null };
}

export function WaccModule({ symbol, state, setState, reportProvenance, reportSummary }: ModulePanelProps) {
  const seeds = useApiData<WaccSeeds>(() => (symbol ? loadSeeds(symbol) : noSeed()), [symbol]);
  useReportProvenance(reportProvenance, seeds.provenance);

  const seededBeta = seeds.data?.beta ?? null;
  const seededMktCap = seeds.data?.marketCap ?? null;
  const seededDebt = seeds.data?.debt ?? null;

  const num = (key: string, def: number): number => {
    const v = state[key];
    const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : def;
  };
  const rf = num('rf', 4.0);
  const betaInput = num('beta', seededBeta === null ? 1.0 : Math.round(seededBeta * 100) / 100);
  const erp = num('erp', 5.0);
  const pretaxDebt = num('costDebt', 5.0);
  const tax = num('tax', 21);
  const equityM = num('equity', seededMktCap === null ? 800 : Math.round(seededMktCap / MM));
  const debtM = num('debt', seededDebt === null ? 200 : Math.round(seededDebt / MM));

  const coe = costOfEquity({ riskFreeRate: rf / 100, beta: betaInput, equityRiskPremium: erp / 100 });
  const wb = wacc({
    costOfEquity: coe,
    pretaxCostOfDebt: pretaxDebt / 100,
    taxRate: tax / 100,
    equityValue: equityM,
    debtValue: debtM,
  });

  useReportSummary(
    reportSummary,
    wb.wacc !== null ? `${symbol ?? 'WACC'} WACC ≈ ${formatPercent(wb.wacc * 100)}` : null,
  );

  const field = (key: string, label: string, value: number, step: string, suffix?: string) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
        {suffix ? <span className="text-zinc-600"> {suffix}</span> : null}
      </span>
      <input
        type="number"
        step={step}
        aria-label={label}
        value={String(state[key] ?? value)}
        onChange={(e) => setState({ [key]: e.target.value })}
        className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-xs text-zinc-100 focus:border-sky-500/40 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex items-baseline justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="text-sm text-zinc-200">
          WACC · <span className="text-zinc-400">{symbol ?? 'sandbox'}</span>
        </span>
        {symbol && seeds.loading ? (
          <span className="text-[10px] text-zinc-600">seeding…</span>
        ) : symbol && seededBeta !== null ? (
          <span className="text-[10px] text-zinc-600">β from 5y vs {BENCHMARK}</span>
        ) : null}
      </div>

      {/* CAPM cost-of-equity inputs */}
      <div className="grid grid-cols-3 gap-2 px-3 pt-2">
        {field('rf', 'Risk-free', rf, '0.1', '%')}
        {field('beta', 'Beta', betaInput, '0.05')}
        {field('erp', 'Equity prem', erp, '0.25', '%')}
      </div>
      {/* Debt + capital structure inputs */}
      <div className="grid grid-cols-4 gap-2 px-3 pt-2">
        {field('costDebt', 'Cost debt', pretaxDebt, '0.25', '%')}
        {field('tax', 'Tax', tax, '1', '%')}
        {field('equity', 'Equity', equityM, '10', '$M')}
        {field('debt', 'Debt', debtM, '10', '$M')}
      </div>

      <div className="mt-2 border-t border-zinc-900 px-3 py-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
          <Row label="Cost of equity" value={formatPercent(coe * 100)} />
          <Row label="After-tax cost of debt" value={formatPercent(wb.afterTaxCostOfDebt * 100)} muted />
          <Row label="Weight equity" value={wb.weightEquity === null ? '—' : formatPercent(wb.weightEquity * 100)} muted />
          <Row label="Weight debt" value={wb.weightDebt === null ? '—' : formatPercent(wb.weightDebt * 100)} muted />
          <Row label="WACC" value={wb.wacc === null ? '—' : formatPercent(wb.wacc * 100)} strong />
        </dl>
        <p className="mt-2 text-[10px] text-zinc-600">
          Use the WACC as the discount rate in a <span className="text-zinc-400">DCF</span> valuation.
        </p>
      </div>

      <p className="mt-auto px-3 py-2 text-[10px] leading-snug text-zinc-600">
        Educational CAPM cost of equity (r_f + β·ERP) and value-weighted WACC with a debt tax shield.
        Not investment advice.
      </p>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={strong ? 'text-sky-200' : muted ? 'text-zinc-500' : 'text-zinc-300'}>{value}</dd>
    </div>
  );
}
