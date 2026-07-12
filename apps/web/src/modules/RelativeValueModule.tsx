import { useMemo, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { FinancialStatement } from '@tyche/contracts';
import {
  compMultiples,
  peerMedians,
  premiumToPeers,
  bundlePeriods,
  lineItem,
  type CompRow,
  type CompFinancials,
} from '@tyche/analytics';
import { formatCurrency, formatNumber, formatPercent, formatSigned } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';

const MULTIPLE_COLS = [
  { key: 'pe', label: 'P/E', kind: 'x' },
  { key: 'ps', label: 'P/S', kind: 'x' },
  { key: 'pb', label: 'P/B', kind: 'x' },
  { key: 'evEbitda', label: 'EV/EBITDA', kind: 'x' },
  { key: 'evSales', label: 'EV/Sales', kind: 'x' },
  { key: 'fcfYield', label: 'FCF yld', kind: 'pct' },
  { key: 'grossMargin', label: 'Gross', kind: 'pct' },
  { key: 'operatingMargin', label: 'Oper', kind: 'pct' },
  { key: 'netMargin', label: 'Net', kind: 'pct' },
  { key: 'revenueGrowth', label: 'Rev g', kind: 'pct' },
] as const;

type MetricKey = (typeof MULTIPLE_COLS)[number]['key'];
/** Valuation multiples where a subject-vs-median premium/discount is meaningful. */
const VALUATION_KEYS: MetricKey[] = ['pe', 'ps', 'pb', 'evEbitda', 'evSales'];

function fmtMetric(kind: 'x' | 'pct', v: number | null): string {
  if (v === null) return '—';
  return kind === 'x' ? `${formatNumber(v, { decimals: 1 })}×` : formatPercent(v * 100, 1);
}

/** Latest + prior annual line items → normalized comp inputs. */
function toCompFinancials(symbol: string, marketCap: number | null, statements: FinancialStatement[]): CompFinancials {
  const bundles = bundlePeriods(statements);
  const latest = bundles[0];
  const prior = bundles[1];
  return {
    symbol,
    marketCap,
    revenue: lineItem(latest?.income, 'totalRevenue'),
    priorRevenue: lineItem(prior?.income, 'totalRevenue'),
    netIncome: lineItem(latest?.income, 'netIncome'),
    operatingIncome: lineItem(latest?.income, 'operatingIncome'),
    grossProfit: lineItem(latest?.income, 'grossProfit'),
    depreciationAmortization: lineItem(latest?.cashFlow, 'depreciationAmortization'),
    totalEquity: lineItem(latest?.balance, 'totalEquity'),
    totalDebt: lineItem(latest?.balance, 'totalDebt'),
    cash: lineItem(latest?.balance, 'cashAndEquivalents'),
    freeCashFlow: lineItem(latest?.cashFlow, 'freeCashFlow'),
  };
}

/**
 * Fetch each ticker's security master (market cap) + latest annual financials and
 * reduce them to comp rows. The primary symbol drives the capability / error
 * ladder (so a provider without `fundamentals` shows the gap); peers degrade to a
 * best-effort row (missing inputs simply null out their multiples).
 */
async function loadComps(symbols: string[]): Promise<EnvelopeResult<CompRow[]>> {
  const primary = symbols[0];
  if (!primary) return { ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null };
  const primaryFin = await api.getFinancials(primary, { period: 'annual' });
  if (!primaryFin.ok) return primaryFin; // propagate capability_unavailable / error

  const rows = await Promise.all(
    symbols.map(async (sym): Promise<CompRow> => {
      const [inst, fin] = await Promise.all([
        api.getInstrument(sym),
        sym === primary ? Promise.resolve(primaryFin) : api.getFinancials(sym, { period: 'annual' }),
      ]);
      const marketCap = inst.ok ? (inst.data.marketCap ?? null) : null;
      const statements = fin.ok ? fin.data : [];
      return compMultiples(toCompFinancials(sym, marketCap, statements));
    }),
  );
  return { ok: true, data: rows, provenance: primaryFin.provenance };
}

const EXPORT_COLUMNS: ExportColumn<CompRow>[] = [
  { key: 'symbol', label: 'Symbol', value: (r) => r.symbol },
  { key: 'marketCap', label: 'Market cap', value: (r) => r.marketCap ?? '' },
  { key: 'enterpriseValue', label: 'Enterprise value', value: (r) => r.enterpriseValue ?? '' },
  ...MULTIPLE_COLS.map((c) => ({ key: c.key, label: c.label, value: (r: CompRow) => r[c.key] ?? '' })),
];

export function RelativeValueModule({
  symbol,
  args,
  state,
  setState,
  missingCapabilities,
  reportProvenance,
}: ModulePanelProps) {
  const primary = symbol?.toUpperCase() ?? null;
  const seededPeers = useMemo(
    () => args.map((a) => a.toUpperCase()).filter((a) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(a)),
    [args],
  );
  const extra = useMemo(
    () => (Array.isArray(state.symbols) ? (state.symbols as string[]) : seededPeers),
    [state.symbols, seededPeers],
  );
  const symbols = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [primary, ...extra]) {
      const up = s?.toUpperCase();
      if (up && !seen.has(up)) {
        seen.add(up);
        out.push(up);
      }
    }
    return out;
  }, [primary, extra]);

  const data = useApiData(() => loadComps(symbols), [symbols.join(',')]);
  useReportProvenance(reportProvenance, data.provenance);
  const [input, setInput] = useState('');

  function addPeer() {
    const sym = input.trim().toUpperCase();
    setInput('');
    if (!sym || symbols.includes(sym)) return;
    setState({ ...state, symbols: [...extra.filter((s) => s.toUpperCase() !== primary), sym] });
  }
  function removePeer(sym: string) {
    setState({ ...state, symbols: extra.filter((s) => s.toUpperCase() !== sym) });
  }

  if (!symbol) return <SymbolRequired />;

  const rows = data.data ?? [];
  const peerRows = rows.filter((r) => r.symbol !== primary);
  const medians = peerRows.length ? peerMedians(peerRows) : null;
  const primaryRow = rows.find((r) => r.symbol === primary) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[11px] text-zinc-500">Peers:</span>
        {extra
          .filter((s) => s.toUpperCase() !== primary)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => removePeer(s.toUpperCase())}
              title="Remove peer"
              className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:border-red-500/40 hover:text-red-300"
            >
              {s.toUpperCase()} ✕
            </button>
          ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addPeer();
          }}
          aria-label="Add peer"
          placeholder="+ ticker"
          className="w-20 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none"
        />
        <div className="ml-auto">
          <TableExport name={`${primary}-comps`} exportColumns={EXPORT_COLUMNS} rows={rows} provenance={data.provenance} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage="No comps.">
          {() => (
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Ticker</th>
                  <th className="px-2 py-1 text-right font-medium">Mkt cap</th>
                  {MULTIPLE_COLS.map((c) => (
                    <th key={c.key} className="px-2 py-1 text-right font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    className={`border-b border-zinc-900 ${r.symbol === primary ? 'bg-sky-500/10' : ''}`}
                  >
                    <td className={`px-2 py-0.5 ${r.symbol === primary ? 'text-sky-200' : 'text-zinc-300'}`}>
                      {r.symbol}
                    </td>
                    <td className="px-2 py-0.5 text-right text-zinc-400">
                      {r.marketCap === null ? '—' : formatCurrency(r.marketCap, 'USD', { compact: true })}
                    </td>
                    {MULTIPLE_COLS.map((c) => (
                      <td key={c.key} className="px-2 py-0.5 text-right text-zinc-200">
                        {fmtMetric(c.kind, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}

                {medians ? (
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-300">
                    <td className="px-2 py-0.5">Peer median</td>
                    <td className="px-2 py-0.5" />
                    {MULTIPLE_COLS.map((c) => (
                      <td key={c.key} className="px-2 py-0.5 text-right">
                        {fmtMetric(c.kind, medians[c.key])}
                      </td>
                    ))}
                  </tr>
                ) : null}

                {medians && primaryRow ? (
                  <tr className="text-[10px] text-zinc-500">
                    <td className="px-2 py-0.5">{primary} vs median</td>
                    <td className="px-2 py-0.5" />
                    {MULTIPLE_COLS.map((c) => {
                      const prem = VALUATION_KEYS.includes(c.key)
                        ? premiumToPeers(primaryRow[c.key], medians[c.key])
                        : null;
                      return (
                        <td key={c.key} className="px-2 py-0.5 text-right">
                          {prem === null ? '' : `${formatSigned(prem * 100)}%`}
                        </td>
                      );
                    })}
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </ModuleBody>
      </div>

      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] leading-snug text-zinc-600">
        Relative-value multiples from the latest annual filing + market cap; loss-making or
        negative-denominator multiples show “—” (not meaningful). Educational analytics; not investment
        advice.
      </p>
    </div>
  );
}
