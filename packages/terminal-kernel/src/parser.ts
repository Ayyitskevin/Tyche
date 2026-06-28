import type {
  AssetClass,
  CommandParseResult,
  InstrumentIdentifier,
  ParsedToken,
} from '@tyche/contracts';
import type { ResolvedCommand } from './registry';
import {
  ASSET_CLASS_KEYWORDS,
  DEFAULT_YELLOW_KEYS,
  inferAssetClass,
  isStrictSymbol,
  isSymbolLike,
} from './aliases';

/** Minimal surface the parser needs from a registry (a `CommandRegistry` fits). */
export interface ParserRegistry {
  resolveCommand(token: string): ResolvedCommand | null;
}

export interface ParseOptions {
  registry: ParserRegistry;
  /** Command used when only a symbol is typed (e.g. `AAPL` -> DES). */
  defaultCommandId?: string;
  yellowKeys?: ReadonlySet<string>;
  assetClassKeywords?: Readonly<Record<string, AssetClass>>;
}

/**
 * Parse a raw terminal input line into a structured {@link CommandParseResult}.
 *
 * Grammar (tolerant, original — does not depend on any proprietary behavior):
 *   `<symbol?> <yellow-key>* <command?> <args...>`
 *
 * - `AAPL`                -> default command (DES) on AAPL
 * - `AAPL DES`            -> DES on AAPL
 * - `AAPL US Equity DES`  -> DES on AAPL, yellow keys tolerated, equity hint
 * - `DES`                 -> DES on the active instrument
 * - `SECF apple`          -> SECF search with query "apple"
 * - `find tesla`          -> free-text search fallback
 */
export function parseCommand(input: string, options: ParseOptions): CommandParseResult {
  const raw = input;
  const trimmed = input.trim();
  const defaultCommandId = options.defaultCommandId ?? 'DES';
  const yellowKeys = options.yellowKeys ?? DEFAULT_YELLOW_KEYS;
  const assetKeywords = options.assetClassKeywords ?? ASSET_CLASS_KEYWORDS;

  const empty: CommandParseResult = {
    raw,
    tokens: [],
    commandId: null,
    matchedAlias: null,
    instrument: null,
    args: [],
    query: null,
    assetClassHint: null,
    isFreeText: false,
    ok: false,
    suggestions: [],
  };

  if (trimmed.length === 0) {
    return { ...empty, error: 'Empty command.' };
  }

  const rawTokens = trimmed.split(/\s+/);

  // 1) Command = the last token that resolves to a command id/alias.
  let commandId: string | null = null;
  let matchedAlias: string | null = null;
  let commandIndex = -1;
  let requiresInstrument = false;
  for (let i = 0; i < rawTokens.length; i++) {
    const resolved = options.registry.resolveCommand(rawTokens[i]!);
    if (resolved) {
      commandId = resolved.id;
      matchedAlias = resolved.alias;
      commandIndex = i;
      requiresInstrument = resolved.descriptor.requiresInstrument;
    }
  }

  // 2) Classify the remaining tokens.
  let assetClassHint: AssetClass | null = null;
  const strict: Array<{ idx: number; sym: string }> = [];
  const loose: Array<{ idx: number; sym: string }> = [];
  const yellowIdx = new Set<number>();

  for (let i = 0; i < rawTokens.length; i++) {
    if (i === commandIndex) continue;
    const tok = rawTokens[i]!;
    const upper = tok.toUpperCase();
    if (yellowKeys.has(upper)) {
      yellowIdx.add(i);
      const hint = assetKeywords[upper];
      if (hint && !assetClassHint) assetClassHint = hint;
      continue;
    }
    if (isStrictSymbol(tok)) {
      strict.push({ idx: i, sym: upper });
      continue;
    }
    if (isSymbolLike(tok)) {
      loose.push({ idx: i, sym: upper });
    }
  }

  // 3) Choose the instrument. Prefer a strict (upper-cased) ticker. A loose
  //    (lower-cased) candidate is only promoted to an instrument when the
  //    command requires one (`aapl des`) or it is the sole bare token (`aapl`).
  //    This keeps `SECF apple` and `lookup tesla` as queries, not tickers.
  const singleToken = rawTokens.length === 1;
  let instrumentIndex = -1;
  let instrumentSymbol: string | null = null;
  if (strict.length > 0) {
    instrumentIndex = strict[0]!.idx;
    instrumentSymbol = strict[0]!.sym;
  } else if (loose.length > 0 && (requiresInstrument || (commandId === null && singleToken))) {
    instrumentIndex = loose[0]!.idx;
    instrumentSymbol = loose[0]!.sym;
  }

  // 4) Everything not consumed becomes args / free-text query.
  const consumed = new Set<number>(yellowIdx);
  if (commandIndex >= 0) consumed.add(commandIndex);
  if (instrumentIndex >= 0) consumed.add(instrumentIndex);
  const args: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    if (!consumed.has(i)) args.push(rawTokens[i]!);
  }
  const query = args.length > 0 ? args.join(' ') : null;

  const instrument: InstrumentIdentifier | null = instrumentSymbol
    ? { symbol: instrumentSymbol, assetClass: inferAssetClass(instrumentSymbol, assetClassHint) }
    : null;

  // 5) Resolve final command / free-text disposition.
  let finalCommandId = commandId;
  let isFreeText = false;
  let ok = true;
  let error: string | undefined;

  if (commandId === null) {
    if (instrument) {
      finalCommandId = defaultCommandId;
    } else if (query) {
      isFreeText = true;
    } else {
      ok = false;
      error = 'Unrecognized command. Type HELP or ? for the command reference.';
    }
  }

  const tokens: ParsedToken[] = rawTokens.map((tok, i): ParsedToken => {
    if (i === commandIndex) return { raw: tok, kind: 'command', value: tok.toUpperCase() };
    if (i === instrumentIndex) return { raw: tok, kind: 'instrument', value: tok.toUpperCase() };
    if (yellowIdx.has(i)) return { raw: tok, kind: 'yellow-key', value: tok.toUpperCase() };
    return { raw: tok, kind: 'word', value: tok };
  });

  return {
    raw,
    tokens,
    commandId: finalCommandId,
    matchedAlias,
    instrument,
    args,
    query,
    assetClassHint,
    isFreeText,
    ok,
    suggestions: [],
    ...(error ? { error } : {}),
  };
}
