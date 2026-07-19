import { describe, it, expect } from 'vitest';
import { DESKS, deskSeeds, recommendedDesk } from './desks';

const research = DESKS.find((d) => d.id === 'research')!;
const macro = DESKS.find((d) => d.id === 'macro')!;

describe('deskSeeds', () => {
  it('prefixes symbol-scoped commands with the symbol', () => {
    expect(deskSeeds(research, 'AAPL')).toEqual(['AAPL DES', 'AAPL GP', 'AAPL FA', 'AAPL CF']);
  });

  it('opens nothing for a symbol desk with no symbol', () => {
    expect(deskSeeds(research, null)).toEqual([]);
  });

  it('returns macro desk lines verbatim, symbol or not', () => {
    expect(deskSeeds(macro, null)).toEqual(['WEI', 'ECO GDP', 'YCRV', 'ECOC']);
    expect(deskSeeds(macro, 'AAPL')).toEqual(['WEI', 'ECO GDP', 'YCRV', 'ECOC']);
  });
});

describe('recommendedDesk', () => {
  it('recommends crypto for crypto, research otherwise', () => {
    expect(recommendedDesk('crypto')).toBe('crypto');
    expect(recommendedDesk('equity')).toBe('research');
    expect(recommendedDesk(null)).toBe('research');
  });
});

describe('DESKS', () => {
  it('names valid command tokens (uppercase id, optional arg) and unique desk ids', () => {
    const ids = new Set<string>();
    for (const desk of DESKS) {
      expect(ids.has(desk.id)).toBe(false);
      ids.add(desk.id);
      expect(desk.commands.length).toBeGreaterThan(0);
      for (const line of desk.commands) {
        expect(line.split(' ')[0]).toMatch(/^[A-Z][A-Z0-9]*$/);
      }
    }
  });
});
