import { useEffect, useState } from 'react';
import type { Quote, QuoteBatch } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { DataTable, changeToneClass, formatNumber, type Column } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useElementSize } from '../providers/useElementSize';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';

const MAJORS = ['EUR-USD', 'USD-JPY', 'GBP-USD', 'USD-CHF', 'AUD-USD', 'USD-CAD', 'NZD-USD', 'EUR-GBP', 'EUR-JPY'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
const POLL_MS = 60_000;

/** Format an FX rate with pair-appropriate precision (JPY pairs quote in 100s). */
function rate(value: number): string {
  return formatNumber(value, { decimals: value >= 20 ? 2 : 4 });
}

/**
 * FX — the currency board and converter: major-pair rates with daily change
 * (live ECB reference rates when the frankfurter provider is enabled,
 * synthetic in mock mode) plus an amount converter that quotes any supported
 * pair on demand. Rows retarget linked panels, so `EUR-USD GP` is one click.
 */
export function FxModule({ symbol, setSymbol, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPoll((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // A pair-shaped active symbol joins the board at the top.
  const pairSymbol = symbol && /^[A-Z]{3}-[A-Z]{3}$/.test(symbol) ? symbol : null;
  const board = pairSymbol && !MAJORS.includes(pairSymbol) ? [pairSymbol, ...MAJORS] : MAJORS;

  const quotes = useApiData<QuoteBatch>(() => api.getQuotes(board), [board.join(','), poll]);
  useReportProvenance(reportProvenance, quotes.provenance);
  const top = quotes.data?.[0];
  useReportSummary(
    reportSummary,
    top ? `FX board: ${top.symbol} ${rate(top.price)} (${top.changePercent?.toFixed(2) ?? '0'}%)` : null,
  );
  const [ref, size] = useElementSize<HTMLDivElement>();

  const columns: Array<Column<Quote>> = [
    {
      key: 'pair',
      header: 'Pair',
      render: (q) => (
        <button type="button" className="text-sky-300 hover:underline" onClick={() => setSymbol?.(q.symbol)}>
          {q.symbol}
        </button>
      ),
    },
    { key: 'rate', header: 'Rate', align: 'right', render: (q) => <span className="text-zinc-100">{rate(q.price)}</span> },
    {
      key: 'chg',
      header: 'Chg %',
      align: 'right',
      render: (q) => (
        <span className={changeToneClass(q.changePercent ?? 0)}>
          {(q.changePercent ?? 0) >= 0 ? '+' : ''}
          {(q.changePercent ?? 0).toFixed(2)}%
        </span>
      ),
    },
    { key: 'prev', header: 'Prev', align: 'right', render: (q) => (q.prevClose !== undefined ? rate(q.prevClose) : '—') },
  ];

  return (
    <div ref={ref} className="flex h-full flex-col">
      <ModuleBody state={quotes} missingCapabilities={missingCapabilities} emptyMessage="No FX rates available.">
        {(rows) => (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(q) => q.symbol}
            height={Math.max(120, (size.height || 320) - 74)}
            rowHeight={22}
          />
        )}
      </ModuleBody>
      <Converter />
    </div>
  );
}

function Converter() {
  const [amount, setAmount] = useState('1000');
  const [from, setFrom] = useState('EUR');
  const [to, setTo] = useState('USD');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function convert() {
    const value = Number(amount);
    if (!Number.isFinite(value) || from === to) {
      setResult(from === to ? `${amount} ${to}` : null);
      return;
    }
    setBusy(true);
    const direct = await api.getQuote(`${from}-${to}`);
    let converted: number | null = null;
    if (direct.ok && direct.data) {
      converted = value * direct.data.price;
    } else {
      const inverse = await api.getQuote(`${to}-${from}`);
      if (inverse.ok && inverse.data && inverse.data.price > 0) converted = value / inverse.data.price;
    }
    setBusy(false);
    setResult(converted !== null ? `${formatNumber(converted, { decimals: 2 })} ${to}` : 'No rate for this pair.');
  }

  const select = 'rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-xs text-zinc-200 focus:outline-none';

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-zinc-900 px-2 py-1.5 text-xs">
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Amount"
        className="w-20 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-xs text-zinc-100 focus:border-sky-500/40 focus:outline-none"
      />
      <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From currency" className={select}>
        {CURRENCIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <span className="text-zinc-600">→</span>
      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To currency" className={select}>
        {CURRENCIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => void convert()}
        className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        Convert
      </button>
      {result && <span className="font-mono text-zinc-100">{result}</span>}
    </div>
  );
}
