import type { KeyboardShortcut } from '@tyche/contracts';

/** Default keyboard shortcuts. `mod` = Cmd on macOS, Ctrl elsewhere. */
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { keys: 'mod+k', description: 'Focus the command bar', action: 'focus-command-bar' },
  { keys: 'mod+s', description: 'Save the current workspace', action: 'save-workspace' },
  { keys: 'mod+/', description: 'Open the help reference', commandId: 'HELP' },
  { keys: 'mod+shift+z', description: 'Reopen the last closed panel', action: 'undo-close' },
  { keys: 'esc', description: 'Blur the command bar / close overlays', action: 'escape' },
  { keys: 'alt+arrowright', description: 'Focus the next panel', action: 'focus-next' },
  { keys: 'alt+arrowleft', description: 'Focus the previous panel', action: 'focus-prev' },
];

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** Build a normalized chord string (e.g. `mod+shift+k`) from a keyboard event. */
export function eventToChord(event: KeyEventLike): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  parts.push(key);
  return parts.join('+');
}

export class ShortcutRegistry {
  private readonly map = new Map<string, KeyboardShortcut>();

  constructor(shortcuts: KeyboardShortcut[] = DEFAULT_SHORTCUTS) {
    this.registerAll(shortcuts);
  }

  register(shortcut: KeyboardShortcut): void {
    this.map.set(shortcut.keys.toLowerCase(), shortcut);
  }

  registerAll(shortcuts: KeyboardShortcut[]): void {
    for (const shortcut of shortcuts) this.register(shortcut);
  }

  match(event: KeyEventLike): KeyboardShortcut | undefined {
    return this.map.get(eventToChord(event));
  }

  list(): KeyboardShortcut[] {
    return [...this.map.values()];
  }
}
