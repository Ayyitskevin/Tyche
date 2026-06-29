/**
 * Customizable global keyboard shortcuts. A small, fixed set of app-level actions
 * with default chords; the user can rebind any of them, and the override is
 * persisted in `UserPreferences.keymap` (actionId → combo). Contextual keys (Tab
 * panel-cycling, Esc) stay fixed and are handled separately.
 *
 * A "combo" is a normalized lowercase string: optional `mod` (⌘ or Ctrl), then
 * `shift`, then `alt`, then the key — joined with `+`, e.g. `mod+shift+z`.
 */

export interface KeyAction {
  id: string;
  label: string;
  defaultCombo: string;
}

export const KEY_ACTIONS: readonly KeyAction[] = [
  { id: 'focusCommandBar', label: 'Focus command bar', defaultCombo: 'mod+k' },
  { id: 'saveWorkspace', label: 'Save workspace', defaultCombo: 'mod+s' },
  { id: 'reopenPanel', label: 'Reopen last closed panel', defaultCombo: 'mod+shift+z' },
] as const;

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt']);

/**
 * Normalized combo for a keydown event, or `null` if only modifier keys are held
 * (so a rebind capture waits for a "real" key). `mod` collapses ⌘ and Ctrl.
 */
export function comboFromEvent(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push('mod');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  parts.push(event.key.toLowerCase());
  return parts.join('+');
}

const KEY_LABELS: Record<string, string> = {
  mod: '⌘/Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  ' ': 'Space',
  escape: 'Esc',
};

/** Human-readable rendering of a combo, e.g. `mod+shift+z` → `⌘/Ctrl + Shift + Z`. */
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join(' + ');
}

export interface ResolvedBindings {
  /** actionId → combo (defaults overridden by the user's keymap). */
  byAction: Map<string, string>;
  /** combo → actionId (last write wins on a collision). */
  byCombo: Map<string, string>;
}

/** Merge the user's keymap overrides onto the defaults. Unknown keymap ids are ignored. */
export function resolveBindings(keymap: Record<string, string> = {}): ResolvedBindings {
  const byAction = new Map<string, string>();
  for (const action of KEY_ACTIONS) {
    const override = keymap[action.id];
    byAction.set(action.id, override && override.trim() ? override : action.defaultCombo);
  }
  const byCombo = new Map<string, string>();
  for (const [actionId, combo] of byAction) byCombo.set(combo, actionId);
  return { byAction, byCombo };
}

/** Combos bound to more than one action (a conflict the UI should flag). */
export function conflictingCombos(byAction: Map<string, string>): Set<string> {
  const counts = new Map<string, number>();
  for (const combo of byAction.values()) counts.set(combo, (counts.get(combo) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n > 1).map(([combo]) => combo));
}
