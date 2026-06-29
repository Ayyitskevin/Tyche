import { describe, it, expect } from 'vitest';
import { parseInline } from './markdown';

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
