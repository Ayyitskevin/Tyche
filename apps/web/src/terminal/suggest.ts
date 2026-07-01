import type { CommandDescriptor } from '@tyche/contracts';

/**
 * Command-bar suggestion engine. Pure and synchronous for command matches so it
 * is unit-testable; the container layers async symbol suggestions (via the
 * provider-agnostic search API) on top.
 */

export interface Suggestion {
  /** The full input line this suggestion completes to (what Enter executes). */
  id: string;
  label: string;
  hint?: string;
  kind: 'command' | 'symbol';
}

/** True when `needle` is a subsequence of `hay` (both upper-cased by callers). */
export function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

interface Ranked {
  rank: number;
  suggestion: Suggestion;
}

/**
 * Rank commands against the token being typed. Prefix matches on the id win,
 * then prefix on an alias, then a subsequence ("fuzzy") match on the id, then a
 * substring of the title — so `QM`, `MON`, `OMN`, and `option` all find their
 * command. The completed line preserves everything before the current token.
 */
export function buildCommandSuggestions(
  value: string,
  commands: readonly CommandDescriptor[],
  limit = 6,
): Suggestion[] {
  const trimmed = value.trimStart();
  if (trimmed.trim().length === 0) return [];
  const parts = trimmed.trimEnd().split(/\s+/);
  // A trailing space means the previous token is complete — nothing to complete.
  if (/\s$/.test(value)) return [];
  const last = (parts[parts.length - 1] ?? '').toUpperCase();
  const prefix = parts.slice(0, -1).join(' ');
  if (last.length === 0) return [];

  const ranked: Ranked[] = [];
  for (const c of commands) {
    let rank: number | null = null;
    if (c.id.startsWith(last)) rank = 0;
    else if (c.aliases.some((a) => a.toUpperCase().startsWith(last))) rank = 1;
    else if (last.length >= 2 && isSubsequence(last, c.id)) rank = 2;
    else if (last.length >= 3 && c.title.toUpperCase().includes(last)) rank = 3;
    if (rank === null) continue;
    const line = prefix ? `${prefix} ${c.id}` : c.id;
    ranked.push({
      rank,
      suggestion: { id: line, label: line, hint: c.title, kind: 'command' },
    });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.suggestion.id.localeCompare(b.suggestion.id));
  return ranked.slice(0, limit).map((r) => r.suggestion);
}

/**
 * Whether the token being typed could be a symbol lookup worth an async search:
 * only the FIRST token (the instrument slot in the grammar), 1–12 symbol-ish
 * characters, and not already an exact command id (commands win over tickers).
 */
export function wantsSymbolSuggestions(value: string, commands: readonly CommandDescriptor[]): string | null {
  const trimmed = value.trimStart();
  if (trimmed.length === 0 || /\s/.test(trimmed.trimEnd()) || /\s$/.test(value)) return null;
  if (!/^[A-Za-z][A-Za-z0-9.\-]{0,11}$/.test(trimmed)) return null;
  const upper = trimmed.toUpperCase();
  if (commands.some((c) => c.id === upper || c.aliases.some((a) => a.toUpperCase() === upper))) return null;
  return trimmed;
}
