import type { ScreenField, ScreenFilter, ScreenQuery, ScreenRow } from '@tyche/contracts';

/**
 * Pure equity-screen evaluation: filter rows by every criterion (AND), then sort
 * and limit. Dependency-free so it unit-tests in isolation and can run on either
 * side of the wire. Educational discovery only — a screen ranks data, it does not
 * recommend.
 */

function fieldValue(row: ScreenRow, field: ScreenField): number | string | null {
  switch (field) {
    case 'price':
      return row.price;
    case 'changePercent':
      return row.changePercent;
    case 'marketCap':
      return row.marketCap;
    case 'volume':
      return row.volume;
    case 'altmanZ':
      return row.altmanZ;
    case 'piotroskiF':
      return row.piotroskiF;
    case 'sector':
      return row.sector;
    case 'assetClass':
      return row.assetClass;
  }
}

function matchFilter(row: ScreenRow, filter: ScreenFilter): boolean {
  const value = fieldValue(row, filter.field);
  if (value === null) return false; // an unknown metric matches no numeric/text criterion

  // String comparison when either side is text (case-insensitive).
  if (typeof value === 'string' || typeof filter.value === 'string') {
    const a = String(value).toLowerCase();
    const b = String(filter.value).toLowerCase();
    switch (filter.op) {
      case 'eq':
        return a === b;
      case 'neq':
        return a !== b;
      case 'gt':
        return a > b;
      case 'gte':
        return a >= b;
      case 'lt':
        return a < b;
      case 'lte':
        return a <= b;
    }
  }

  const a = value;
  const b = filter.value as number;
  switch (filter.op) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'eq':
      return a === b;
    case 'neq':
      return a !== b;
  }
}

/** Apply a screen query to a candidate universe: filter (AND) → sort → limit. */
export function applyScreen(rows: ScreenRow[], query: ScreenQuery): ScreenRow[] {
  const filtered = rows.filter((row) => query.filters.every((f) => matchFilter(row, f)));

  if (query.sort) {
    const { field, dir } = query.sort;
    filtered.sort((x, y) => {
      const xv = fieldValue(x, field);
      const yv = fieldValue(y, field);
      if (xv === null && yv === null) return 0;
      if (xv === null) return 1; // nulls sort last regardless of direction
      if (yv === null) return -1;
      const cmp = typeof xv === 'number' && typeof yv === 'number' ? xv - yv : String(xv).localeCompare(String(yv));
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  return filtered.slice(0, query.limit);
}
