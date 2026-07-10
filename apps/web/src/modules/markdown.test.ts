import { describe, it, expect } from 'vitest';
import { parseInline, safeHref } from './markdown';

describe('parseInline', () => {
  it('returns a single text token for plain text', () => {
    expect(parseInline('just words')).toEqual([{ type: 'text', content: 'just words' }]);
  });

  it('tokenizes bold, italic, and code spans', () => {
    expect(parseInline('a **b** c')).toEqual([
      { type: 'text', content: 'a ' },
      { type: 'bold', content: 'b' },
      { type: 'text', content: ' c' },
    ]);
    expect(parseInline('*em*')).toEqual([{ type: 'italic', content: 'em' }]);
    expect(parseInline('`x`')).toEqual([{ type: 'code', content: 'x' }]);
  });

  it('tokenizes a link with its href', () => {
    expect(parseInline('see [SEC](https://sec.gov) filing')).toEqual([
      { type: 'text', content: 'see ' },
      { type: 'link', content: 'SEC', href: 'https://sec.gov' },
      { type: 'text', content: ' filing' },
    ]);
  });

  it('handles multiple spans on one line', () => {
    const tokens = parseInline('**a** and *b* and `c`');
    expect(tokens.map((t) => t.type)).toEqual(['bold', 'text', 'italic', 'text', 'code']);
  });

  it('returns an empty list for an empty string', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('safeHref', () => {
  it('allows http(s) and mailto', () => {
    expect(safeHref('https://sec.gov')).toBe('https://sec.gov');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeHref('  https://sec.gov  ')).toBe('https://sec.gov'); // trimmed
  });

  it('rejects script-y schemes so an imported note body cannot become clickable XSS', () => {
    // Note bodies are attacker-reachable via imported tyche-notes.json.
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JavaScript:alert(1)')).toBeNull(); // scheme match is case-insensitive
    expect(safeHref('  javascript:alert(1)')).toBeNull(); // leading space doesn't smuggle it past
    expect(safeHref('data:text/html,<script>1</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});
