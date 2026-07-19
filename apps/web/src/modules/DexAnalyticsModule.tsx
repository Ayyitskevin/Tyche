import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { DexPool } from '@tyche/contracts';
import { dexAnalytics } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance, useReportSummary } from './common';

function noSymbol(): Promise<EnvelopeResult<DexPool[]>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function usd(n: number | null): string {
  return n === null ? '—' : `$${formatNumber(n, { decimals: n >= 1000 ? 1 : 2, compact: true })}`;
}
function price(n: number | null): string {
  return n === null ? '—' : `$${formatNumber(n, { decimals: n !== null && n < 1 ? 6 : 2 })}`;
}
function bps(n: number | null): string {
  return n === null ? '—' : `${n > 0 ? '+' : ''}${formatNumber(n, { decimals: 1 })} bps`;
}
function pct0(n: number | null): string {
  return n === null ? '—' : `${formatNumber(n * 100, { decimals: 0 })}%`;
}
function ratio(n: number | null): string {
  return n === null ? '—' : `${formatNumber(n, { decimals: 2 })}×`;
}

/**
 * DEXA — cross-venue on-chain analytics over the existing `dexPools` snapshot for
 * a token: the depth-weighted fair price (LWAP), how far venues disagree on price,
 * where the liquidity concentrates (top-venue share + HHI), how hard pools turn
 * over, and net buy pressure. Each statistic is measured only over the pools that
 * report the field it needs — a missing price/liquidity is skipped, never zeroed.
 * Descriptive on-chain market-structure analytics — not a signal, not advice.
 */
export function DexAnalyticsModule({ symbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const data = useApiData<DexPool[]>(() => (symbol ? api.getDexPools(symbol, 20) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, data.provenance);
  const a = useMemo(() => dexAnalytics(data.data ?? []), [data.data]);
  useReportSummary(
    reportSummary,
    a.poolCount > 0 && a.lwapUsd !== null
      ? `${symbol} on-chain: LWAP ${price(a.lwapUsd)} across ${a.venues} venues, top ${a.topVenue ?? '—'} ${pct0(a.topVenueShare)}`
      : null,
  );

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · on-chain analytics</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={data} missingCapabilities={missingCapabilities} emptyMessage={`No on-chain pools for ${symbol}.`}>
          {() =>
            a.poolCount === 0 ? (
              <div className="p-3 text-[11px] text-zinc-500">No on-chain pools for {symbol}.</div>
            ) : (
              <div className="p-2">
                <div className="mb-2 grid grid-cols-4 gap-2 text-[11px]">
                  <Tile label="LWAP" value={price(a.lwapUsd)} />
                  <Tile label="Dispersion" value={bps(a.priceDispersionBps)} />
                  <Tile label="Liquidity" value={usd(a.totalLiquidityUsd)} />
                  <Tile label="Turnover" value={ratio(a.turnover)} />
                </div>
                <div className="mb-2 text-[10px] leading-snug text-zinc-500">
                  {a.poolCount} pools · {a.venues} venues · {a.chains} chains · top venue{' '}
                  <span className="text-zinc-300">{a.topVenue ?? '—'}</span> {pct0(a.topVenueShare)} · HHI{' '}
                  <span className="text-zinc-300">{a.hhi === null ? '—' : formatNumber(a.hhi, { decimals: 2 })}</span> · buys{' '}
                  <span className="text-zinc-300">{pct0(a.buyShare)}</span>
                </div>
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead className="text-[10px] uppercase text-zinc-600">
                    <tr>
                      <th className="px-2 py-0.5 text-left font-medium">Venue</th>
                      <th className="px-2 py-0.5 text-left font-medium">Chain</th>
                      <th className="px-2 py-0.5 text-right font-medium">Price</th>
                      <th className="px-2 py-0.5 text-right font-medium">Liq</th>
                      <th className="px-2 py-0.5 text-right font-medium">Vol 24h</th>
                      <th className="px-2 py-0.5 text-right font-medium">Turn</th>
                      <th className="px-2 py-0.5 text-right font-medium">Liq%</th>
                      <th className="px-2 py-0.5 text-right font-medium">Δbps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.rows.map((r, i) => (
                      <tr key={`${r.dex}-${r.chain}-${i}`} className="border-b border-zinc-900">
                        <td className="px-2 py-0.5 text-zinc-300">{r.dex}</td>
                        <td className="px-2 py-0.5 text-zinc-500">{r.chain}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{price(r.priceUsd)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{usd(r.liquidityUsd)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-400">{usd(r.volume24hUsd)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-400">{ratio(r.turnover)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-400">{pct0(r.liquidityShare)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-400">{bps(r.priceDevBps)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  LWAP = liquidity-weighted average price (depth-weighted fair value across pools). Dispersion =
                  (max − min) price ÷ LWAP. Turnover = 24h volume ÷ liquidity. HHI = Herfindahl of liquidity shares
                  (1 = one pool holds all depth). Δbps = each pool’s price vs LWAP. Buys = aggregate 24h buys ÷
                  (buys + sells). Fields absent at the source are omitted, never zeroed. Descriptive on-chain
                  market-structure analytics — not a signal, not advice.
                </p>
              </div>
            )
          }
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        On-chain DEX pools × cross-venue analytics · descriptive, not advice.
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-mono text-zinc-200">{value}</div>
    </div>
  );
}
