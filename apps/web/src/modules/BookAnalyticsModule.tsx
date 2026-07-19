import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { OrderBook } from '@tyche/contracts';
import { bookAnalytics, costToFill } from '@tyche/analytics';
import { formatNumber } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

const BANDS_BPS = [10, 25, 50];

function noSymbol(): Promise<EnvelopeResult<OrderBook>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function num(n: number | null, decimals = 2): string {
  return n === null ? '—' : formatNumber(n, { decimals });
}
function bps(n: number | null): string {
  return n === null ? '—' : `${formatNumber(n, { decimals: 1 })} bps`;
}
function signedPct(n: number | null): string {
  return n === null ? '—' : `${n > 0 ? '+' : ''}${formatNumber(n * 100, { decimals: 0 })}%`;
}
function compact(n: number): string {
  return formatNumber(n, { decimals: n >= 1000 ? 1 : 2, compact: true });
}

/**
 * LIQ — order-book liquidity analytics over the existing `orderBook` snapshot.
 * Adds the microstructure the raw BOOK ladder doesn't: the size-weighted
 * microprice, spread in basis points, resting depth within ±bps price bands, and
 * the cost-to-fill / slippage of market orders that walk the book. Every value is
 * measured from the snapshot — a partial fill is flagged, never extrapolated, and
 * a metric that needs an empty side is shown as “—”. Not a signal, not advice.
 */
export function BookAnalyticsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const book = useApiData<OrderBook>(() => (symbol ? api.getOrderBook(symbol, 50) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, book.provenance);
  const a = useMemo(() => (book.data ? bookAnalytics(book.data, BANDS_BPS) : null), [book.data]);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{symbol} · order-book liquidity</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={book} missingCapabilities={missingCapabilities} emptyMessage={`No order book for ${symbol}.`}>
          {(ob) => {
            const an = a!;
            // Slippage sizes auto-scaled to the book: fractions of the thinner
            // side's 50-bps notional, so the curve is meaningful for any symbol.
            const band50 = an.bands.find((b) => b.bps === 50);
            const base = band50 ? Math.min(band50.bidNotional, band50.askNotional) : 0;
            const sizes = base > 0 ? [0.5, 1, 2].map((f) => f * base) : [];
            return (
              <div className="p-2">
                <div className="mb-2 grid grid-cols-4 gap-2 text-[11px]">
                  <Tile label="Mid" value={num(an.mid)} />
                  <Tile label="Microprice" value={num(an.microprice)} />
                  <Tile label="Spread" value={bps(an.spreadBps)} />
                  <Tile label="Imbalance" value={signedPct(an.imbalance)} />
                </div>

                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Depth within band</div>
                <table className="mb-2 w-full border-collapse font-mono text-[11px]">
                  <thead className="text-[10px] uppercase text-zinc-600">
                    <tr>
                      <th className="px-2 py-0.5 text-left font-medium">±bps</th>
                      <th className="px-2 py-0.5 text-right font-medium">Bid qty</th>
                      <th className="px-2 py-0.5 text-right font-medium">Bid notl</th>
                      <th className="px-2 py-0.5 text-right font-medium">Ask qty</th>
                      <th className="px-2 py-0.5 text-right font-medium">Ask notl</th>
                      <th className="px-2 py-0.5 text-right font-medium">Imb.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {an.bands.map((b) => (
                      <tr key={b.bps} className="border-b border-zinc-900">
                        <td className="px-2 py-0.5 text-zinc-400">±{b.bps}</td>
                        <td className="px-2 py-0.5 text-right text-emerald-400/90">{num(b.bidQty, 3)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{compact(b.bidNotional)}</td>
                        <td className="px-2 py-0.5 text-right text-red-400/90">{num(b.askQty, 3)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-300">{compact(b.askNotional)}</td>
                        <td className="px-2 py-0.5 text-right text-zinc-400">{signedPct(b.imbalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {sizes.length > 0 && (
                  <>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Cost to fill (slippage vs mid)</div>
                    <table className="w-full border-collapse font-mono text-[11px]">
                      <thead className="text-[10px] uppercase text-zinc-600">
                        <tr>
                          <th className="px-2 py-0.5 text-left font-medium">Notional</th>
                          <th className="px-2 py-0.5 text-right font-medium">Buy avg</th>
                          <th className="px-2 py-0.5 text-right font-medium">Buy slip</th>
                          <th className="px-2 py-0.5 text-right font-medium">Sell avg</th>
                          <th className="px-2 py-0.5 text-right font-medium">Sell slip</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sizes.map((size) => {
                          const buy = costToFill(ob, 'buy', size);
                          const sell = costToFill(ob, 'sell', size);
                          return (
                            <tr key={size} className="border-b border-zinc-900">
                              <td className="px-2 py-0.5 text-zinc-400">{compact(size)}</td>
                              <td className="px-2 py-0.5 text-right text-zinc-300">{num(buy.avgPrice)}</td>
                              <td className="px-2 py-0.5 text-right text-zinc-200">
                                {bps(buy.slippageBps)}{buy.filled ? '' : '*'}
                              </td>
                              <td className="px-2 py-0.5 text-right text-zinc-300">{num(sell.avgPrice)}</td>
                              <td className="px-2 py-0.5 text-right text-zinc-200">
                                {bps(sell.slippageBps)}{sell.filled ? '' : '*'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}

                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  Microprice = size-weighted mid (leans toward the thinner side). Depth bands sum the resting
                  notional within ±bps of mid; imbalance is bid vs ask notional. Cost-to-fill walks the book for a
                  market order and reports the volume-weighted average price and slippage vs mid; sizes scale to the
                  book’s ±50 bps depth, and <span className="text-zinc-400">*</span> marks a partial fill (book too
                  thin). Descriptive market-structure analytics — not a signal, not advice.
                </p>
              </div>
            );
          }}
        </ModuleBody>
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        Level-2 depth snapshot × microstructure math · descriptive, not advice.
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
