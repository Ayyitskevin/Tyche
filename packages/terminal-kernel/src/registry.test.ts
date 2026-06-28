import { describe, it, expect } from 'vitest';
import { CommandRegistry } from './registry';
import { DEFAULT_COMMANDS, createDefaultRegistry } from './commands';
import type { RegisteredCommand } from './types';

const base: RegisteredCommand = {
  id: 'TEST',
  aliases: [],
  title: 'Test',
  description: 'A test command.',
  category: 'system',
  requiresInstrument: false,
  acceptedAssetClasses: [],
  requiredCapabilities: [],
  moduleId: 'test',
  defaultPanelSize: { w: 4, h: 6 },
  examples: [],
  maturity: 'stub',
};

describe('CommandRegistry validation', () => {
  it('registers and resolves a command by id and alias', () => {
    const registry = new CommandRegistry();
    registry.register({ ...base, aliases: ['T', 'TST'] });
    expect(registry.get('TEST')?.id).toBe('TEST');
    expect(registry.resolve('t')?.id).toBe('TEST');
    expect(registry.resolveCommand('TST')?.id).toBe('TEST');
  });

  it('rejects duplicate command ids', () => {
    const registry = new CommandRegistry();
    registry.register(base);
    expect(() => registry.register(base)).toThrow(/Duplicate command id/);
  });

  it('rejects alias collisions across commands', () => {
    const registry = new CommandRegistry();
    registry.register({ ...base, id: 'AAA', aliases: ['X'] });
    expect(() => registry.register({ ...base, id: 'BBB', aliases: ['X'] })).toThrow(
      /Alias collision/,
    );
  });

  it('rejects an invalid (non-uppercase) command id via schema', () => {
    const registry = new CommandRegistry();
    expect(() => registry.register({ ...base, id: 'lower' })).toThrow();
  });
});

describe('DEFAULT_COMMANDS', () => {
  it('all register without collisions', () => {
    const registry = createDefaultRegistry();
    expect(registry.size()).toBe(DEFAULT_COMMANDS.length);
  });

  it('every command declares a module and a panel size', () => {
    for (const command of DEFAULT_COMMANDS) {
      expect(command.moduleId.length).toBeGreaterThan(0);
      expect(command.defaultPanelSize.w).toBeGreaterThan(0);
      expect(command.defaultPanelSize.h).toBeGreaterThan(0);
    }
  });

  it('includes the required stable vertical-slice commands', () => {
    const registry = createDefaultRegistry();
    for (const id of ['HELP', 'SECF', 'DES', 'GP', 'HP', 'QM', 'W', 'N', 'CF', 'FA', 'AI']) {
      expect(registry.get(id), `missing ${id}`).toBeDefined();
    }
  });
});
