import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Quote } from '@tyche/contracts';
import { blackScholes, breakevens, payoffCurve, type OptionType, type PayoffPoint } from '@tyche/analytics';
import { changeToneClass, formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useReportSummary } from './common';

function noQuote(): Promise<EnvelopeResult<Quote>> {
  return Promise.resolve({ ok: false, error: { kind: 'none', message: '' }, provenance: null });
}

const PAYOFF_W = 320;
const PAYOFF_H = 120;
const PAYOFF_PAD = 10;

/**
 * Inline SVG payoff-at-expiry curve for a single long option. Two-tone (green in
 * profit, red at a loss) with a zero baseline, strike/spot markers and breakeven
 * dots. viewBox-scaled so it fills the panel width without measuring. Pure SVG;
 * nothing here is derived from any third-party charting product.
 */
function PayoffChart({
  curve,
  lo,
  hi,
  strike,
  spot,
  breakevenPrices,
}: {
  curve: PayoffPoint[];
  lo: number;
  hi: number;
  strike: number;
  spot: number;
  breakevenPrices: number[];
}) {
  if (curve.length < 2) return null;
  const payoffs = curve.map((p) => p.payoff);
  let yMin = Math.min(0, ...payoffs);
  let yMax = Math.max(0, ...payoffs);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const xAt = (price: number) => PAYOFF_PAD + ((price - lo) / (hi - lo)) * (PAYOFF_W - 2 * PAYOFF_PAD);
  const yAt = (pl: number) => PAYOFF_PAD + (1 - (pl - yMin) / (yMax - yMin)) * (PAYOFF_H - 2 * PAYOFF_PAD);
  const zeroY = yAt(0);

  return (
    <svg viewBox={`0 0 ${PAYOFF_W} ${PAYOFF_H}`} className="w-full" role="img" aria-label="Option payoff at expiry">
      <line
        x1={PAYOFF_PAD}
        y1={zeroY}
        x2={PAYOFF_W - PAYOFF_PAD}
        y2={zeroY}
        stroke="rgba(113,113,122,0.5)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <line x1={xAt(strike)} y1={PAYOFF_PAD} x2={xAt(strike)} y2={PAYOFF_H - PAYOFF_PAD} stroke="rgba(113,113,122,0.35)" strokeWidth="1" />
      {spot >= lo && spot <= hi && (
        <line
          x1={xAt(spot)}
          y1={PAYOFF_PAD}
          x2={xAt(spot)}
          y2={PAYOFF_H - PAYOFF_PAD}
          stroke="rgba(56,189,248,0.4)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
      {curve.slice(1).map((b, i) => {
        const a = curve[i]!;
        const up = (a.payoff + b.payoff) / 2 >= 0;
        return (
          <line
            key={i}
            x1={xAt(a.price)}
            y1={yAt(a.payoff)}
            x2={xAt(b.price)}
            y2={yAt(b.payoff)}
            stroke={up ? '#34d399' : '#f87171'}
            strokeWidth="1.5"
          />
        );
      })}
      {breakevenPrices.map((be, i) => (
        <circle key={`be-${i}`} cx={xAt(be)} cy={zeroY} r="2.5" fill="#fbbf24" />
      ))}
    </svg>
  );
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

  // Payoff-at-expiry for a long 1-lot at the modeled premium, over a price band
  // around the spot/strike. Cheap enough to recompute each render.
  const payoffLo = Math.max(0.01, Math.min(strike, spot) * 0.6);
  const payoffHi = Math.max(strike, spot) * 1.4;
  const payoffData = payoffCurve([{ type, strike, quantity: 1, premium: v.price }], {
    min: payoffLo,
    max: payoffHi,
    steps: 60,
  });
  const payoffBreakevens = breakevens(payoffData);

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

      {payoffData.length > 1 && (
        <div className="border-t border-zinc-800 px-2 pt-1.5">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">Payoff at expiry</span>
            <span className="text-[10px] text-zinc-600">long 1 {type}</span>
          </div>
          <PayoffChart
            curve={payoffData}
            lo={payoffLo}
            hi={payoffHi}
            strike={strike}
            spot={spot}
            breakevenPrices={payoffBreakevens}
          />
          <div className="flex justify-between px-1 pb-1 text-[10px] text-zinc-500">
            <span className={changeToneClass(-v.price)}>Max loss {formatNumber(-v.price)}</span>
            <span>
              {payoffBreakevens.length > 0
                ? `Breakeven ${payoffBreakevens.map((b) => formatNumber(b)).join(' / ')}`
                : 'No breakeven in range'}
            </span>
          </div>
        </div>
      )}

      <p className="px-3 py-2 text-[10px] leading-snug text-zinc-600">
        Educational Black–Scholes estimate for a European option (continuous dividend yield). Not
        investment advice; Tyche places no orders.
      </p>
    </div>
  );
}
