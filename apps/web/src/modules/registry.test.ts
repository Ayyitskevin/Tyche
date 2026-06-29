import { describe, it, expect } from 'vitest';
import { assertModuleCoverage, moduleRegistry } from './registry';
import { FilingViewerModule } from './FilingViewerModule';
import { FocusModule } from './FocusModule';
import { OptionsMonitorModule } from './OptionsMonitorModule';
import { TimeAndSalesModule } from './TimeAndSalesModule';
import { EstimatesModule } from './EstimatesModule';
import { AnalystRatingsModule } from './AnalystRatingsModule';
import { HoldersModule } from './HoldersModule';
import { ComparisonModule } from './ComparisonModule';
import { WorldIndicesModule } from './WorldIndicesModule';
import { PortfolioModule } from './PortfolioModule';
import { ScreenerModule } from './ScreenerModule';
import { MoversModule } from './MoversModule';

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

  it('TAS routes to the real time-and-sales module', () => {
    expect(moduleRegistry.forCommand('TAS')?.moduleId).toBe('time-and-sales');
    expect(moduleRegistry.get('time-and-sales')?.component).toBe(TimeAndSalesModule);
  });

  it('EM / ANR / HDS route to their real modules', () => {
    expect(moduleRegistry.get('estimates')?.component).toBe(EstimatesModule);
    expect(moduleRegistry.get('analyst-ratings')?.component).toBe(AnalystRatingsModule);
    expect(moduleRegistry.get('holders')?.component).toBe(HoldersModule);
  });

  it('COMP routes to the real comparison module', () => {
    expect(moduleRegistry.forCommand('COMP')?.moduleId).toBe('compare');
    expect(moduleRegistry.get('compare')?.component).toBe(ComparisonModule);
  });

  it('WEI routes to the real world-indices module', () => {
    expect(moduleRegistry.forCommand('WEI')?.moduleId).toBe('world-indices');
    expect(moduleRegistry.get('world-indices')?.component).toBe(WorldIndicesModule);
  });

  it('PORT routes to the real portfolio module and gates on quotes', () => {
    expect(moduleRegistry.forCommand('PORT')?.moduleId).toBe('portfolio');
    expect(moduleRegistry.get('portfolio')?.component).toBe(PortfolioModule);
    expect(moduleRegistry.get('portfolio')?.requiredCapabilities).toEqual(['quotes']);
  });

  it('EQS routes to the real screener module and gates on the screener capability', () => {
    expect(moduleRegistry.forCommand('EQS')?.moduleId).toBe('screener');
    expect(moduleRegistry.get('screener')?.component).toBe(ScreenerModule);
    expect(moduleRegistry.get('screener')?.requiredCapabilities).toEqual(['screener']);
  });

  it('MOST routes to the real movers module (reuses the screener capability)', () => {
    expect(moduleRegistry.forCommand('MOST')?.moduleId).toBe('movers');
    expect(moduleRegistry.get('movers')?.component).toBe(MoversModule);
    expect(moduleRegistry.get('movers')?.requiredCapabilities).toEqual(['screener']);
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
