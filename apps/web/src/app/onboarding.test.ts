import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '@tyche/terminal-kernel';
import { ROLE_PRESETS } from './onboarding';

describe('onboarding role presets', () => {
  it('has unique ids and a blank escape hatch', () => {
    const ids = ROLE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('blank');
    expect(ROLE_PRESETS.find((p) => p.id === 'blank')?.seeds).toEqual([]);
  });

  it('every seed line contains a registered command id or alias', () => {
    const registry = createDefaultRegistry();
    for (const preset of ROLE_PRESETS) {
      for (const seed of preset.seeds) {
        const tokens = seed.trim().split(/\s+/);
        const anyRegistered = tokens.some((t) => registry.resolve(t.toUpperCase()) !== undefined);
        expect(anyRegistered, `no registered command in seed "${seed}"`).toBe(true);
      }
    }
  });

  it('non-blank presets seed at least three panels and carry a workspace name', () => {
    for (const preset of ROLE_PRESETS.filter((p) => p.id !== 'blank')) {
      expect(preset.seeds.length).toBeGreaterThanOrEqual(3);
      expect(preset.workspaceName.length).toBeGreaterThan(0);
      expect(preset.blurb.length).toBeGreaterThan(0);
    }
  });
});
