import type {
  AssetClass,
  CommandDescriptor,
  CommandParseResult,
  InstrumentIdentifier,
  ProviderCapabilities,
  ProviderCapability,
} from '@tyche/contracts';

/**
 * The mutable runtime context the kernel reasons about: the active instrument,
 * recent command history, the default command, and the union of capabilities
 * currently available from enabled providers.
 */
export interface TerminalContext {
  activeInstrument: InstrumentIdentifier | null;
  recentCommands: string[];
  defaultCommandId: string;
  availableCapabilities: ProviderCapabilities;
}

/**
 * The kernel is UI-agnostic: executing a command produces a list of declarative
 * effects which the host (the web app) interprets. This keeps the grammar and
 * routing fully unit-testable without a DOM.
 */
export type CommandEffect =
  | {
      kind: 'open-panel';
      moduleId: string;
      commandId: string;
      symbol: string | null;
      title: string;
      args: string[];
      assetClass: AssetClass | null;
      missingCapabilities: ProviderCapability[];
    }
  | { kind: 'set-active-instrument'; instrument: InstrumentIdentifier }
  | { kind: 'search'; query: string }
  | { kind: 'message'; level: 'info' | 'warn' | 'error'; text: string }
  | { kind: 'noop' };

export interface CommandHandlerArgs {
  parse: CommandParseResult;
  context: TerminalContext;
  command: RegisteredCommand;
  symbol: string | null;
  missingCapabilities: ProviderCapability[];
}

export type CommandHandler = (args: CommandHandlerArgs) => CommandEffect[];

/** A command descriptor plus its optional runtime handler. */
export interface RegisteredCommand extends CommandDescriptor {
  handler?: CommandHandler;
}
