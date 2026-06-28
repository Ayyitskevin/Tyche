import type { Instrument, Quote } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, formatCurrency, formatNumber, formatPercent, formatSigned } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

function noSymbol<T>(): Promise<EnvelopeResult<T>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="font-mono text-sm text-zinc-200">{value}</span>
    </div>
  );
}

export function DescriptionModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const instrument = useApiData<Instrument>(
    () => (symbol ? api.getInstrument(symbol) : noSymbol<Instrument>()),
    [symbol],
  );
  const quote = useApiData<Quote>(
    () => (symbol ? api.getQuote(symbol) : noSymbol<Quote>()),
    [symbol],
  );
  useReportProvenance(reportProvenance, quote.provenance ?? instrument.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <ModuleBody state={instrument} missingCapabilities={missingCapabilities}>
      {(inst) => (
        <div className="space-y-3 p-3 text-sm">
          <header className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-semibold text-zinc-100">{inst.symbol}</span>
              <span className="text-zinc-400">{inst.name}</span>
            </div>
            <div className="flex flex-wrap gap-1 text-[11px] text-zinc-500">
              {inst.exchange && <span className="rounded bg-zinc-800 px-1.5 py-0.5">{inst.exchange}</span>}
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 uppercase">{inst.assetClass}</span>
              {inst.sector && <span className="rounded bg-zinc-800 px-1.5 py-0.5">{inst.sector}</span>}
              {inst.currency && <span className="rounded bg-zinc-800 px-1.5 py-0.5">{inst.currency}</span>}
            </div>
          </header>

          {quote.data && (
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl font-semibold text-zinc-50">
                {formatCurrency(quote.data.price, inst.currency)}
              </span>
              <span className={`font-mono text-sm ${changeToneClass(quote.data.change)}`}>
                {formatSigned(quote.data.change)} ({formatPercent(quote.data.changePercent)})
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quote.data && (
              <>
                <Stat label="Open" value={formatNumber(quote.data.open)} />
                <Stat label="Day High" value={formatNumber(quote.data.dayHigh)} />
                <Stat label="Day Low" value={formatNumber(quote.data.dayLow)} />
                <Stat label="Prev Close" value={formatNumber(quote.data.prevClose)} />
                <Stat label="Volume" value={formatNumber(quote.data.volume, { compact: true, decimals: 1 })} />
              </>
            )}
            <Stat label="Market Cap" value={formatCurrency(inst.marketCap, inst.currency, { compact: true, decimals: 2 })} />
            <Stat label="Shares Out" value={formatNumber(inst.sharesOutstanding, { compact: true, decimals: 2 })} />
            {inst.employees !== undefined && <Stat label="Employees" value={formatNumber(inst.employees, { compact: true })} />}
            {inst.country && <Stat label="Country" value={inst.country} />}
          </div>

          {inst.description && (
            <p className="text-xs leading-relaxed text-zinc-400">{inst.description}</p>
          )}
        </div>
      )}
    </ModuleBody>
  );
}
