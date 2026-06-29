import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Candle, HistoricalSeries } from '@tyche/contracts';
import { DataTable, formatNumber, type Column } from '@tyche/ui';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { downloadText, provenanceCsvHeader } from './export';
import type { DataProvenance } from '@tyche/contracts';

const RANGES = ['1mo', '3mo', '6mo', '1y'] as const;

function noSymbol(): Promise<EnvelopeResult<HistoricalSeries>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

function toCsv(candles: Candle[], provenance: DataProvenance | null): string {
  const header = 'date,open,high,low,close,volume';
  const rows = candles.map((c) => `${c.t},${c.o},${c.h},${c.l},${c.c},${c.v ?? ''}`);
  return [...provenanceCsvHeader(provenance), header, ...rows].join('\n');
}

const columns: Array<Column<Candle>> = [
  { key: 't', header: 'Date', width: '1.4fr', render: (c) => c.t.slice(0, 10) },
  { key: 'o', header: 'Open', align: 'right', render: (c) => formatNumber(c.o) },
  { key: 'h', header: 'High', align: 'right', render: (c) => formatNumber(c.h) },
  { key: 'l', header: 'Low', align: 'right', render: (c) => formatNumber(c.l) },
  { key: 'c', header: 'Close', align: 'right', render: (c) => formatNumber(c.c) },
  { key: 'v', header: 'Volume', align: 'right', render: (c) => formatNumber(c.v, { compact: true, decimals: 1 }) },
];

export function HistoryTableModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const range = (state.range as string) ?? '3mo';
  const history = useApiData(
    () => (symbol ? api.getHistory(symbol, { range, interval: '1d' }) : noSymbol()),
    [symbol, range],
  );
  useReportProvenance(reportProvenance, history.provenance);

  if (!symbol) return <SymbolRequired />;

  function download(candles: Candle[]) {
    downloadText(`${symbol}-history.csv`, 'text/csv', toCsv(candles, history.provenance));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-2 py-1.5">
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setState({ range: r })}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                r === range ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-500 hover:bg-zinc-800'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {history.data && (
          <button
            type="button"
            onClick={() => download(history.data!.candles)}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
          >
            Export CSV
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ModuleBody state={history} missingCapabilities={missingCapabilities}>
          {(series) => (
            <DataTable
              columns={columns}
              rows={[...series.candles].reverse()}
              getRowKey={(c) => c.t}
              height={undefined}
              rowHeight={24}
            />
          )}
        </ModuleBody>
      </div>
    </div>
  );
}
