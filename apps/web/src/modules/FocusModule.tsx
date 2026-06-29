import type { Quote } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, formatNumber, formatPercent, formatSigned } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { formatAge } from './quotesCommon';

function noSymbol(): Promise<EnvelopeResult<Quote>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="font-mono text-sm text-zinc-200">{value}</span>
    </div>
  );
}

/**
 * FOCUS — a single instrument's live quote rendered large. Reuses the SSE quote
 * stream so the headline price ticks; falls back to the REST snapshot before the
 * first frame arrives. Read-only; no advice, no order placement.
 */
export function FocusModule({ symbol, setSymbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const initial = useApiData<Quote>(() => (symbol ? api.getQuote(symbol) : noSymbol()), [symbol]);
  useReportProvenance(reportProvenance, initial.provenance);
  const live = useQuoteStream(symbol ? [symbol] : []);

  if (!symbol) return <SymbolRequired />;

  return (
    <ModuleBody state={initial} missingCapabilities={missingCapabilities}>
      {(snapshot) => {
        const q = live[symbol] ?? snapshot;
        return (
          <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-baseline gap-2">
              {setSymbol ? (
                <input
                  key={symbol}
                  aria-label="Focus symbol"
                  defaultValue={symbol}
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const v = e.currentTarget.value.trim().toUpperCase();
                    if (v && v !== symbol) setSymbol(v);
                  }}
                  className="no-drag w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-lg font-semibold text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                />
              ) : (
                <span className="font-mono text-lg font-semibold text-zinc-100">{q.symbol}</span>
              )}
              <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-600">{formatAge(q.timestamp)}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-4xl font-semibold text-zinc-50">{formatNumber(q.price)}</span>
              <span className={`font-mono text-lg ${changeToneClass(q.change)}`}>
                {formatSigned(q.change)} ({formatPercent(q.changePercent)})
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Open" value={formatNumber(q.open)} />
              <Stat label="High" value={formatNumber(q.dayHigh)} />
              <Stat label="Low" value={formatNumber(q.dayLow)} />
              <Stat label="Prev Close" value={formatNumber(q.prevClose)} />
              <Stat label="Bid" value={formatNumber(q.bid)} />
              <Stat label="Ask" value={formatNumber(q.ask)} />
              <Stat label="Volume" value={formatNumber(q.volume, { compact: true, decimals: 1 })} />
              <Stat label="Last" value={formatNumber(q.price)} />
            </div>
          </div>
        );
      }}
    </ModuleBody>
  );
}
