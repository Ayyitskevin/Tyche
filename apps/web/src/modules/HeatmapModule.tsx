import { useEffect, useState } from 'react';
import type { ScreenRow } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { formatNumber } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useElementSize } from '../providers/useElementSize';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { divergingFill, squarify } from './treemap';

const POLL_MS = 15_000;
type Weight = 'marketCap' | 'volume';

/**
 * HEAT — a squarified market treemap over the screener universe: tile area is
 * market cap (or volume), fill is a validated diverging red↔gray↔green ramp on
 * % change, and each tile carries its signed % as text so direction is never
 * color-alone. Click a tile to retarget linked panels.
 */
export function HeatmapModule({ state, setState, setSymbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const weight: Weight = state.weight === 'volume' ? 'volume' : 'marketCap';
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPoll((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const screen = useApiData<ScreenRow[]>(
    () => api.screen({ filters: [], sort: { field: weight, dir: 'desc' }, limit: 60 }),
    [weight, poll],
  );
  useReportProvenance(reportProvenance, screen.provenance);
  const [ref, size] = useElementSize<HTMLDivElement>();

  const rows = (screen.data ?? []).filter((r) => (r[weight] ?? 0) > 0);
  const up = rows.filter((r) => (r.changePercent ?? 0) >= 0).length;
  useReportSummary(
    reportSummary,
    rows.length > 0 ? `Market map (${weight}): ${rows.length} names, ${up} up / ${rows.length - up} down` : null,
  );

  const pad = 4;
  const headerH = 26;
  const legendH = 20;
  const plotW = Math.max(0, size.width - pad * 2);
  const plotH = Math.max(0, size.height - headerH - legendH - pad * 2);
  const rects = squarify(
    rows.map((r) => ({ key: r.symbol, value: r[weight] ?? 0, row: r })),
    0,
    0,
    plotW,
    plotH,
  );

  return (
    <div ref={ref} className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-zinc-900 px-2 py-1 text-[10px] text-zinc-500" style={{ height: headerH }}>
        <span className="uppercase tracking-wide">Size by</span>
        {(['marketCap', 'volume'] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setState({ weight: w })}
            className={`rounded px-1.5 py-0.5 ${w === weight ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
          >
            {w === 'marketCap' ? 'Mkt cap' : 'Volume'}
          </button>
        ))}
      </div>
      <ModuleBody state={screen} missingCapabilities={missingCapabilities} emptyMessage="Nothing to map.">
        {() => (
          <div className="relative flex-1" style={{ margin: pad }}>
            {rects.map(({ item, x, y, w, h }) => {
              const r = item.row;
              const chg = r.changePercent;
              const label = `${chg !== null && chg >= 0 ? '+' : ''}${chg?.toFixed(2) ?? '—'}%`;
              const showText = w > 46 && h > 26;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSymbol?.(r.symbol)}
                  title={`${r.symbol} — ${r.name}\n${label} · ${weight === 'marketCap' ? 'mkt cap' : 'volume'} ${formatNumber(item.value, { compact: true })}`}
                  className="absolute overflow-hidden text-left focus:outline focus:outline-1 focus:outline-sky-400"
                  style={{
                    // 2px surface gap between adjacent fills (mark spec).
                    left: x + 1,
                    top: y + 1,
                    width: Math.max(0, w - 2),
                    height: Math.max(0, h - 2),
                    backgroundColor: divergingFill(chg),
                    borderRadius: 2,
                  }}
                >
                  {showText && (
                    <span className="flex h-full flex-col justify-between p-1 font-mono">
                      <span className="text-[10px] font-semibold text-zinc-100">{r.symbol}</span>
                      <span className="text-[10px] text-zinc-100/90">{label}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ModuleBody>
      <div className="flex items-center gap-2 border-t border-zinc-900 px-2 text-[10px] text-zinc-500" style={{ height: legendH }}>
        <span>-3%</span>
        <span
          className="h-1.5 w-24 rounded-sm"
          style={{ background: 'linear-gradient(to right, #dc2626, #3f3f46, #059669)' }}
          aria-hidden="true"
        />
        <span>+3%</span>
        <span className="ml-auto">{rows.length} names · click a tile to retarget</span>
      </div>
    </div>
  );
}
