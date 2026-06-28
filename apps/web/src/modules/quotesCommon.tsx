import type { Quote, QuoteBatch } from '@tyche/contracts';
import {
  changeToneClass,
  formatNumber,
  formatPercent,
  formatSigned,
  type Column,
  type SortState,
} from '@tyche/ui';
import type { EnvelopeResult } from '../providers/apiClient';

/** Compact relative age of a quote timestamp (seconds/minutes/hours). */
export function formatAge(timestamp: string, now: number = Date.now()): string {
  const ms = now - Date.parse(timestamp);
  if (!Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

interface QuoteColumnEntry {
  column: Column<Quote>;
  sortValue: (q: Quote) => number | string;
}

/** Catalog of selectable quote-board columns, keyed by column id. */
export const QUOTE_COLUMN_CATALOG: Record<string, QuoteColumnEntry> = {
  symbol: {
    column: { key: 'symbol', header: 'Symbol', width: '1.2fr', className: 'text-sky-300', sortable: true, render: (q) => q.symbol },
    sortValue: (q) => q.symbol,
  },
  price: {
    column: { key: 'price', header: 'Last', align: 'right', sortable: true, render: (q) => formatNumber(q.price) },
    sortValue: (q) => q.price,
  },
  change: {
    column: {
      key: 'change',
      header: 'Chg',
      align: 'right',
      sortable: true,
      render: (q) => <span className={changeToneClass(q.change)}>{formatSigned(q.change)}</span>,
    },
    sortValue: (q) => q.change ?? 0,
  },
  pct: {
    column: {
      key: 'pct',
      header: '%',
      align: 'right',
      sortable: true,
      render: (q) => <span className={changeToneClass(q.change)}>{formatPercent(q.changePercent)}</span>,
    },
    sortValue: (q) => q.changePercent ?? 0,
  },
  vol: {
    column: { key: 'vol', header: 'Vol', align: 'right', sortable: true, render: (q) => formatNumber(q.volume, { compact: true, decimals: 1 }) },
    sortValue: (q) => q.volume ?? 0,
  },
  bid: {
    column: { key: 'bid', header: 'Bid', align: 'right', sortable: true, render: (q) => formatNumber(q.bid) },
    sortValue: (q) => q.bid ?? 0,
  },
  ask: {
    column: { key: 'ask', header: 'Ask', align: 'right', sortable: true, render: (q) => formatNumber(q.ask) },
    sortValue: (q) => q.ask ?? 0,
  },
  dayHigh: {
    column: { key: 'dayHigh', header: 'High', align: 'right', sortable: true, render: (q) => formatNumber(q.dayHigh) },
    sortValue: (q) => q.dayHigh ?? 0,
  },
  dayLow: {
    column: { key: 'dayLow', header: 'Low', align: 'right', sortable: true, render: (q) => formatNumber(q.dayLow) },
    sortValue: (q) => q.dayLow ?? 0,
  },
  open: {
    column: { key: 'open', header: 'Open', align: 'right', sortable: true, render: (q) => formatNumber(q.open) },
    sortValue: (q) => q.open ?? 0,
  },
  prevClose: {
    column: { key: 'prevClose', header: 'PrevCls', align: 'right', sortable: true, render: (q) => formatNumber(q.prevClose) },
    sortValue: (q) => q.prevClose ?? 0,
  },
  age: {
    column: {
      key: 'age',
      header: 'Age',
      align: 'right',
      sortable: true,
      render: (q) => <span className="text-zinc-500">{formatAge(q.timestamp)}</span>,
    },
    sortValue: (q) => Date.parse(q.timestamp) || 0,
  },
};

export const DEFAULT_QUOTE_COLUMNS = ['symbol', 'price', 'change', 'pct', 'vol', 'age'];

/** Build an ordered column list from catalog ids; unknown ids are dropped. */
export function buildQuoteColumns(ids: string[]): Array<Column<Quote>> {
  return ids
    .map((id) => QUOTE_COLUMN_CATALOG[id]?.column)
    .filter((c): c is Column<Quote> => Boolean(c));
}

/** Backward-compatible default 5-column set (no age) used by the watchlist. */
export const quoteColumns: Array<Column<Quote>> = buildQuoteColumns([
  'symbol',
  'price',
  'change',
  'pct',
  'vol',
]);

/** Stable sort over merged quotes by a catalog column; symbol tiebreak. */
export function sortQuotes(rows: Quote[], sort: SortState | null): Quote[] {
  if (!sort) return rows;
  const entry = QUOTE_COLUMN_CATALOG[sort.columnId];
  if (!entry) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = entry.sortValue(a);
    const vb = entry.sortValue(b);
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
    if (cmp !== 0) return cmp * dir;
    return a.symbol.localeCompare(b.symbol);
  });
}

/** Header-click sort cycle: none → desc → asc → none. */
export function cycleSort(current: SortState | null, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) return { columnId, dir: 'desc' };
  if (current.dir === 'desc') return { columnId, dir: 'asc' };
  return null;
}

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
