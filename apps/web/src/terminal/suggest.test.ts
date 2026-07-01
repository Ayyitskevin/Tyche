import { describe, it, expect } from 'vitest';
import { DEFAULT_COMMANDS } from '@tyche/terminal-kernel';
import { buildCommandSuggestions, isSubsequence, wantsSymbolSuggestions } from './suggest';

const cmds = DEFAULT_COMMANDS;

describe('isSubsequence', () => {
  it('matches scattered characters in order', () => {
    expect(isSubsequence('OMN', 'OMON')).toBe(true);
    expect(isSubsequence('GP', 'GIP')).toBe(true);
    expect(isSubsequence('NOM', 'OMON')).toBe(false);
  });
});

describe('buildCommandSuggestions', () => {
  it('ranks id-prefix matches first', () => {
    const s = buildCommandSuggestions('G', cmds);
    expect(s[0]?.id).toBe('GIP'); // GIP and GP both prefix-match; ties break alphabetically
    expect(s.map((x) => x.id)).toContain('GP');
    expect(s.every((x) => x.kind === 'command')).toBe(true);
  });

  it('matches aliases and preserves the typed prefix in the completed line', () => {
    const s = buildCommandSuggestions('AAPL CHAR', cmds);
    expect(s[0]?.id).toBe('AAPL GP'); // CHART is a GP alias
    expect(s[0]?.label).toBe('AAPL GP');
  });

  it('fuzzy-matches a subsequence of the id', () => {
    const s = buildCommandSuggestions('OMN', cmds);
    expect(s.some((x) => x.id === 'OMON')).toBe(true);
  });

  it('matches command titles as a last resort', () => {
    const s = buildCommandSuggestions('movers', cmds);
    expect(s.some((x) => x.id === 'MOST')).toBe(true);
  });

  it('suggests nothing after a trailing space or for empty input', () => {
    expect(buildCommandSuggestions('AAPL ', cmds)).toEqual([]);
    expect(buildCommandSuggestions('', cmds)).toEqual([]);
    expect(buildCommandSuggestions('   ', cmds)).toEqual([]);
  });

  it('caps the list', () => {
    expect(buildCommandSuggestions('A', cmds, 4).length).toBeLessThanOrEqual(4);
  });
});

describe('wantsSymbolSuggestions', () => {
  it('asks for a search only while typing the first symbol-ish token', () => {
    expect(wantsSymbolSuggestions('AAP', cmds)).toBe('AAP');
    expect(wantsSymbolSuggestions('btc-usd', cmds)).toBe('btc-usd');
  });

  it('declines for later tokens, trailing space, exact commands, and non-symbols', () => {
    expect(wantsSymbolSuggestions('AAPL GP', cmds)).toBeNull();
    expect(wantsSymbolSuggestions('AAPL ', cmds)).toBeNull();
    expect(wantsSymbolSuggestions('GP', cmds)).toBeNull(); // exact command id
    expect(wantsSymbolSuggestions('HELP', cmds)).toBeNull();
    expect(wantsSymbolSuggestions('123', cmds)).toBeNull();
  });
});
