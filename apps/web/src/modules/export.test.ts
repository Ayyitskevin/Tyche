import { describe, it, expect } from 'vitest';
import type { DataProvenance, FinancialStatement } from '@tyche/contracts';
import { csvEscape, financialsToCsv, financialsToJson, rowsToCsv, rowsToJson, type ExportColumn } from './export';

const prov: DataProvenance = {
  provider: 'mock',
  providerMode: 'mock',
  capability: 'fundamentals',
  retrievedAt: '2026-06-28T00:00:00.000Z',
  freshness: { asOf: '2025-12-28T00:00:00.000Z', tier: 'mock' },
};

const income2025: FinancialStatement = {
  symbol: 'AAPL',
  type: 'income',
  period: 'annual',
  fiscalDate: '2025-12-28',
  fiscalYear: 2025,
  currency: 'USD',
  lineItems: [
    { key: 'rev', label: 'Revenue, net', value: 400 },
    { key: 'ni', label: 'Net Income', value: 100 },
  ],
};
const income2024: FinancialStatement = {
  symbol: 'AAPL',
  type: 'income',
  period: 'annual',
  fiscalDate: '2024-12-28',
  fiscalYear: 2024,
  currency: 'USD',
  lineItems: [
    { key: 'rev', label: 'Revenue, net', value: 380 },
    { key: 'ni', label: 'Net Income', value: null },
  ],
};
const balance2025: FinancialStatement = {
  symbol: 'AAPL',
  type: 'balance',
  period: 'annual',
  fiscalDate: '2025-12-28',
  fiscalYear: 2025,
  currency: 'USD',
  lineItems: [{ key: 'assets', label: 'Total Assets', value: 1000 }],
};

const all = [income2024, income2025, balance2025];

describe('csvEscape', () => {
  it('quotes fields with commas and doubles inner quotes', () => {
    expect(csvEscape('Revenue, net')).toBe('"Revenue, net"');
    expect(csvEscape('he"llo')).toBe('"he""llo"');
    expect(csvEscape('plain')).toBe('plain');
  });
});

describe('financialsToCsv', () => {
  const csv = financialsToCsv(all, 'income', prov);
  const lines = csv.split('\n');

  it('prepends a provenance header', () => {
    expect(csv).toContain('# provider=mock');
    expect(csv).toContain('# providerMode=mock');
    expect(csv).toContain('# capability=fundamentals');
    expect(csv).toContain('# freshness.tier=mock');
    expect(csv).toContain('# freshness.asOf=2025-12-28T00:00:00.000Z');
  });

  it('pivots periods to columns, newest first', () => {
    expect(lines).toContain('Metric,2025,2024');
  });

  it('escapes labels with commas and renders rows by line-item key', () => {
    expect(lines).toContain('"Revenue, net",400,380');
  });

  it('renders null values as empty cells', () => {
    expect(lines).toContain('Net Income,100,');
  });

  it('filters to the selected statement type', () => {
    expect(csv).not.toContain('Total Assets');
  });

  it('labels quarterly columns with the quarter', () => {
    const q1: FinancialStatement = {
      symbol: 'AAPL',
      type: 'income',
      period: 'quarterly',
      fiscalDate: '2026-03-28',
      fiscalYear: 2026,
      fiscalQuarter: 1,
      currency: 'USD',
      lineItems: [{ key: 'rev', label: 'Revenue', value: 100 }],
    };
    expect(financialsToCsv([q1], 'income', prov)).toContain('Metric,2026 Q1');
  });

  it('degrades gracefully with null provenance', () => {
    const out = financialsToCsv(all, 'income', null);
    expect(out).toContain('# provenance=none');
    expect(out).toContain('Metric,2025,2024');
  });

  it('emits only a header when no statements match the type', () => {
    const out = financialsToCsv(all, 'cash_flow', prov);
    expect(out.split('\n').at(-1)).toBe('Metric');
  });
});

describe('financialsToJson', () => {
  it('embeds provenance and only the selected type, newest first', () => {
    const parsed = JSON.parse(financialsToJson(all, 'income', prov));
    expect(parsed.provenance.provider).toBe('mock');
    expect(parsed.type).toBe('income');
    expect(parsed.statements).toHaveLength(2);
    expect(parsed.statements.every((s: FinancialStatement) => s.type === 'income')).toBe(true);
    expect(parsed.statements[0].fiscalDate).toBe('2025-12-28');
  });

  it('handles null provenance', () => {
    const parsed = JSON.parse(financialsToJson(all, 'balance', null));
    expect(parsed.provenance).toBeNull();
    expect(parsed.statements).toHaveLength(1);
  });
});

describe('rowsToCsv / rowsToJson (generic table export)', () => {
  interface Row {
    symbol: string;
    price: number;
    changePercent: number;
    note: string | null;
  }
  const rows: Row[] = [
    { symbol: 'AAPL', price: 191.2, changePercent: 0.0234, note: 'a, b' },
    { symbol: 'MSFT', price: 402.5, changePercent: -0.011, note: null },
  ];
  const columns: Array<ExportColumn<Row>> = [
    { key: 'symbol', label: 'Symbol' },
    { key: 'price', label: 'Price' },
    // A `value` override wins over the raw field (raw number kept, not formatted).
    { key: 'changePercent', label: '% Chg', value: (r) => r.changePercent },
    { key: 'note', label: 'Note' },
  ];

  it('emits a provenance header, a label row, and raw field cells', () => {
    const csv = rowsToCsv(columns, rows, prov);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('# provider=mock');
    expect(lines).toContain('Symbol,Price,% Chg,Note');
    expect(lines).toContain('AAPL,191.2,0.0234,"a, b"'); // comma-bearing field is quoted
    expect(lines).toContain('MSFT,402.5,-0.011,'); // null → empty cell
  });

  it('marks a null-provenance export honestly', () => {
    expect(rowsToCsv(columns, rows, null).split('\n')[0]).toBe('# provenance=none (mock/unknown source)');
  });

  it('rowsToJson embeds provenance and the full raw rows', () => {
    const parsed = JSON.parse(rowsToJson(rows, prov)) as { provenance: unknown; rows: Row[] };
    expect(parsed.provenance).toMatchObject({ provider: 'mock' });
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ symbol: 'AAPL', note: 'a, b' });
  });
})
