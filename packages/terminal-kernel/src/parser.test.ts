import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from './commands';
import { parseCommand } from './parser';

const registry = createDefaultRegistry();
const parse = (input: string) => parseCommand(input, { registry });

describe('parser: symbol + command grammar', () => {
  it('bare symbol defaults to DES', () => {
    const r = parse('AAPL');
    expect(r.ok).toBe(true);
    expect(r.commandId).toBe('DES');
    expect(r.instrument?.symbol).toBe('AAPL');
    expect(r.isFreeText).toBe(false);
  });

  it('parses "AAPL DES"', () => {
    const r = parse('AAPL DES');
    expect(r.commandId).toBe('DES');
    expect(r.instrument?.symbol).toBe('AAPL');
    expect(r.matchedAlias).toBe('DES');
  });

  it.each([
    ['AAPL GP', 'GP'],
    ['AAPL G', 'GP'],
    ['AAPL HP', 'HP'],
    ['AAPL N', 'N'],
    ['AAPL CF', 'CF'],
    ['AAPL FA', 'FA'],
  ])('parses "%s" -> %s on AAPL', (input, expected) => {
    const r = parse(input);
    expect(r.commandId).toBe(expected);
    expect(r.instrument?.symbol).toBe('AAPL');
  });

  it('lowercase "aapl des" still resolves the ticker', () => {
    const r = parse('aapl des');
    expect(r.commandId).toBe('DES');
    expect(r.instrument?.symbol).toBe('AAPL');
  });
});

describe('parser: commands without an instrument', () => {
  it.each([
    ['DES', 'DES'],
    ['GP', 'GP'],
    ['N', 'N'],
    ['QM', 'QM'],
    ['W', 'W'],
    ['WATCH', 'W'],
    ['HELP', 'HELP'],
    ['?', 'HELP'],
  ])('parses "%s" -> %s with no instrument', (input, expected) => {
    const r = parse(input);
    expect(r.commandId).toBe(expected);
    expect(r.instrument).toBeNull();
  });
});

describe('parser: search & free-text', () => {
  it('SECF apple keeps "apple" as a query, not a ticker', () => {
    const r = parse('SECF apple');
    expect(r.commandId).toBe('SECF');
    expect(r.instrument).toBeNull();
    expect(r.query).toBe('apple');
    expect(r.args).toEqual(['apple']);
  });

  it('falls back to free-text search for unrecognized lowercase input', () => {
    const r = parse('show me the money');
    expect(r.commandId).toBeNull();
    expect(r.isFreeText).toBe(true);
    expect(r.query).toBe('show me the money');
  });

  it('"find tesla" routes through the SECF alias', () => {
    const r = parse('find tesla');
    expect(r.commandId).toBe('SECF');
    expect(r.query).toBe('tesla');
  });
});

describe('parser: yellow-key tolerance', () => {
  it('tolerates Bloomberg-style tokens in "AAPL US Equity DES"', () => {
    const r = parse('AAPL US Equity DES');
    expect(r.commandId).toBe('DES');
    expect(r.instrument?.symbol).toBe('AAPL');
    expect(r.instrument?.assetClass).toBe('equity');
    expect(r.assetClassHint).toBe('equity');
    expect(r.args).toEqual([]);
    expect(r.tokens.filter((t) => t.kind === 'yellow-key')).toHaveLength(2);
  });
});

describe('parser: crypto + edge cases', () => {
  it('infers crypto asset class from BTC-USD', () => {
    const r = parse('BTC-USD GP');
    expect(r.instrument?.symbol).toBe('BTC-USD');
    expect(r.instrument?.assetClass).toBe('crypto');
  });

  it('empty input is not ok', () => {
    const r = parse('   ');
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });
});

describe('parser: performance', () => {
  it('parses common commands in well under 10ms each', () => {
    const inputs = ['AAPL', 'AAPL DES', 'AAPL GP', 'QM', 'SECF apple', 'AAPL US Equity DES'];
    const start = performance.now();
    const iterations = 2000;
    for (let i = 0; i < iterations; i++) {
      for (const input of inputs) parse(input);
    }
    const perParse = (performance.now() - start) / (iterations * inputs.length);
    expect(perParse).toBeLessThan(10);
  });
});
