import { useState, type ReactNode, type UIEvent } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  /** CSS grid track size, e.g. '120px' or '1fr'. Defaults to '1fr'. */
  width?: string;
  render: (row: T, index: number) => ReactNode;
  className?: string;
  /** When true (and `onHeaderClick` is provided), the header cell is clickable. */
  sortable?: boolean;
}

export interface SortState {
  columnId: string;
  dir: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  rowHeight?: number;
  /** Container height in px. When omitted, the table fills its parent (no virtualization cap). */
  height?: number;
  overscan?: number;
  onRowClick?: (row: T, index: number) => void;
  selectedKey?: string | null;
  emptyLabel?: string;
  /** Active sort (for the header indicator). Sorting itself is done by the caller. */
  sort?: SortState | null;
  /** Called with a column key when a sortable header is clicked. */
  onHeaderClick?: (columnId: string) => void;
}

/**
 * A dense, windowed table. When `height` is provided it virtualizes rows so a
 * 100+ row quote monitor stays responsive; only the visible slice is rendered.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  rowHeight = 26,
  height,
  overscan = 6,
  onRowClick,
  selectedKey,
  emptyLabel = 'No rows',
  sort,
  onHeaderClick,
}: DataTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const gridTemplate = columns.map((c) => c.width ?? '1fr').join(' ');

  const virtualize = typeof height === 'number';
  const total = rows.length;
  const visibleCount = virtualize ? Math.ceil(height / rowHeight) + overscan * 2 : total;
  const start = virtualize ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const end = Math.min(total, start + visibleCount);
  const slice = rows.slice(start, end);
  const topPad = start * rowHeight;
  const bottomPad = Math.max(0, (total - end) * rowHeight);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (virtualize) setScrollTop(event.currentTarget.scrollTop);
  }

  function alignClass(align?: 'left' | 'right' | 'center'): string {
    if (align === 'right') return 'justify-end text-right';
    if (align === 'center') return 'justify-center text-center';
    return 'justify-start text-left';
  }

  return (
    <div className="flex h-full w-full flex-col font-mono text-xs">
      <div
        className="sticky top-0 z-10 grid border-b border-zinc-800 bg-zinc-900/95 text-[10px] uppercase tracking-wide text-zinc-500"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c) => {
          const sortable = Boolean(c.sortable && onHeaderClick);
          const active = sort?.columnId === c.key;
          return (
            <div key={c.key} className={`flex items-center px-2 py-1.5 ${alignClass(c.align)}`}>
              {sortable ? (
                <button
                  type="button"
                  onClick={() => onHeaderClick?.(c.key)}
                  className="flex items-center gap-0.5 uppercase tracking-wide hover:text-zinc-300"
                >
                  {c.header}
                  {active && <span className="text-sky-400">{sort?.dir === 'asc' ? '▲' : '▼'}</span>}
                </button>
              ) : (
                c.header
              )}
            </div>
          );
        })}
      </div>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-zinc-600">{emptyLabel}</div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-auto"
          style={virtualize ? { height } : undefined}
          onScroll={onScroll}
        >
          {topPad > 0 && <div style={{ height: topPad }} />}
          {slice.map((row, i) => {
            const index = start + i;
            const key = getRowKey(row, index);
            const selected = selectedKey != null && key === selectedKey;
            return (
              <div
                key={key}
                onClick={() => onRowClick?.(row, index)}
                style={{ height: rowHeight, gridTemplateColumns: gridTemplate }}
                className={`grid items-center border-b border-zinc-900 ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${selected ? 'bg-sky-500/10' : 'hover:bg-zinc-900/60'}`}
              >
                {columns.map((c) => (
                  <div
                    key={c.key}
                    className={`flex items-center overflow-hidden px-2 ${alignClass(c.align)} ${
                      c.className ?? 'text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{c.render(row, index)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {bottomPad > 0 && <div style={{ height: bottomPad }} />}
        </div>
      )}
    </div>
  );
}
