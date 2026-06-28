import { useMemo } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable } from '@tyche/ui';
import { DEFAULT_SYMBOLS } from '../constants';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useQuoteStream } from '../providers/useQuoteStream';
import { useElementSize } from '../providers/useElementSize';
import { executeInput } from '../terminal/execute';
import { ModuleBody, useReportProvenance } from './common';
import { emptyQuoteBatch, mergeQuotes, quoteColumns } from './quotesCommon';

export function QuoteMonitorModule({ args, symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const watchlists = useApiData(() => api.getWatchlists(), []);

  const symbols = useMemo(() => {
    const fromArgs = args
      .filter((a) => /^[A-Za-z]/.test(a))
      .map((a) => a.toUpperCase());
    if (fromArgs.length > 0) return fromArgs;
    if (symbol) return [symbol];
    const first = watchlists.data?.[0]?.symbols;
    return first && first.length > 0 ? first : [...DEFAULT_SYMBOLS];
  }, [args, symbol, watchlists.data]);

  const initial = useApiData(
    () => (symbols.length > 0 ? api.getQuotes(symbols) : emptyQuoteBatch()),
    [symbols.join(',')],
  );
  useReportProvenance(reportProvenance, initial.provenance);
  const live = useQuoteStream(symbols);
  const [ref, size] = useElementSize<HTMLDivElement>();

  const rows = mergeQuotes(symbols, initial.data, live);

  return (
    <div ref={ref} className="h-full">
      <ModuleBody state={initial} missingCapabilities={missingCapabilities} emptyMessage="No symbols to monitor.">
        {() => (
          <DataTable
            columns={quoteColumns}
            rows={rows}
            getRowKey={(q) => q.symbol}
            height={size.height || 320}
            rowHeight={26}
            onRowClick={(q) => executeInput(`${q.symbol} DES`)}
          />
        )}
      </ModuleBody>
    </div>
  );
}
