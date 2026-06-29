import { Fragment } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { HistoricalSeries } from '@tyche/contracts';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { Chip, TechnicalChartBody, TechnicalChartControls } from './TechnicalChart';

const INTERVALS = ['1m', '5m', '15m', '30m', '1h'] as const;
const RANGES = ['1d', '5d'] as const;

function noSymbol(): Promise<EnvelopeResult<HistoricalSeries>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

export function IntradayChartModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const interval = (state.interval as string) ?? '5m';
  const range = (state.range as string) ?? '1d';

  const history = useApiData(
    () => (symbol ? api.getIntraday(symbol, { interval, range }) : noSymbol()),
    [symbol, interval, range],
  );
  useReportProvenance(reportProvenance, history.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <TechnicalChartControls
        state={state}
        setState={setState}
        leadingControls={
          <Fragment>
            {INTERVALS.map((i) => (
              <Chip key={i} label={i} active={i === interval} onClick={() => setState({ interval: i })} />
            ))}
            <span className="mx-1 h-3 w-px bg-zinc-800" />
            {RANGES.map((r) => (
              <Chip key={r} label={r} active={r === range} onClick={() => setState({ range: r })} />
            ))}
          </Fragment>
        }
      />
      <div className="min-h-0 flex-1 p-2">
        <ModuleBody state={history} missingCapabilities={missingCapabilities} emptyMessage="No intraday data.">
          {(series) => <TechnicalChartBody series={series} state={state} contextLabel={`${interval} · ${range}`} />}
        </ModuleBody>
      </div>
    </div>
  );
}
