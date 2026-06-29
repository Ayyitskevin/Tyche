import { describe, it, expect } from 'vitest';
import { assertModuleCoverage, moduleRegistry } from './registry';
import { FilingViewerModule } from './FilingViewerModule';
import { FocusModule } from './FocusModule';
import { OptionsMonitorModule } from './OptionsMonitorModule';

describe('module coverage', () => {
  it('registers a module surface', () => {
    expect(moduleRegistry.size()).toBeGreaterThan(0);
  });

  it('CFV routes to the real filing-viewer module', () => {
    expect(moduleRegistry.forCommand('CFV')?.moduleId).toBe('filing-viewer');
    expect(moduleRegistry.get('filing-viewer')?.component).toBe(FilingViewerModule);
  });

  it('FOCUS routes to the real focus module', () => {
    expect(moduleRegistry.forCommand('FOCUS')?.moduleId).toBe('focus');
    expect(moduleRegistry.get('focus')?.component).toBe(FocusModule);
  });

  it('OMON routes to the real options-monitor module', () => {
    expect(moduleRegistry.forCommand('OMON')?.moduleId).toBe('options-monitor');
    expect(moduleRegistry.get('options-monitor')?.component).toBe(OptionsMonitorModule);
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
