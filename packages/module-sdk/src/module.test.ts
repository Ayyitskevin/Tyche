import { describe, it, expect } from 'vitest';
import { NO_CAPABILITIES } from '@tyche/contracts';
import {
  ModuleRegistry,
  toManifest,
  validateModuleDefinition,
  type ModuleDefinition,
} from './index';

const sample: ModuleDefinition<string> = {
  moduleId: 'chart',
  title: 'Price chart',
  commandIds: ['GP', 'G'],
  requiredCapabilities: ['historicalPrices'],
  defaultPanelSize: { w: 6, h: 12 },
  maturity: 'stable',
  hasStreaming: false,
  component: 'ChartComponent',
};

describe('module manifest validation', () => {
  it('extracts a valid manifest', () => {
    const manifest = toManifest(sample);
    expect(manifest.moduleId).toBe('chart');
    expect(manifest.commandIds).toEqual(['GP', 'G']);
    expect(manifest.requiredCapabilities).toEqual(['historicalPrices']);
  });

  it('rejects a non-kebab module id', () => {
    const result = validateModuleDefinition({ ...sample, moduleId: 'Chart_Panel' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('requires at least one command id', () => {
    const result = validateModuleDefinition({ ...sample, commandIds: [] });
    expect(result.ok).toBe(false);
  });
});

describe('ModuleRegistry', () => {
  it('registers and resolves by id and command', () => {
    const registry = new ModuleRegistry<string>();
    registry.register(sample);
    expect(registry.get('chart')?.component).toBe('ChartComponent');
    expect(registry.forCommand('gp')?.moduleId).toBe('chart');
    expect(registry.size()).toBe(1);
  });

  it('rejects duplicate module ids', () => {
    const registry = new ModuleRegistry<string>();
    registry.register(sample);
    expect(() => registry.register(sample)).toThrow(/Duplicate moduleId/);
  });

  it('rejects a command claimed by two modules', () => {
    const registry = new ModuleRegistry<string>();
    registry.register(sample);
    expect(() =>
      registry.register({ ...sample, moduleId: 'other', commandIds: ['GP'] }),
    ).toThrow(/already maps to module/);
  });

  it('computes capability gaps', () => {
    const registry = new ModuleRegistry<string>();
    registry.register(sample);
    expect(registry.missingFor('chart', NO_CAPABILITIES)).toEqual(['historicalPrices']);
    expect(registry.missingFor('chart', { ...NO_CAPABILITIES, historicalPrices: true })).toEqual([]);
  });
});
