import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { EconomicObservation } from '@tyche/contracts';
import { changeToneClass, formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { TableExport } from './TableExport';
import type { ExportColumn } from './export';
import {
  TREASURY_TENORS,
  CURVE_ASOF,
  KEY_SPREADS,
  asOfTargetMs,
  buildCurve,
  curveSpread,
  type CurvePoint,
} from './yieldCurve';

type TenorSeries = Map<string, EconomicObservation[]>;

const DAY_MS = 86_400_000;
const CURVE_COLORS: Record<string, string> = { now: '#38bdf8', month: '#fbbf24', year: '#71717a' };

/** Fetch every constant-maturity tenor with ~13 months of history in one batch. */
async function loadCurve(): Promise<EnvelopeResult<TenorSeries>> {
  const start = new Date(Date.now() - 400 * DAY_MS).toISOString().slice(0, 10);
  const results = await Promise.all(TREASURY_TENORS.map((t) => api.getEconomicSeries(t.id, { start })));
  const map: TenorSeries = new Map();
  let provenance = results.find((r) => r.ok)?.provenance ?? null;
  let anyOk = false;
  results.forEach((res, i) => {
    if (res.ok) {
      map.set(TREASURY_TENORS[i]!.id, res.data.observations);
      anyOk = true;
    }
  });
  if (!anyOk) {
    return results.find((r) => !r.ok) ?? { ok: false, error: { kind: 'error', message: 'No curve data' }, provenance: null };
  }
  return { ok: true, data: map, provenance };
}

interface CurveExportRow {
  tenor: string;
  years: number;
  now: number | null;
  month: number | null;
  year: number | null;
}

const EXPORT_COLUMNS: ExportColumn<CurveExportRow>[] = [
  { key: 'tenor', label: 'Tenor', value: (r) => r.tenor },
  { key: 'years', label: 'Years', value: (r) => r.years },
  { key: 'now', label: 'Today %', value: (r) => r.now ?? '' },
  { key: 'month', label: '1M ago %', value: (r) => r.month ?? '' },
  { key: 'year', label: '1Y ago %', value: (r) => r.year ?? '' },
];

export function YieldCurveModule({ missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const data = useApiData(() => loadCurve(), []);
  useReportProvenance(reportProvenance, data.provenance);

  const nowMs = useMemo(() => Date.now(), []);
  const curves = useMemo(() => {
    const map = data.data;
    if (!map) return null;
    return CURVE_ASOF.map((a) => ({
      ...a,
      points: buildCurve(map, asOfTargetMs(nowMs, a.daysAgo)),
    }));
  }, [data.data, nowMs]);

  const current = curves?.find((c) => c.key === 'now')?.points ?? [];
  const spreads = KEY_SPREADS.map((s) => ({ ...s, value: curveSpread(current, s.shortId, s.longId) }));
  const tenYear = current.find((p) => p.id === 'DGS10')?.yield ?? null;
  const twoTen = spreads.find((s) => s.key === '2s10s')?.value ?? null;

  useReportSummary(
    reportSummary,
    tenYear !== null
      ? `Treasury curve: 10Y ${formatNumber(tenYear)}%${
          twoTen !== null ? `, 2s10s ${twoTen >= 0 ? '+' : ''}${formatNumber(twoTen * 100, { decimals: 0 })}bp` : ''
        }`
      : null,
  );

  const exportRows: CurveExportRow[] = curves
    ? TREASURY_TENORS.map((t) => {
        const at = (key: string) => curves.find((c) => c.key === key)?.points.find((p) => p.id === t.id)?.yield ?? null;
        return { tenor: t.label, years: t.years, now: at('now'), month: at('month'), year: at('year') };
      })
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="text-sm text-zinc-200">Treasury yield curve</span>
        <TableExport name="treasury-curve" exportColumns={EXPORT_COLUMNS} rows={exportRows} provenance={data.provenance} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage="No curve data.">
          {() => (
            <div className="flex flex-col gap-2 p-2">
              <CurveChart curves={curves ?? []} />

              {/* Headline spreads (long − short); negative = inverted. */}
              <div className="flex flex-wrap gap-3 px-1 font-mono text-[11px]">
                {spreads.map((s) => (
                  <div key={s.key} className="flex items-baseline gap-1">
                    <span className="text-zinc-500">{s.label}</span>
                    <span className={s.value !== null ? changeToneClass(s.value) : 'text-zinc-600'}>
                      {s.value === null
                        ? '—'
                        : `${s.value >= 0 ? '+' : ''}${formatNumber(s.value * 100, { decimals: 0 })}bp${s.value < 0 ? ' (inv.)' : ''}`}
                    </span>
                  </div>
                ))}
              </div>

              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Tenor</th>
                    {CURVE_ASOF.map((a) => (
                      <th key={a.key} className="px-2 py-1 text-right font-medium">
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TREASURY_TENORS.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-900">
                      <td className="px-2 py-0.5 text-zinc-400">{t.label}</td>
                      {CURVE_ASOF.map((a) => {
                        const y = curves?.find((c) => c.key === a.key)?.points.find((p) => p.id === t.id)?.yield ?? null;
                        return (
                          <td key={a.key} className="px-2 py-0.5 text-right text-zinc-200">
                            {y === null ? '—' : `${formatNumber(y)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModuleBody>
      </div>

      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] leading-snug text-zinc-600">
        Constant-maturity Treasury rates from FRED; spreads are long − short (negative = inverted).
        Descriptive market data, not investment advice.
      </p>
    </div>
  );
}

const CW = 360;
const CH = 150;
const PAD = { top: 12, right: 12, bottom: 20, left: 30 };

function CurveChart({ curves }: { curves: { key: string; label: string; points: CurvePoint[] }[] }) {
  const innerW = CW - PAD.left - PAD.right;
  const innerH = CH - PAD.top - PAD.bottom;
  const n = TREASURY_TENORS.length;

  const values = curves.flatMap((c) => c.points.map((p) => p.yield).filter((v): v is number => v !== null));
  if (values.length === 0) return <div className="text-[11px] text-zinc-600">No curve to plot.</div>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.15 || 0.5;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const xAt = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yAt = (v: number) => PAD.top + innerH * (1 - (v - yMin) / (yMax - yMin || 1));

  const polyline = (points: CurvePoint[]): string =>
    points
      .map((p, i) => (p.yield === null ? null : `${xAt(i).toFixed(1)},${yAt(p.yield).toFixed(1)}`))
      .filter((s): s is string => s !== null)
      .join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" role="img" aria-label="Treasury yield curve">
        {/* y gridlines */}
        {[yMin, (yMin + yMax) / 2, yMax].map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={yAt(v)} x2={CW - PAD.right} y2={yAt(v)} stroke="#27272a" strokeWidth="1" />
            <text x={PAD.left - 4} y={yAt(v) + 3} textAnchor="end" fontSize="8" fill="#71717a">
              {formatNumber(v, { decimals: 1 })}
            </text>
          </g>
        ))}
        {/* x tenor labels */}
        {TREASURY_TENORS.map((t, i) => (
          <text key={t.id} x={xAt(i)} y={CH - 6} textAnchor="middle" fontSize="7" fill="#71717a">
            {t.label}
          </text>
        ))}
        {/* curves: draw comparisons first, current last (on top) */}
        {[...curves].reverse().map((c) => {
          const pts = polyline(c.points);
          if (!pts) return null;
          const color = CURVE_COLORS[c.key] ?? '#38bdf8';
          return (
            <polyline
              key={c.key}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={c.key === 'now' ? 1.75 : 1}
              strokeOpacity={c.key === 'now' ? 1 : 0.6}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex gap-3 px-1 text-[10px]">
        {curves.map((c) => (
          <span key={c.key} className="flex items-center gap-1 text-zinc-500">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: CURVE_COLORS[c.key] }} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
