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
