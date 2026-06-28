import type { Quote, QuoteBatch } from '@tyche/contracts';
import { changeToneClass, formatNumber, formatPercent, formatSigned, type Column } from '@tyche/ui';
import type { EnvelopeResult } from '../providers/apiClient';

export const quoteColumns: Array<Column<Quote>> = [
  { key: 'symbol', header: 'Symbol', width: '1.2fr', className: 'text-sky-300', render: (q) => q.symbol },
  { key: 'price', header: 'Last', align: 'right', render: (q) => formatNumber(q.price) },
  {
    key: 'change',
    header: 'Chg',
    align: 'right',
    render: (q) => <span className={changeToneClass(q.change)}>{formatSigned(q.change)}</span>,
  },
  {
    key: 'pct',
    header: '%',
    align: 'right',
    render: (q) => <span className={changeToneClass(q.change)}>{formatPercent(q.changePercent)}</span>,
  },
  {
    key: 'vol',
    header: 'Vol',
    align: 'right',
    render: (q) => formatNumber(q.volume, { compact: true, decimals: 1 }),
  },
];

export function emptyQuoteBatch(): Promise<EnvelopeResult<QuoteBatch>> {
  return Promise.resolve({ ok: true, data: [], provenance: null });
}

/** Merge a streaming quote map over an initial batch, preserving symbol order. */
export function mergeQuotes(symbols: string[], initial: QuoteBatch | null, live: Record<string, Quote>): Quote[] {
  const out: Quote[] = [];
  for (const symbol of symbols) {
    const quote = live[symbol] ?? initial?.find((q) => q.symbol === symbol);
    if (quote) out.push(quote);
  }
  return out;
}
