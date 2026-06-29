import type { ModulePanelProps } from '@tyche/module-sdk';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { Chip, TechnicalChartBody, TechnicalChartControls } from './TechnicalChart';
import type { HistoricalSeries } from '@tyche/contracts';

const RANGES = ['1mo', '3mo', '6mo', '1y', '5y'] as const;

function noSymbol(): Promise<EnvelopeResult<HistoricalSeries>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

export function ChartModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const range = (state.range as string) ?? '6mo';

  const history = useApiData(
    () => (symbol ? api.getHistory(symbol, { range, interval: '1d' }) : noSymbol()),
    [symbol, range],
  );
  useReportProvenance(reportProvenance, history.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <TechnicalChartControls
        state={state}
        setState={setState}
        leadingControls={RANGES.map((r) => (
          <Chip key={r} label={r} active={r === range} onClick={() => setState({ range: r })} />
        ))}
      />
      <div className="min-h-0 flex-1 p-2">
        <ModuleBody state={history} missingCapabilities={missingCapabilities}>
          {(series) => <TechnicalChartBody series={series} state={state} contextLabel={range} />}
        </ModuleBody>
      </div>
    </div>
  );
}
