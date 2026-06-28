import type { CommandDescriptor } from '@tyche/contracts';
import { CommandDescriptorSchema } from '@tyche/contracts';
import type { RegisteredCommand } from './types';

export interface ResolvedCommand {
  id: string;
  alias: string;
  descriptor: CommandDescriptor;
}

/**
 * A declarative, validated command registry. Each command's metadata is checked
 * against {@link CommandDescriptorSchema} on registration, and id/alias
 * collisions are rejected loudly so the command surface stays coherent.
 */
export class CommandRegistry {
  private readonly byId = new Map<string, RegisteredCommand>();
  private readonly aliasToId = new Map<string, string>();

  register(command: RegisteredCommand): void {
    const { handler, ...rest } = command;
    const descriptor = CommandDescriptorSchema.parse(rest);
    const id = descriptor.id;
    if (this.byId.has(id)) {
      throw new Error(`Duplicate command id: ${id}`);
    }
    const stored: RegisteredCommand = handler ? { ...descriptor, handler } : { ...descriptor };
    this.byId.set(id, stored);

    for (const token of [id, ...descriptor.aliases]) {
      const key = token.toUpperCase();
      const existing = this.aliasToId.get(key);
      if (existing && existing !== id) {
        throw new Error(`Alias collision: "${token}" maps to both ${existing} and ${id}`);
      }
      this.aliasToId.set(key, id);
    }
  }

  registerAll(commands: RegisteredCommand[]): void {
    for (const command of commands) this.register(command);
  }

  get(id: string): RegisteredCommand | undefined {
    return this.byId.get(id.toUpperCase());
  }

  /** Resolve a token (id or alias, case-insensitive) to its command. */
  resolve(token: string): RegisteredCommand | undefined {
    const id = this.aliasToId.get(token.toUpperCase());
    return id ? this.byId.get(id) : undefined;
  }

  /** Resolve a token to id + matched alias + descriptor, for the parser. */
  resolveCommand(token: string): ResolvedCommand | null {
    const id = this.aliasToId.get(token.toUpperCase());
    if (!id) return null;
    const descriptor = this.byId.get(id);
    if (!descriptor) return null;
    return { id, alias: token.toUpperCase(), descriptor };
  }

  has(token: string): boolean {
    return this.aliasToId.has(token.toUpperCase());
  }

  list(): RegisteredCommand[] {
    return [...this.byId.values()];
  }

  size(): number {
    return this.byId.size;
  }
}
