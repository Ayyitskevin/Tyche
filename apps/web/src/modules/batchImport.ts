import type { SearchResult } from '@tyche/contracts';
import type { EnvelopeResult } from '../providers/apiClient';

/** Defensive cap on how many candidate tokens a single paste/upload may yield. */
export const MAX_IMPORT_SYMBOLS = 1000;

/** Per-symbol classification produced by {@link validateSymbols}. */
export type SymbolStatus = 'valid' | 'duplicate' | 'unknown';

export interface SymbolValidation {
  symbol: string;
  status: SymbolStatus;
}

export interface BatchImportResult {
  /** Every candidate with its classification, in parse order. */
  results: SymbolValidation[];
  /** New symbols that resolved and are not already in the list. */
  valid: string[];
  /** Candidates already present in the target list. */
  duplicate: string[];
  /** Candidates that did not resolve to a real instrument. */
  unknown: string[];
}

export type SymbolSearchFn = (q: string) => Promise<EnvelopeResult<SearchResult[]>>;

/**
 * Parse a pasted / uploaded blob into a clean, ordered, de-duplicated symbol
 * list. Splits on newlines, commas, semicolons, tabs, and whitespace; trims;
 * strips surrounding quotes; uppercases; drops empties; and de-dupes preserving
 * first-seen order. Purely numeric tokens (CSV price/quantity columns) are
 * dropped since a symbol always contains a letter; everything else is treated as
 * a candidate and left for {@link validateSymbols} to resolve. Output is capped
 * at {@link MAX_IMPORT_SYMBOLS} to bound the validation pass.
 */
export function parseSymbolList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[\s,;]+/)) {
    const sym = normalizeSymbol(token);
    if (!sym || !/[A-Z]/.test(sym) || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= MAX_IMPORT_SYMBOLS) return out;
  }
  return out;
}

function normalizeSymbol(token: string): string {
  const stripped = token.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  return stripped.toUpperCase();
}

/**
 * Classify each candidate against the live universe via the search function and
 * the symbols already in the target list. A candidate is `valid` when a returned
 * `SearchResult.identifier.symbol` matches it case-insensitively, `duplicate`
 * when it is already in `existing`, and `unknown` otherwise. Runs with bounded
 * concurrency so a large paste does not flood the API.
 */
export async function validateSymbols(
  candidates: string[],
  existing: string[],
  search: SymbolSearchFn,
  concurrency = 6,
): Promise<BatchImportResult> {
  const existingSet = new Set(existing.map((s) => s.toUpperCase()));
  const results: SymbolValidation[] = new Array(candidates.length);

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const symbol = candidates[index]!;
      results[index] = { symbol, status: await classify(symbol, existingSet, search) };
    }
  }

  const pool = Math.max(1, Math.min(concurrency, candidates.length));
  await Promise.all(Array.from({ length: pool }, () => worker()));

  const valid: string[] = [];
  const duplicate: string[] = [];
  const unknown: string[] = [];
  for (const r of results) {
    if (r.status === 'valid') valid.push(r.symbol);
    else if (r.status === 'duplicate') duplicate.push(r.symbol);
    else unknown.push(r.symbol);
  }
  return { results, valid, duplicate, unknown };
}

async function classify(
  symbol: string,
  existing: Set<string>,
  search: SymbolSearchFn,
): Promise<SymbolStatus> {
  if (existing.has(symbol)) return 'duplicate';
  const res = await search(symbol);
  if (!res.ok) return 'unknown';
  const matched = res.data.some((hit) => hit.identifier.symbol.toUpperCase() === symbol);
  return matched ? 'valid' : 'unknown';
}
