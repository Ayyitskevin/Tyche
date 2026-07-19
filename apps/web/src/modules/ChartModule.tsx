import { Fragment, useEffect, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Candle, HistoricalSeries } from '@tyche/contracts';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';
import { Chip, TechnicalChartBody, TechnicalChartControls } from './TechnicalChart';

const RANGES = ['1mo', '3mo', '6mo', '1y', '5y'] as const;

interface ChartData {
  primary: HistoricalSeries;
  comparison: { symbol: string; candles: Candle[] } | null;
}

function noSymbol(): Promise<EnvelopeResult<ChartData>> {
  return Promise.resolve({ ok: false, error: { kind: 'bad_request', message: 'No symbol' }, provenance: null });
}

/**
 * Load the primary daily history and, when a `compareSym` is set, a second series
 * for the overlay. The comparison fetch is best-effort: a failed/empty comparison
 * (or one that equals the primary) simply drops the overlay — the primary chart
 * still renders. Provenance reported to the frame is always the primary's.
 */
async function loadChart(symbol: string, range: string, compareSym: string): Promise<EnvelopeResult<ChartData>> {
  const primary = await api.getHistory(symbol, { range, interval: '1d' });
  if (!primary.ok) return primary;
  let comparison: ChartData['comparison'] = null;
  if (compareSym && compareSym !== symbol.toUpperCase()) {
    const cmp = await api.getHistory(compareSym, { range, interval: '1d' });
    if (cmp.ok && cmp.data.candles.length > 0) {
      comparison = { symbol: cmp.data.symbol, candles: cmp.data.candles };
    }
  }
  return { ok: true, data: { primary: primary.data, comparison }, provenance: primary.provenance };
}

export function ChartModule({ symbol, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const range = (state.range as string) ?? '6mo';
  const compareSym = (state.compare as string) ?? '';

  const chart = useApiData(
    () => (symbol ? loadChart(symbol, range, compareSym) : noSymbol()),
    [symbol, range, compareSym],
  );
  useReportProvenance(reportProvenance, chart.provenance);

  if (!symbol) return <SymbolRequired />;

  return (
    <div className="flex h-full flex-col">
      <TechnicalChartControls
        state={state}
        setState={setState}
        leadingControls={
          <Fragment>
            {RANGES.map((r) => (
              <Chip key={r} label={r} active={r === range} onClick={() => setState({ range: r })} />
            ))}
            <span className="mx-1 h-3 w-px bg-zinc-800" />
            <CompareInput value={compareSym} onCommit={(v) => setState({ compare: v })} />
          </Fragment>
        }
      />
      <div className="min-h-0 flex-1 p-2">
        <ModuleBody state={chart} missingCapabilities={missingCapabilities}>
          {(data) => (
            <TechnicalChartBody
              series={data.primary}
              state={state}
              contextLabel={range}
              comparison={data.comparison}
            />
          )}
        </ModuleBody>
      </div>
    </div>
  );
}

interface CompareInputProps {
  value: string;
  onCommit: (value: string) => void;
}

/**
 * Compact "vs SYMBOL" comparison input for overlaying a benchmark on the chart.
 * Commits on Enter or blur (upper-cased, trimmed), Escape reverts, and the ×
 * clears it — so a keystroke never re-fetches until the symbol is committed.
 */
function CompareInput({ value, onCommit }: CompareInputProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim().toUpperCase();
    if (next !== value) onCommit(next);
  };
  return (
    <span className="flex items-center gap-1 text-[11px] text-zinc-500">
      vs
      <input
        aria-label="Compare symbol"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        onBlur={commit}
        placeholder="symbol"
        className="w-20 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 font-mono text-[11px] uppercase text-zinc-200 placeholder:normal-case placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onCommit('')}
          aria-label="Clear comparison"
          className="text-zinc-500 hover:text-zinc-300"
        >
          ×
        </button>
      )}
    </span>
  );
}
