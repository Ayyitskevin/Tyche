import type { Position } from '@tyche/contracts';

/**
 * Pure helpers for portfolio input: parsing a pasted/imported CSV of holdings,
 * and folding a holding into a position list (quantity-weighted average cost).
 * Kept free of React/DOM so they unit-test in the Node environment. No notion of
 * a trade — these only edit a research portfolio's durable inputs.
 */

export interface ParsedPosition {
  symbol: string;
  quantity: number;
  averageCost: number | null;
}

export interface PortfolioCsvResult {
  positions: ParsedPosition[];
  errors: string[];
}

/** Parse a numeric cell, tolerating a leading `$` and surrounding whitespace. */
function toNumber(raw: string | undefined): number | null {
  const cleaned = (raw ?? '').replace(/[$\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse `symbol,quantity[,averageCost]` rows. Blank lines and `#` comments are
 * skipped; a leading `Symbol,...`/`Ticker,...` header row is ignored. Each
 * malformed row yields a human-readable error rather than aborting the import.
 */
export function parsePortfolioCsv(raw: string): PortfolioCsvResult {
  const positions: ParsedPosition[] = [];
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/);
  let firstSignificant = true;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const isHeaderCandidate = firstSignificant;
    firstSignificant = false;

    const cells = trimmed.split(/[,\t]/).map((c) => c.trim());
    const symbol = (cells[0] ?? '').toUpperCase();
    const quantity = toNumber(cells[1]);

    if (quantity === null) {
      // Tolerate a single header row as the first non-blank/non-comment line.
      if (isHeaderCandidate && /^(symbol|ticker)$/i.test(cells[0] ?? '')) return;
      errors.push(`Line ${i + 1}: "${trimmed}" — quantity is not a number`);
      return;
    }
    if (!/[A-Za-z]/.test(symbol)) {
      errors.push(`Line ${i + 1}: "${trimmed}" — missing symbol`);
      return;
    }
    positions.push({ symbol, quantity, averageCost: cells.length > 2 ? toNumber(cells[2]) : null });
  });

  return { positions, errors };
}

/** Quantity-weighted blend of two average costs as a position is added to. */
function blendCost(existing: Position, input: ParsedPosition, combinedQuantity: number): number | null {
  const e = existing.averageCost;
  const n = input.averageCost;
  if (combinedQuantity === 0) return null;
  if (e !== undefined && n !== null) {
    return (existing.quantity * e + input.quantity * n) / combinedQuantity;
  }
  if (e !== undefined) return e;
  if (n !== null) return n;
  return null;
}

/**
 * Merge a holding into a position list keyed by symbol: a new symbol is
 * appended; an existing one has its quantity summed and average cost re-blended.
 * Returns a new array (never mutates the input).
 */
export function upsertPosition(positions: Position[], input: ParsedPosition): Position[] {
  const index = positions.findIndex((p) => p.symbol === input.symbol);
  if (index < 0) {
    const next: Position = { symbol: input.symbol, quantity: input.quantity };
    if (input.averageCost !== null) next.averageCost = input.averageCost;
    return [...positions, next];
  }
  const existing = positions[index]!;
  const combinedQuantity = existing.quantity + input.quantity;
  // A position offset exactly to flat carries no exposure — drop it rather than
  // leave a dead zero-quantity row.
  if (combinedQuantity === 0) return positions.filter((_, idx) => idx !== index);
  const cost = blendCost(existing, input, combinedQuantity);
  const merged: Position = { ...existing, quantity: combinedQuantity };
  if (cost !== null) merged.averageCost = cost;
  else delete merged.averageCost;
  const copy = [...positions];
  copy[index] = merged;
  return copy;
}

/** Fold many parsed holdings into a position list (left to right). */
export function upsertPositions(positions: Position[], inputs: ParsedPosition[]): Position[] {
  return inputs.reduce(upsertPosition, positions);
}
