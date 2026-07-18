import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { FinancialStatement } from '@tyche/contracts';
import { fundamentalScorecard } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

function noSymbol(): Promise<EnvelopeResult<FinancialStatement[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

const ZONE_TONE: Record<string, string> = {
  safe: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  grey: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  distress: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};
const ZONE_LABEL: Record<string, string> = { safe: 'Safe zone', grey: 'Grey zone', distress: 'Distress zone' };
const BAND_TONE: Record<string, string> = {
  strong: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  moderate: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  weak: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};
// Beneish: an 'elevated' M-Score is a caution (amber), not a verdict; 'low' reads clean.
const FLAG_TONE: Record<string, string> = {
  elevated: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
};
const FLAG_LABEL: Record<string, string> = { elevated: 'Elevated risk', low: 'Low risk' };

/** ✓ pass · ✗ fail · — not evaluable (input missing) — never guessed. */
function signalMark(pass: boolean | null): { glyph: string; tone: string } {
  if (pass === true) return { glyph: '✓', tone: 'text-emerald-400' };
  if (pass === false) return { glyph: '✗', tone: 'text-rose-400' };
  return { glyph: '—', tone: 'text-zinc-600' };
}

function num(n: number | null, decimals = 2): string {
  return n === null ? '—' : formatNumber(n, { decimals });
}

/**
 * SCORE — a forensic scorecard combining the Altman Z′-Score (financial-distress
 * composite), the Piotroski F-Score (9-point fundamental-strength checklist), and the
 * Beneish M-Score (earnings-manipulation screen), computed from the SEC financial
 * statements already on screen. Descriptive analytics over reported filings — not a
 * rating, signal, or investment advice.
 */
export function ScoringModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const data = useApiData(() => (symbol ? api.getFinancials(symbol, { period: 'annual' }) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const rows = data.data ?? [];
  const sc = useMemo(() => fundamentalScorecard(rows, symbol ?? ''), [rows, symbol]);

  if (!symbol) return <SymbolRequired />;

  const z = sc.altmanZ;
  const f = sc.piotroskiF;
  const m = sc.beneishM;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {symbol} · fundamental scorecard{sc.fiscalDate ? ` · FY ${sc.fiscalDate.slice(0, 4)}` : ''}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No fundamentals for ${symbol}.`}>
          {() =>
            sc.fiscalDate === null ? (
              <div className="p-3 text-[11px] text-zinc-500">No annual financial statements available for {symbol}.</div>
            ) : (
              <div className="space-y-3 p-2">
                {/* Altman Z′-Score */}
                <section>
                  <div className="mb-1 flex items-baseline gap-2">
                    <h3 className="text-[11px] font-medium text-zinc-300">Altman Z′-Score</h3>
                    <span className="text-[10px] text-zinc-600">financial distress</span>
                  </div>
                  {z.complete ? (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-lg text-zinc-100">{num(z.score)}</span>
                      {z.zone && (
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ZONE_TONE[z.zone]}`}>{ZONE_LABEL[z.zone]}</span>
                      )}
                    </div>
                  ) : (
                    <p className="mb-1 text-[10px] text-zinc-500">
                      Insufficient data — a Z′-Score needs all five components; missing inputs are shown below.
                    </p>
                  )}
                  <table className="w-full border-collapse font-mono text-[11px]">
                    <thead className="text-[10px] uppercase text-zinc-600">
                      <tr>
                        <th className="px-2 py-0.5 text-left font-medium">Component</th>
                        <th className="px-2 py-0.5 text-right font-medium">Ratio</th>
                        <th className="px-2 py-0.5 text-right font-medium">Weight</th>
                        <th className="px-2 py-0.5 text-right font-medium">Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {z.components.map((c) => (
                        <tr key={c.key} className="border-b border-zinc-900">
                          <td className="px-2 py-0.5 text-zinc-400">{c.label}</td>
                          <td className={`px-2 py-0.5 text-right ${c.value === null ? 'text-zinc-600' : 'text-zinc-200'}`}>{num(c.value)}</td>
                          <td className="px-2 py-0.5 text-right text-zinc-600">{c.weight}</td>
                          <td className={`px-2 py-0.5 text-right ${c.contribution === null ? 'text-zinc-600' : 'text-zinc-300'}`}>{num(c.contribution)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {/* Piotroski F-Score */}
                <section>
                  <div className="mb-1 flex items-baseline gap-2">
                    <h3 className="text-[11px] font-medium text-zinc-300">Piotroski F-Score</h3>
                    <span className="text-[10px] text-zinc-600">fundamental strength</span>
                  </div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-lg text-zinc-100">
                      {f.score}
                      <span className="text-sm text-zinc-500">/{f.complete ? f.total : f.evaluable}</span>
                    </span>
                    {f.band && <span className={`rounded border px-1.5 py-0.5 text-[10px] ${BAND_TONE[f.band]}`}>{f.band}</span>}
                    {!f.complete && (
                      <span className="text-[10px] text-zinc-500">{f.evaluable}/{f.total} signals evaluable</span>
                    )}
                  </div>
                  <table className="w-full border-collapse font-mono text-[11px]">
                    <tbody>
                      {f.signals.map((s) => {
                        const m = signalMark(s.pass);
                        return (
                          <tr key={s.key} className="border-b border-zinc-900">
                            <td className={`w-5 px-2 py-0.5 text-center ${m.tone}`}>{m.glyph}</td>
                            <td className={`px-2 py-0.5 ${s.pass === null ? 'text-zinc-600' : 'text-zinc-300'}`}>{s.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>

                {/* Beneish M-Score */}
                <section>
                  <div className="mb-1 flex items-baseline gap-2">
                    <h3 className="text-[11px] font-medium text-zinc-300">Beneish M-Score</h3>
                    <span className="text-[10px] text-zinc-600">earnings-manipulation screen</span>
                  </div>
                  {m.complete ? (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-lg text-zinc-100">{num(m.score)}</span>
                      {m.flag && <span className={`rounded border px-1.5 py-0.5 text-[10px] ${FLAG_TONE[m.flag]}`}>{FLAG_LABEL[m.flag]}</span>}
                    </div>
                  ) : (
                    <p className="mb-1 text-[10px] text-zinc-500">
                      Insufficient data — the M-Score needs all eight indices (two years of receivables, PP&amp;E, and accruals inputs).
                    </p>
                  )}
                  <table className="w-full border-collapse font-mono text-[11px]">
                    <thead className="text-[10px] uppercase text-zinc-600">
                      <tr>
                        <th className="px-2 py-0.5 text-left font-medium">Index</th>
                        <th className="px-2 py-0.5 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.components.map((cpt) => (
                        <tr key={cpt.key} className="border-b border-zinc-900">
                          <td className={`px-2 py-0.5 ${cpt.value === null ? 'text-zinc-600' : 'text-zinc-400'}`}>{cpt.label}</td>
                          <td className={`px-2 py-0.5 text-right ${cpt.value === null ? 'text-zinc-600' : 'text-zinc-200'}`}>{num(cpt.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <p className="text-[10px] leading-snug text-zinc-600">
                  Altman Z′ is the market-cap-free (book-equity) variant; EBIT is taken as operating income and its solvency
                  term (X4) is book equity / total liabilities. Bands: Z′ &gt;2.9 safe · 1.23–2.9 grey · &lt;1.23 distress.
                  Piotroski compares FY {sc.fiscalDate.slice(0, 4)}
                  {sc.priorFiscalDate ? ` vs ${sc.priorFiscalDate.slice(0, 4)}` : ''}
                  {sc.insufficientHistory ? ' (no prior year — year-over-year signals not evaluable)' : ''}; its leverage
                  signal uses total debt / total assets. The Beneish M-Score is the 1999 eight-variable statistical
                  earnings-quality screen; a value above −1.78 flags elevated risk that warrants scrutiny — it is not an
                  accusation of manipulation and has a high false-positive rate (its AQI omits long-term securities and
                  its LVGI uses total liabilities / total assets). Descriptive analytics over reported filings — not a
                  rating, signal, or investment advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        Computed from SEC EDGAR company-facts financials · public data · descriptive, not advice.
      </p>
    </div>
  );
}
