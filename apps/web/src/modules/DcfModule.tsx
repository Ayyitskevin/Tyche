import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Instrument, FinancialStatement } from '@tyche/contracts';
import {
  discountedCashFlow,
  impliedGrowthRate,
  dcfSensitivity,
  bundlePeriods,
  lineItem,
  type DcfInputs,
} from '@tyche/analytics';
import { changeToneClass, formatCurrency, formatPercent, formatSigned } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useReportProvenance, useReportSummary } from './common';

/** A resolved no-op envelope so a bare `DCF` (no ticker) seeds from defaults, not an error. */
function noSeed<T>(): Promise<EnvelopeResult<T>> {
  return Promise.resolve({ ok: false, error: { kind: 'none', message: '' }, provenance: null });
}

const MM = 1_000_000; // money & share inputs are entered in millions

function round0(n: number): number {
  return Math.round(n);
}

/**
 * DCF — a discounted-cash-flow valuation sandbox. Assumptions (growth, terminal
 * growth, WACC, horizon) and facts (base FCF, shares, net debt) are editable and
 * persist in panel state; when a ticker is supplied they seed best-effort from its
 * latest annual filing and security master. The panel shows the intrinsic value
 * breakdown, upside vs. the current price, the reverse-DCF market-implied growth,
 * and a WACC × terminal-growth sensitivity grid. Research-only; no advice.
 */
export function DcfModule({ symbol, state, setState, reportProvenance, reportSummary }: ModulePanelProps) {
  const instrument = useApiData<Instrument>(
    () => (symbol ? api.getInstrument(symbol) : noSeed<Instrument>()),
    [symbol],
  );
  const financials = useApiData<FinancialStatement[]>(
    () => (symbol ? api.getFinancials(symbol, { period: 'annual' }) : noSeed<FinancialStatement[]>()),
    [symbol],
  );
  useReportProvenance(reportProvenance, financials.provenance ?? instrument.provenance);

  // Best-effort seeds from the most recent annual bundle + security master.
  const latest = bundlePeriods(financials.data ?? [])[0];
  const seedFcf = lineItem(latest?.cashFlow, 'freeCashFlow');
  const seedDebt = lineItem(latest?.balance, 'totalDebt');
  const seedCash = lineItem(latest?.balance, 'cashAndEquivalents');
  const seedNetDebt = seedDebt === null ? null : seedDebt - (seedCash ?? 0);
  const seedShares = instrument.data?.sharesOutstanding ?? null;
  const marketCap = instrument.data?.marketCap ?? null;

  // Editable inputs: persisted override wins, else the seed, else a sandbox default.
  const num = (key: string, def: number): number => {
    const v = state[key];
    const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : def;
  };
  const baseFcfM = num('baseFcf', seedFcf === null ? 1000 : round0(seedFcf / MM));
  const sharesM = num('shares', seedShares === null ? 1000 : round0(seedShares / MM));
  const netDebtM = num('netDebt', seedNetDebt === null ? 0 : round0(seedNetDebt / MM));
  const years = Math.max(1, Math.round(num('years', 10)));
  const growthPct = num('growth', 8);
  const terminalPct = num('terminal', 2.5);
  const waccPct = num('wacc', 9);

  const inputs: DcfInputs = {
    baseFcf: baseFcfM * MM,
    forecastYears: years,
    growthRate: growthPct / 100,
    terminalGrowthRate: terminalPct / 100,
    discountRate: waccPct / 100,
    netDebt: netDebtM * MM,
    sharesOutstanding: sharesM > 0 ? sharesM * MM : undefined,
  };
  const result = discountedCashFlow(inputs);
  const impliedGrowth = marketCap === null ? null : impliedGrowthRate(inputs, marketCap);
  const currentPrice = marketCap !== null && sharesM > 0 ? marketCap / (sharesM * MM) : null;
  const upside =
    result.fairValuePerShare !== null && currentPrice ? result.fairValuePerShare / currentPrice - 1 : null;

  useReportSummary(
    reportSummary,
    result.fairValuePerShare !== null
      ? `${symbol ?? 'DCF'} intrinsic value ≈ ${formatCurrency(result.fairValuePerShare)}/sh${
          upside !== null ? ` (${formatSigned(upside * 100)}% vs price)` : ''
        }`
      : result.equityValue !== null
        ? `${symbol ?? 'DCF'} equity value ≈ ${formatCurrency(result.equityValue, 'USD', { compact: true })}`
        : null,
  );

  const money = formatMoney;
  const waccRates = [-2, -1, 0, 1, 2].map((d) => (waccPct + d) / 100);
  const termRates = [-1, -0.5, 0, 0.5, 1].map((d) => (terminalPct + d) / 100);
  const grid = dcfSensitivity(inputs, waccRates, termRates);
  const perShareCell = (equity: number | null): number | null =>
    equity === null || sharesM <= 0 ? null : equity / (sharesM * MM);

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
          DCF · <span className="text-zinc-400">{symbol ?? 'sandbox'}</span>
        </span>
        {symbol && (instrument.loading || financials.loading) ? (
          <span className="text-[10px] text-zinc-600">seeding…</span>
        ) : symbol && seedFcf !== null ? (
          <span className="text-[10px] text-zinc-600">seeded from latest annual filing</span>
        ) : null}
      </div>

      {/* Assumptions */}
      <div className="grid grid-cols-4 gap-2 px-3 pt-2">
        {field('growth', 'Growth', growthPct, '0.5', '%/yr')}
        {field('terminal', 'Terminal g', terminalPct, '0.25', '%')}
        {field('wacc', 'Discount', waccPct, '0.25', '% WACC')}
        {field('years', 'Horizon', years, '1', 'yrs')}
      </div>
      {/* Facts (seeded, editable) */}
      <div className="grid grid-cols-3 gap-2 px-3 pt-2">
        {field('baseFcf', 'Base FCF', baseFcfM, '10', '$M')}
        {field('netDebt', 'Net debt', netDebtM, '10', '$M')}
        {field('shares', 'Shares', sharesM, '1', 'M')}
      </div>

      {/* Valuation output */}
      <div className="mt-2 border-t border-zinc-900 px-3 py-2">
        {result.enterpriseValue === null ? (
          <p className="text-[11px] text-amber-400/80">
            The discount rate must exceed the terminal growth rate for a finite valuation.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
            <Row label="Enterprise value" value={money(result.enterpriseValue)} />
            <Row label="− Net debt" value={money(netDebtM * MM)} />
            <Row label="Equity value" value={money(result.equityValue)} strong />
            <Row label="PV of terminal" value={money(result.pvTerminalValue)} muted />
            <Row
              label="Fair value / share"
              value={result.fairValuePerShare === null ? '—' : formatCurrency(result.fairValuePerShare)}
              strong
            />
            <Row
              label="Current price"
              value={currentPrice === null ? '—' : formatCurrency(currentPrice)}
              muted
            />
            {upside !== null ? (
              <div className="flex items-baseline justify-between">
                <dt className="text-zinc-500">Upside to fair value</dt>
                <dd className={changeToneClass(upside)}>{formatSigned(upside * 100)}%</dd>
              </div>
            ) : null}
            {impliedGrowth !== null ? (
              <Row label="Market-implied growth" value={`${formatPercent(impliedGrowth * 100)}/yr`} muted />
            ) : null}
          </dl>
        )}
      </div>

      {/* Sensitivity: WACC (rows) × terminal growth (cols) */}
      <div className="mt-1 px-3 pb-1">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
          {sharesM > 0 ? 'Fair value / share' : 'Equity value'} — WACC × terminal growth
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse font-mono text-[10px]">
            <thead>
              <tr>
                <th className="px-1.5 py-0.5 text-left text-zinc-600">WACC \ g</th>
                {termRates.map((t) => (
                  <th key={t} className="px-1.5 py-0.5 text-right text-zinc-500">
                    {formatPercent(t * 100, 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => (
                <tr key={waccRates[ri]} className="border-t border-zinc-900">
                  <td className="px-1.5 py-0.5 text-zinc-500">{formatPercent(waccRates[ri]! * 100, 1)}</td>
                  {row.map((cell, ci) => {
                    const shown = sharesM > 0 ? perShareCell(cell) : cell;
                    const isBase = waccRates[ri] === waccPct / 100 && termRates[ci] === terminalPct / 100;
                    return (
                      <td
                        key={ci}
                        className={`px-1.5 py-0.5 text-right ${
                          isBase ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-300'
                        }`}
                      >
                        {shown === null
                          ? '—'
                          : sharesM > 0
                            ? formatCurrency(shown)
                            : formatCurrency(shown, 'USD', { compact: true })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-auto px-3 py-2 text-[10px] leading-snug text-zinc-600">
        Educational two-stage discounted-cash-flow estimate (Gordon-growth terminal value). Reverse DCF
        infers the growth the current price implies. Not investment advice; Tyche places no orders.
      </p>
    </div>
  );
}

function formatMoney(value: number | null): string {
  return value === null ? '—' : formatCurrency(value, 'USD', { compact: true });
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={strong ? 'text-zinc-100' : muted ? 'text-zinc-500' : 'text-zinc-300'}>{value}</dd>
    </div>
  );
}
