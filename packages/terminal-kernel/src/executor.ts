import type { CommandParseResult } from '@tyche/contracts';
import type { CommandRegistry } from './registry';
import { missingCapabilities } from './capabilities';
import type { CommandEffect, TerminalContext } from './types';

/**
 * Execute a parsed command against the current context, producing declarative
 * effects. Capability gaps never throw — they are attached to the open-panel
 * effect so the module can render a graceful "missing capability" state.
 */
export function executeCommand(
  parse: CommandParseResult,
  context: TerminalContext,
  registry: CommandRegistry,
): CommandEffect[] {
  if (!parse.ok) {
    return [{ kind: 'message', level: 'error', text: parse.error ?? 'Invalid command.' }];
  }

  if (parse.isFreeText) {
    return [{ kind: 'search', query: parse.query ?? parse.raw }];
  }

  const commandId = parse.commandId;
  if (!commandId) {
    return [{ kind: 'message', level: 'error', text: 'No command resolved.' }];
  }

  const command = registry.get(commandId);
  if (!command) {
    return [
      {
        kind: 'message',
        level: 'error',
        text: `Unknown command "${commandId}". Type HELP or ? for the reference.`,
      },
    ];
  }

  const symbol = parse.instrument?.symbol ?? context.activeInstrument?.symbol ?? null;
  const assetClass = parse.instrument?.assetClass ?? context.activeInstrument?.assetClass ?? null;
  const missing = missingCapabilities(command.requiredCapabilities, context.availableCapabilities);

  const effects: CommandEffect[] = [];
  if (parse.instrument) {
    effects.push({ kind: 'set-active-instrument', instrument: parse.instrument });
  }

  if (command.requiresInstrument && !symbol) {
    effects.push({
      kind: 'message',
      level: 'warn',
      text: `${command.id} needs an instrument. Type a symbol first, e.g. "AAPL ${command.id}".`,
    });
    return effects;
  }

  if (
    command.acceptedAssetClasses.length > 0 &&
    assetClass &&
    !command.acceptedAssetClasses.includes(assetClass)
  ) {
    effects.push({
      kind: 'message',
      level: 'warn',
      text: `${command.id} does not support ${assetClass} instruments.`,
    });
    return effects;
  }

  if (command.handler) {
    return [
      ...effects,
      ...command.handler({ parse, context, command, symbol, missingCapabilities: missing }),
    ];
  }

  const title = symbol ? `${symbol} · ${command.id}` : command.title;
  effects.push({
    kind: 'open-panel',
    moduleId: command.moduleId,
    commandId: command.id,
    symbol,
    title,
    args: parse.args,
    assetClass,
    missingCapabilities: missing,
  });
  return effects;
}
