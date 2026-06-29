import type { ModulePanelProps } from '@tyche/module-sdk';
import { cagr, futureValue, loanPayment, presentValue } from '@tyche/analytics';
import { formatNumber, formatPercent } from '@tyche/ui';

type Mode = 'fv' | 'pv' | 'loan' | 'cagr';
const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'fv', label: 'Future value' },
  { id: 'pv', label: 'Present value' },
  { id: 'loan', label: 'Loan' },
  { id: 'cagr', label: 'CAGR' },
];

export function CalculatorModule({ state, setState }: ModulePanelProps) {
  const mode = ((state.mode as Mode | undefined) ?? 'fv') as Mode;

  const num = (key: string, def: number): number => {
    const v = Number.parseFloat(state[key] != null ? String(state[key]) : String(def));
    return Number.isFinite(v) ? v : def;
  };
  const str = (key: string, def: number): string => (state[key] != null ? String(state[key]) : String(def));

  const field = (key: string, label: string, def: number, step = '1') => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <input
        type="number"
        step={step}
        aria-label={label}
        value={str(key, def)}
        onChange={(e) => setState({ [key]: e.target.value })}
        className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-xs text-zinc-100 focus:border-sky-500/40 focus:outline-none"
      />
    </label>
  );

  const result = (label: string, value: string) => (
    <div className="flex items-baseline justify-between px-1 py-1">
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="font-mono text-lg text-zinc-100">{value}</span>
    </div>
  );
  const sub = (label: string, value: string) => (
    <div className="flex items-center justify-between border-t border-zinc-900 px-1 py-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="font-mono text-xs text-zinc-300">{value}</span>
    </div>
  );

  let inputs: React.ReactNode = null;
  let output: React.ReactNode = null;

  if (mode === 'fv' || mode === 'pv') {
    const ratePct = num('rate', 5);
    const years = num('years', 10);
    const perYear = num('perYear', 12);
    // Invalid period inputs render "—" rather than silently computing as if valid.
    const valid = perYear >= 1 && years > 0;
    const r = (ratePct / 100) / perYear;
    const n = years * perYear;
    if (mode === 'fv') {
      const pv = num('principal', 10000);
      const pmt = num('pmt', 100);
      inputs = (
        <>
          {field('principal', 'Starting amount', 10000, '100')}
          {field('pmt', 'Contribution / period', 100, '10')}
          {field('rate', 'Annual rate %', 5, '0.1')}
          {field('years', 'Years', 10, '1')}
          {field('perYear', 'Periods / year', 12, '1')}
        </>
      );
      const fv = valid ? futureValue(pv, pmt, r, n) : Number.NaN;
      output = (
        <>
          {result('Future value', formatNumber(fv))}
          {sub('Total contributed', formatNumber(pv + pmt * n))}
          {sub('Growth', formatNumber(fv - (pv + pmt * n)))}
        </>
      );
    } else {
      const fv = num('fv', 10000);
      const pmt = num('pmt', 0);
      inputs = (
        <>
          {field('fv', 'Future amount', 10000, '100')}
          {field('pmt', 'Payment / period', 0, '10')}
          {field('rate', 'Annual rate %', 5, '0.1')}
          {field('years', 'Years', 10, '1')}
          {field('perYear', 'Periods / year', 12, '1')}
        </>
      );
      output = result('Present value', formatNumber(valid ? presentValue(fv, pmt, r, n) : Number.NaN));
    }
  } else if (mode === 'loan') {
    const principal = num('principal', 25000);
    const ratePct = num('rate', 6);
    const years = num('years', 5);
    const perYear = num('perYear', 12);
    const valid = perYear >= 1 && years > 0;
    const r = (ratePct / 100) / perYear;
    const n = years * perYear;
    const pay = valid ? loanPayment(principal, r, n) : Number.NaN;
    const totalPaid = pay * n;
    inputs = (
      <>
        {field('principal', 'Loan amount', 25000, '500')}
        {field('rate', 'Annual rate %', 6, '0.1')}
        {field('years', 'Years', 5, '1')}
        {field('perYear', 'Payments / year', 12, '1')}
      </>
    );
    output = (
      <>
        {result('Payment / period', formatNumber(pay))}
        {sub('Total paid', formatNumber(totalPaid))}
        {sub('Total interest', formatNumber(totalPaid - principal))}
      </>
    );
  } else {
    const begin = num('begin', 100);
    const end = num('end', 200);
    const years = num('years', 10);
    const g = cagr(begin, end, years);
    inputs = (
      <>
        {field('begin', 'Beginning value', 100, '1')}
        {field('end', 'Ending value', 200, '1')}
        {field('years', 'Years', 10, '1')}
      </>
    );
    output = (
      <>
        {result('CAGR', Number.isNaN(g) ? '—' : formatPercent(g * 100))}
        {sub('Total return', Number.isNaN(g) ? '—' : formatPercent((end / begin - 1) * 100))}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setState({ mode: m.id })}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${
              mode === m.id ? 'border-sky-500/40 bg-sky-500/20 text-sky-300' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 p-2">{inputs}</div>
      <div className="border-t border-zinc-800 px-2 pt-1.5">{output}</div>
      <p className="px-3 py-2 text-[10px] leading-snug text-zinc-600">
        Educational time-value-of-money estimates (ordinary annuity). Not investment advice.
      </p>
    </div>
  );
}
