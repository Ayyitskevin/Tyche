import type { DataProvenance } from '@tyche/contracts';
import type { Column } from '@tyche/ui';
import { downloadText, rowsToCsv, rowsToJson, type ExportColumn } from './export';

interface TableExportProps<T> {
  /** Filename base (no extension), e.g. `AAPL-ratings`. */
  name: string;
  rows: readonly T[];
  provenance: DataProvenance | null;
  /** The SAME columns passed to the module's DataTable — export cols derive from these. */
  columns?: ReadonlyArray<Column<T>>;
  /** Or provide export columns explicitly (for modules that don't render via DataTable). */
  exportColumns?: ReadonlyArray<ExportColumn<T>>;
}

/**
 * A compact CSV / JSON export control for any table module. Reuses the module's
 * existing DataTable columns (label from a string header, value from the
 * column's `value` accessor or the raw field), so a module gains provenance-
 * stamped export with a single element; modules that render a bespoke table pass
 * `exportColumns` directly. CSV carries the on-screen columns; JSON carries the
 * full raw rows. Disabled (but present) when there are no rows.
 */
export function TableExport<T>({ name, rows, provenance, columns, exportColumns }: TableExportProps<T>) {
  const empty = rows.length === 0;
  const cols: Array<ExportColumn<T>> =
    exportColumns?.slice() ??
    (columns ?? []).map((c) => ({
      key: c.key,
      label: typeof c.header === 'string' ? c.header : c.key,
      ...(c.value ? { value: c.value } : {}),
    }));

  const btn =
    'rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400 ' +
    'hover:border-zinc-600 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex items-center gap-1" title="Export the table (provenance included)">
      <button
        type="button"
        disabled={empty}
        onClick={() => downloadText(`${name}.csv`, 'text/csv;charset=utf-8', rowsToCsv(cols, rows, provenance))}
        className={btn}
      >
        CSV
      </button>
      <button
        type="button"
        disabled={empty}
        onClick={() => downloadText(`${name}.json`, 'application/json', rowsToJson(rows, provenance))}
        className={btn}
      >
        JSON
      </button>
    </div>
  );
}
