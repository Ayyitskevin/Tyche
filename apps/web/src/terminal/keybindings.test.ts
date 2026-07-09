import { describe, it, expect } from 'vitest';
import {
  comboFromEvent,
  conflictingCombos,
  formatCombo,
  KEY_ACTIONS,
  LAYOUT_CHORD_COUNT,
  layoutChordIndex,
  resolveBindings,
} from './keybindings';

describe('comboFromEvent', () => {
  it('collapses meta/ctrl to mod and orders modifiers canonically', () => {
    expect(comboFromEvent({ key: 'k', metaKey: true })).toBe('mod+k');
    expect(comboFromEvent({ key: 'k', ctrlKey: true })).toBe('mod+k');
    expect(comboFromEvent({ key: 'Z', metaKey: true, shiftKey: true })).toBe('mod+shift+z');
    expect(comboFromEvent({ key: 'a', altKey: true, shiftKey: true })).toBe('shift+alt+a');
  });

  it('returns null while only modifier keys are held', () => {
    expect(comboFromEvent({ key: 'Shift', shiftKey: true })).toBeNull();
    expect(comboFromEvent({ key: 'Meta', metaKey: true })).toBeNull();
  });
});

describe('formatCombo', () => {
  it('renders a readable label', () => {
    expect(formatCombo('mod+shift+z')).toBe('⌘/Ctrl + Shift + Z');
    expect(formatCombo('mod+k')).toBe('⌘/Ctrl + K');
  });
});

describe('resolveBindings', () => {
  it('uses defaults when the keymap is empty', () => {
    const { byAction, byCombo } = resolveBindings({});
    expect(byAction.get('saveWorkspace')).toBe('mod+s');
    expect(byCombo.get('mod+k')).toBe('focusCommandBar');
  });

  it('applies a per-action override and ignores blank/unknown ids', () => {
    const { byAction, byCombo } = resolveBindings({ saveWorkspace: 'mod+e', focusCommandBar: '  ', nope: 'mod+x' });
    expect(byAction.get('saveWorkspace')).toBe('mod+e');
    expect(byAction.get('focusCommandBar')).toBe('mod+k'); // blank → default
    expect(byCombo.get('mod+e')).toBe('saveWorkspace');
    expect(byCombo.has('mod+x')).toBe(false); // unknown action id ignored
  });

  it('detects a conflict when two actions share a combo', () => {
    const { byAction } = resolveBindings({ saveWorkspace: 'mod+k' }); // collides with focusCommandBar
    expect(conflictingCombos(byAction).has('mod+k')).toBe(true);
    expect(conflictingCombos(resolveBindings({}).byAction).size).toBe(0);
  });

  it('registers the mod+1..9 layout chords, no conflicts, all rebindable', () => {
    const { byAction, byCombo } = resolveBindings({});
    for (let n = 1; n <= LAYOUT_CHORD_COUNT; n++) {
      expect(byAction.get(`switchLayout${n}`)).toBe(`mod+${n}`);
      expect(byCombo.get(`mod+${n}`)).toBe(`switchLayout${n}`);
    }
    expect(conflictingCombos(byAction).size).toBe(0); // defaults are all distinct
    // Rebinding a layout chord flows through the same keymap mechanism.
    expect(resolveBindings({ switchLayout1: 'mod+alt+1' }).byAction.get('switchLayout1')).toBe('mod+alt+1');
  });
});

describe('layoutChordIndex', () => {
  it('returns the 1-based index for a layout chord, else null', () => {
    expect(layoutChordIndex('switchLayout1')).toBe(1);
    expect(layoutChordIndex('switchLayout9')).toBe(9);
    expect(layoutChordIndex('saveWorkspace')).toBeNull();
    expect(layoutChordIndex('switchLayout0')).toBeNull();
    expect(layoutChordIndex('switchLayout10')).toBeNull();
    // Every layout KEY_ACTION maps back to a valid index.
    for (const a of KEY_ACTIONS.filter((k) => k.id.startsWith('switchLayout'))) {
      expect(layoutChordIndex(a.id)).not.toBeNull();
    }
  });
});
