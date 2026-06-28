import { executeCommand, parseCommand, type CommandEffect } from '@tyche/terminal-kernel';
import { commandRegistry } from './registry';
import { moduleRegistry } from '../modules/registry';
import { useTerminalStore } from '../state/terminalStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import { usePreferencesStore } from '../state/preferencesStore';

/** Parse + execute a command-bar line, applying the resulting effects to state. */
export function executeInput(raw: string): void {
  const terminal = useTerminalStore.getState();
  const defaultCommandId = usePreferencesStore.getState().preferences.defaultCommandId;

  const parse = parseCommand(raw, { registry: commandRegistry, defaultCommandId });
  const effects = executeCommand(
    parse,
    {
      activeInstrument: terminal.activeInstrument,
      recentCommands: terminal.recentCommands,
      defaultCommandId,
      availableCapabilities: terminal.capabilities,
    },
    commandRegistry,
  );

  terminal.pushRecentCommand(raw);
  for (const effect of effects) applyEffect(effect);
}

function applyEffect(effect: CommandEffect): void {
  const terminal = useTerminalStore.getState();
  const workspace = useWorkspaceStore.getState();

  switch (effect.kind) {
    case 'set-active-instrument':
      terminal.setActiveInstrument(effect.instrument);
      break;
    case 'open-panel': {
      const size = moduleRegistry.get(effect.moduleId)?.defaultPanelSize ?? { w: 5, h: 12 };
      workspace.openPanel({
        moduleId: effect.moduleId,
        commandId: effect.commandId,
        symbol: effect.symbol,
        title: effect.title,
        w: size.w,
        h: size.h,
        state: { args: effect.args },
      });
      break;
    }
    case 'search': {
      const size = moduleRegistry.get('search')?.defaultPanelSize ?? { w: 5, h: 12 };
      workspace.openPanel({
        moduleId: 'search',
        commandId: 'SECF',
        symbol: null,
        title: `Search · ${effect.query}`,
        w: size.w,
        h: size.h,
        state: { query: effect.query },
      });
      break;
    }
    case 'message':
      terminal.pushMessage(effect.level, effect.text);
      break;
    case 'noop':
      break;
  }
}
