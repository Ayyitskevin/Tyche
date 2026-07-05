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
  kind: 'command' | 'symbol' | 'argument';
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
 * Argument-level completions: once a command is fully typed, suggest values for
 * its positional argument, sourced from the command's own `examples` (the SSOT
 * in the kernel — no separate vocabulary to maintain). Only the FIRST arg of a
 * "command-first" example contributes, so `ECO`'s `ECO GDP` / `ECON CPIAUCSL`
 * yield GDP / CPIAUCSL, while a symbol-first example like `AAPL GP` is left to
 * the symbol suggester. Unlike command/symbol suggestions this DOES fire on a
 * trailing space (an empty partial after `ECO ` lists every known arg) — that
 * discoverability is the whole point of the affordance.
 */
export function buildArgumentSuggestions(
  value: string,
  commands: readonly CommandDescriptor[],
  limit = 6,
): Suggestion[] {
  const raw = value.replace(/^\s+/, '');
  if (raw.length === 0) return [];
  const endsWithSpace = /\s$/.test(raw);
  const tokens = raw.trimEnd().split(/\s+/);

  const matches = (token: string, c: CommandDescriptor): boolean => {
    const u = token.toUpperCase();
    return c.id === u || c.aliases.some((a) => a.toUpperCase() === u);
  };

  // The command is the first token that resolves to an id/alias; its arguments
  // follow it. (A leading symbol, as in `AAPL GP`, sits before the command.)
  const cmdIndex = tokens.findIndex((t) => commands.some((c) => matches(t, c)));
  if (cmdIndex === -1) return [];
  const command = commands.find((c) => matches(tokens[cmdIndex] ?? '', c));
  if (!command) return [];

  // The token being completed: the trailing partial, or a fresh empty arg after
  // a space. It only counts as an argument if it sits AFTER the command token.
  const partialIndex = endsWithSpace ? tokens.length : tokens.length - 1;
  if (partialIndex <= cmdIndex) return [];
  const partial = (endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '')).toUpperCase();

  // Vocabulary: the first argument token of each command-first example.
  const vocab = new Set<string>();
  for (const ex of command.examples) {
    const parts = ex.trim().split(/\s+/);
    const head = parts[0];
    const arg = parts[1];
    if (!head || !arg || !matches(head, command)) continue;
    vocab.add(arg);
  }
  if (vocab.size === 0) return [];

  const prefix = (endsWithSpace ? tokens : tokens.slice(0, -1)).join(' ');
  const ranked: Ranked[] = [];
  for (const arg of vocab) {
    const upper = arg.toUpperCase();
    let rank: number | null = null;
    if (partial.length === 0 || upper.startsWith(partial)) rank = 0;
    else if (isSubsequence(partial, upper)) rank = 1;
    if (rank === null) continue;
    const line = prefix ? `${prefix} ${arg}` : arg;
    ranked.push({ rank, suggestion: { id: line, label: arg, hint: command.title, kind: 'argument' } });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.suggestion.label.localeCompare(b.suggestion.label));
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
