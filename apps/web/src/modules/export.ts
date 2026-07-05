import type { DataProvenance, FinancialStatement, StatementType } from '@tyche/contracts';

/**
 * Shared, framework-free export helpers for module data. Pure string builders +
 * one DOM download primitive, so the string builders stay unit-testable and the
 * download codepath lives in exactly one place (reused by FinancialsModule and
 * HistoryTableModule).
 */

/** Quote a CSV field when it contains a comma, quote, or newline (RFC 4180). */
export function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Commented, self-describing provenance header lines for a CSV export. */
export function provenanceCsvHeader(provenance: DataProvenance | null): string[] {
  if (!provenance) return ['# provenance=none (mock/unknown source)'];
  const f = provenance.freshness;
  const lines = [
    `# provider=${provenance.provider}`,
    `# providerMode=${provenance.providerMode}`,
    `# capability=${provenance.capability}`,
    `# retrievedAt=${provenance.retrievedAt}`,
    `# freshness.tier=${f.tier}`,
    `# freshness.asOf=${f.asOf}`,
  ];
  if (f.delaySeconds !== undefined) lines.push(`# freshness.delaySeconds=${f.delaySeconds}`);
  if (provenance.attribution) lines.push(`# attribution=${provenance.attribution}`);
  return lines;
}

/** A column for one fiscal period: a stable id and the human header label. */
function periodColumns(statements: FinancialStatement[]): Array<{ id: string; label: string }> {
  return statements.map((s) => ({
    id: s.fiscalDate,
    label: s.fiscalQuarter
      ? `${s.fiscalYear ?? s.fiscalDate.slice(0, 4)} Q${s.fiscalQuarter}`
      : String(s.fiscalYear ?? s.fiscalDate.slice(0, 4)),
  }));
}

/**
 * Pivot the selected statement type into rows (line items) × columns (fiscal
 * periods, newest first), prefixed with a provenance header. Mirrors the
 * on-screen matrix in FinancialsModule.
 */
export function financialsToCsv(
  statements: FinancialStatement[],
  type: StatementType,
  provenance: DataProvenance | null,
): string {
  const periods = statements
    .filter((s) => s.type === type)
    .sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
  const header = provenanceCsvHeader(provenance);
  if (periods.length === 0) {
    return [...header, 'Metric'].join('\n');
  }
  const cols = periodColumns(periods);
  const keys = periods[0]!.lineItems.map((li) => ({ key: li.key, label: li.label }));
  const valueByPeriod = new Map(periods.map((p) => [p.fiscalDate, new Map(p.lineItems.map((li) => [li.key, li.value]))]));

  const headerRow = ['Metric', ...cols.map((c) => csvEscape(c.label))].join(',');
  const rows = keys.map((k) => {
    const cells = cols.map((c) => {
      const v = valueByPeriod.get(c.id)?.get(k.key);
      return v === null || v === undefined ? '' : String(v);
    });
    return [csvEscape(k.label), ...cells].join(',');
  });
  return [...header, headerRow, ...rows].join('\n');
}

/** Serialize the selected statement type with its provenance embedded. */
export function financialsToJson(
  statements: FinancialStatement[],
  type: StatementType,
  provenance: DataProvenance | null,
): string {
  const filtered = statements
    .filter((s) => s.type === type)
    .sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate));
  return JSON.stringify({ provenance, type, statements: filtered }, null, 2);
}

/** A generic export column: a CSV header label + how to read the cell value. */
export interface ExportColumn<T> {
  /** Field key; also the default CSV source (`row[key]`) when no `value` is given. */
  key: string;
  /** Human header label for the CSV column. */
  label: string;
  /** Optional plain-value accessor; overrides `row[key]` for the CSV cell. */
  value?: (row: T, index: number) => string | number | null | undefined;
}

/**
 * CSV for an arbitrary row set: a provenance header, a labelled header row, and
 * one line per row. Cells come from each column's `value` accessor, falling back
 * to the raw `row[key]` — so field-keyed columns export their machine-readable
 * value (a raw number, not a formatted string). The provenance differentiator
 * rides in the comment header, same as the financials export.
 */
export function rowsToCsv<T>(
  columns: ReadonlyArray<ExportColumn<T>>,
  rows: readonly T[],
  provenance: DataProvenance | null,
): string {
  const header = provenanceCsvHeader(provenance);
  const headerRow = columns.map((c) => csvEscape(c.label)).join(',');
  const cellOf = (c: ExportColumn<T>, row: T, i: number): string => {
    const raw = c.value ? c.value(row, i) : (row as Record<string, unknown>)[c.key];
    return raw === null || raw === undefined ? '' : csvEscape(String(raw));
  };
  const body = rows.map((row, i) => columns.map((c) => cellOf(c, row, i)).join(','));
  return [...header, headerRow, ...body].join('\n');
}

/** JSON for an arbitrary row set: the full raw rows with provenance embedded. */
export function rowsToJson<T>(rows: readonly T[], provenance: DataProvenance | null): string {
  return JSON.stringify({ provenance, rows }, null, 2);
}

/** Trigger a client-side download of text content. The single download codepath. */
export function downloadText(filename: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
