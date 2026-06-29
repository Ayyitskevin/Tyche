import { describe, it, expect } from 'vitest';
import { NO_CAPABILITIES, type ProviderCapabilities } from '@tyche/contracts';
import { createDefaultRegistry } from './commands';
import { parseCommand } from './parser';
import { executeCommand } from './executor';
import { createTerminalContext } from './context';

const registry = createDefaultRegistry();
const withCaps = (over: Partial<ProviderCapabilities>): ProviderCapabilities => ({
  ...NO_CAPABILITIES,
  ...over,
});

const run = (input: string, caps: Partial<ProviderCapabilities>, activeSymbol?: string) => {
  const context = createTerminalContext({
    availableCapabilities: withCaps(caps),
    activeInstrument: activeSymbol ? { symbol: activeSymbol, assetClass: 'equity' } : null,
  });
  return executeCommand(parseCommand(input, { registry }), context, registry);
};

describe('executor', () => {
  it('opens a panel and sets the active instrument for "AAPL DES"', () => {
    const effects = run('AAPL DES', { quotes: true });
    expect(effects.find((e) => e.kind === 'set-active-instrument')).toBeDefined();
    const open = effects.find((e) => e.kind === 'open-panel');
    expect(open).toMatchObject({ moduleId: 'description', symbol: 'AAPL', missingCapabilities: [] });
  });

  it('reports missing capabilities without throwing', () => {
    const effects = run('AAPL GP', { quotes: true }); // historicalPrices missing
    const open = effects.find((e) => e.kind === 'open-panel');
    expect(open?.kind).toBe('open-panel');
    if (open?.kind === 'open-panel') {
      expect(open.missingCapabilities).toContain('historicalPrices');
    }
  });

  it('warns when a required instrument is missing', () => {
    const effects = run('DES', { quotes: true });
    expect(effects).toEqual([
      expect.objectContaining({ kind: 'message', level: 'warn' }),
    ]);
  });

  it('uses the active instrument when none is typed', () => {
    const effects = run('GP', { historicalPrices: true }, 'MSFT');
    const open = effects.find((e) => e.kind === 'open-panel');
    expect(open).toMatchObject({ symbol: 'MSFT', moduleId: 'chart' });
  });

  it('routes free text to a search effect', () => {
    const effects = run('lookup something', {});
    expect(effects).toEqual([{ kind: 'search', query: 'lookup something' }]);
  });

  it('ECO carries the typed series id via args and never inherits the active instrument', () => {
    const typed = run('ECO UNRATE', { economicSeries: true }, 'AAPL').find((e) => e.kind === 'open-panel');
    expect(typed).toMatchObject({ moduleId: 'economics', symbol: null, args: ['UNRATE'] });

    // Bare ECO with an unrelated active equity must NOT request that equity as a series.
    const bare = run('ECO', { economicSeries: true }, 'AAPL').find((e) => e.kind === 'open-panel');
    expect(bare).toMatchObject({ moduleId: 'economics', symbol: null, args: [] });
  });
});
