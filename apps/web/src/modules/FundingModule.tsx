import { useEffect, useState } from 'react';
import type { FundingRate } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, formatNumber, type Column } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useElementSize } from '../providers/useElementSize';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { formatRatePct, fundingCountdown } from './fundingView';

const POLL_MS = 30_000;

function rateTone(rate: number): string {
  if (rate > 0) return 'text-emerald-400';
  if (rate < 0) return 'text-red-400';
  return 'text-zinc-300';
}

/**
 * FUND — the perpetual-swap funding board: per-interval rate, annualized carry,
 * mark price, and countdown to the next funding. With a symbol it narrows to
 * that pair; without one it shows the venue's board (sorted by |carry|). This
 * is crypto market-structure data an equities-first terminal doesn't have.
 */
export function FundingModule({ symbol, setSymbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const [poll, setPoll] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setPoll((n) => n + 1);
      setNow(Date.now());
    }, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, []);

  const funding = useApiData<FundingRate[]>(
    () => api.getFunding(symbol ? [symbol] : []),
    [symbol, poll],
  );
  useReportProvenance(reportProvenance, funding.provenance);
  const top = funding.data?.[0];
  useReportSummary(
    reportSummary,
    top
      ? `Funding (${top.venue}): ${top.symbol} ${formatRatePct(top.rate)} per ${top.intervalHours}h ≈ ${top.annualizedPct.toFixed(1)}% APR`
      : null,
  );
  const [ref, size] = useElementSize<HTMLDivElement>();

  const columns: Array<Column<FundingRate>> = [
    {
      key: 'symbol',
      header: 'Symbol',
      width: '1.4fr',
      render: (r) => (
        <button type="button" className="text-sky-300 hover:underline" onClick={() => setSymbol?.(r.symbol)}>
          {r.symbol}
        </button>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      render: (r) => <span className={rateTone(r.rate)}>{formatRatePct(r.rate)}</span>,
    },
    {
      key: 'apr',
      header: 'Ann.',
      align: 'right',
      render: (r) => <span className={rateTone(r.rate)}>{r.annualizedPct.toFixed(1)}%</span>,
    },
    {
      key: 'mark',
      header: 'Mark',
      align: 'right',
      render: (r) => (r.markPrice !== undefined ? formatNumber(r.markPrice) : '—'),
    },
    { key: 'next', header: 'Next', align: 'right', render: (r) => fundingCountdown(r.nextFundingAt, now) },
  ];

  return (
    <div ref={ref} className="h-full">
      <ModuleBody state={funding} missingCapabilities={missingCapabilities} emptyMessage="No funding data.">
        {(rows) =>
          rows.length === 0 ? (
            <div className="p-4 text-xs text-zinc-500">No funding data for this symbol.</div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => `${r.venue}-${r.symbol}`}
              height={size.height || 320}
              rowHeight={22}
            />
          )
        }
      </ModuleBody>
    </div>
  );
}
