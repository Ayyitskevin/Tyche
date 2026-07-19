import { describe, it, expect } from 'vitest';
import { assertModuleCoverage, moduleRegistry } from './registry';
import { moduleComponents } from './components';
import { BetaPlaceholder } from './BetaPlaceholder';

const REACT_LAZY = Symbol.for('react.lazy');

/**
 * Components are code-split (React.lazy), so identity with the eager module
 * export no longer holds — and importing every module here would be
 * misleading. What must stay true: commands route to the right moduleId, the
 * registered component is the registry entry (never the BetaPlaceholder
 * fallback), capability gating is intact, and the entries really are lazy.
 * That the lazy wrapper loads the *right* module is proven end-to-end by the
 * Playwright suite, which opens and renders every one of these panels.
 */
function expectRealModule(commandId: string, moduleId: string): void {
  expect(moduleRegistry.forCommand(commandId)?.moduleId).toBe(moduleId);
  const component = moduleRegistry.get(moduleId)?.component;
  expect(component).toBe(moduleComponents[moduleId]);
  expect(component).not.toBe(BetaPlaceholder);
}

describe('module coverage', () => {
  it('registers a module surface', () => {
    expect(moduleRegistry.size()).toBeGreaterThan(0);
  });

  it('routes each command to its real (non-placeholder) module', () => {
    expectRealModule('CFV', 'filing-viewer');
    expectRealModule('FOCUS', 'focus');
    expectRealModule('OMON', 'options-monitor');
    expectRealModule('TAS', 'time-and-sales');
    expectRealModule('EM', 'estimates');
    expectRealModule('ANR', 'analyst-ratings');
    expectRealModule('HDS', 'holders');
    expectRealModule('COMP', 'compare');
    expectRealModule('WEI', 'world-indices');
    expectRealModule('PORT', 'portfolio');
    expectRealModule('EQS', 'screener');
    expectRealModule('MOST', 'movers');
    expectRealModule('ECO', 'economics');
    expectRealModule('OVME', 'option-pricer');
    expectRealModule('CALC', 'calculator');
    expectRealModule('GIP', 'intraday-chart');
    expectRealModule('LAYOUT', 'layout-manager');
    expectRealModule('LAUNCH', 'launchpad');
    expectRealModule('EVT', 'events');
    expectRealModule('DEX', 'dex');
    expectRealModule('COMM', 'commodities');
  });

  it('keeps capability gating intact through the registry', () => {
    expect(moduleRegistry.get('portfolio')?.requiredCapabilities).toEqual(['quotes']);
    expect(moduleRegistry.get('screener')?.requiredCapabilities).toEqual(['screener']);
    expect(moduleRegistry.get('movers')?.requiredCapabilities).toEqual(['screener']);
    expect(moduleRegistry.get('economics')?.requiredCapabilities).toEqual(['economicSeries']);
    expect(moduleRegistry.get('intraday-chart')?.requiredCapabilities).toEqual(['intradayPrices']);
    expect(moduleRegistry.get('option-pricer')?.requiredCapabilities).toEqual([]);
    expect(moduleRegistry.get('calculator')?.requiredCapabilities).toEqual([]);
    expect(moduleRegistry.get('layout-manager')?.requiredCapabilities).toEqual([]);
    expect(moduleRegistry.get('events')?.requiredCapabilities).toEqual(['events']);
  });

  it('code-splits every module component via React.lazy', () => {
    for (const [moduleId, component] of Object.entries(moduleComponents)) {
      expect((component as { $$typeof?: symbol }).$$typeof, `${moduleId} should be lazy`).toBe(REACT_LAZY);
    }
  });

  it('every stable command has a real component (not BetaPlaceholder)', () => {
    expect(() => assertModuleCoverage()).not.toThrow();
  });

  it('throws when a stable command lacks a component', () => {
    expect(() =>
      assertModuleCoverage([{ id: 'XX', moduleId: 'nope', maturity: 'stable' }], {}),
    ).toThrow(/missing a module component/);
  });

  it('allows beta/stub commands to fall back', () => {
    expect(() =>
      assertModuleCoverage([{ id: 'YY', moduleId: 'nope', maturity: 'beta' }], {}),
    ).not.toThrow();
  });
});
