import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Quote } from '@tyche/contracts';
import { blackScholes, type OptionType } from '@tyche/analytics';
import { changeToneClass, formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useReportSummary } from './common';

function noQuote(): Promise<EnvelopeResult<Quote>> {
  return Promise.resolve({ ok: false, error: { kind: 'none', message: '' }, provenance: null });
}

export function OptionPricerModule({ symbol, state, setState, reportSummary }: ModulePanelProps) {
  // Best-effort spot prefill from the active symbol; never required (works offline).
  const quote = useApiData(() => (symbol ? api.getQuote(symbol) : noQuote()), [symbol]);
  const spotDefault = quote.data?.price ?? 100;

  const str = (key: string, def: string): string => {
    const v = state[key];
    return v != null ? String(v) : def;
  };
  const num = (key: string, def: number): number => {
    const v = Number.parseFloat(str(key, String(def)));
    return Number.isFinite(v) ? v : def;
  };

  const type = ((state.type as OptionType | undefined) ?? 'call') as OptionType;
  const spot = num('spot', spotDefault);
  const strike = num('strike', Math.round(spotDefault));
  const days = num('days', 30);
  const volPct = num('vol', 25);
  const ratePct = num('rate', 4);
  const divPct = num('div', 0);

  const v = blackScholes({
    spot,
    strike,
    timeYears: Math.max(0, days) / 365,
    rate: ratePct / 100,
    vol: volPct / 100,
    dividendYield: divPct / 100,
    type,
  });
  const timeValue = v.price - v.intrinsic;

  useReportSummary(
    reportSummary,
    `OVME ${type} ${symbol ?? ''} S=${formatNumber(spot)} K=${formatNumber(strike)} ${days}d vol=${volPct}% → value ${formatNumber(v.price)}, Δ ${formatNumber(v.delta, { decimals: 3 })}`,
  );

  const field = (key: string, label: string, def: number, step = '1') => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <input
        type="number"
        step={step}
        aria-label={label}
        value={str(key, String(def))}
        onChange={(e) => setState({ [key]: e.target.value })}
        className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-xs text-zinc-100 focus:border-sky-500/40 focus:outline-none"
      />
    </label>
  );

  const metric = (label: string, value: string, tone?: string) => (
    <div className="flex items-center justify-between border-b border-zinc-900 px-1 py-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`font-mono text-xs ${tone ?? 'text-zinc-200'}`}>{value}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {(['call', 'put'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setState({ type: t })}
            className={`rounded border px-2 py-0.5 text-[11px] capitalize ${
              type === t ? 'border-sky-500/40 bg-sky-500/20 text-sky-300' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
            }`}
          >
            {t}
          </button>
        ))}
        {symbol && <span className="ml-auto text-[10px] text-zinc-600">spot from {symbol}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 p-2">
        {field('spot', 'Spot', spotDefault, '0.01')}
        {field('strike', 'Strike', Math.round(spotDefault), '0.5')}
        {field('days', 'Days', 30, '1')}
        {field('vol', 'Vol %', 25, '0.5')}
        {field('rate', 'Rate %', 4, '0.1')}
        {field('div', 'Div %', 0, '0.1')}
      </div>

      <div className="border-t border-zinc-800 px-2 pt-1.5">
        <div className="flex items-baseline justify-between px-1">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">Option value</span>
          <span className="font-mono text-lg text-zinc-100">{formatNumber(v.price)}</span>
        </div>
        {metric('Intrinsic', formatNumber(v.intrinsic))}
        {metric('Time value', formatNumber(timeValue))}
        {metric('Delta (Δ)', formatNumber(v.delta, { decimals: 4 }), changeToneClass(v.delta))}
        {metric('Gamma (Γ)', formatNumber(v.gamma, { decimals: 4 }))}
        {metric('Vega (per 1%)', formatNumber(v.vega / 100, { decimals: 4 }))}
        {metric('Theta (per day)', formatNumber(v.theta / 365, { decimals: 4 }), changeToneClass(v.theta))}
        {metric('Rho (per 1%)', formatNumber(v.rho / 100, { decimals: 4 }))}
      </div>

      <p className="px-3 py-2 text-[10px] leading-snug text-zinc-600">
        Educational Black–Scholes estimate for a European option (continuous dividend yield). Not
        investment advice; Tyche places no orders.
      </p>
    </div>
  );
}
