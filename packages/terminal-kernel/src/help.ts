import type { CommandCategory } from '@tyche/contracts';
import type { CommandRegistry } from './registry';
import type { RegisteredCommand } from './types';

export interface HelpCategory {
  category: CommandCategory;
  commands: RegisteredCommand[];
}

const CATEGORY_ORDER: CommandCategory[] = [
  'core',
  'market-data',
  'research',
  'fundamentals',
  'news',
  'portfolio',
  'analytics',
  'crypto',
  'system',
];

export function buildHelpModel(registry: CommandRegistry): HelpCategory[] {
  const byCategory = new Map<CommandCategory, RegisteredCommand[]>();
  for (const command of registry.list()) {
    const list = byCategory.get(command.category) ?? [];
    list.push(command);
    byCategory.set(command.category, list);
  }
  return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    commands: (byCategory.get(category) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

export function formatCommandLine(command: RegisteredCommand): string {
  const aliases = command.aliases.length > 0 ? ` (${command.aliases.join(', ')})` : '';
  return `${command.id}${aliases} — ${command.title} [${command.maturity}]`;
}

export function renderHelpText(registry: CommandRegistry): string {
  const lines: string[] = ['Tyche — command reference', ''];
  for (const { category, commands } of buildHelpModel(registry)) {
    lines.push(category.toUpperCase());
    for (const command of commands) lines.push(`  ${formatCommandLine(command)}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/** Fuzzy-ish substring search across id/title/aliases/description. */
export function searchCommands(registry: CommandRegistry, query: string): RegisteredCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return registry.list();
  return registry.list().filter(
    (command) =>
      command.id.toLowerCase().includes(q) ||
      command.title.toLowerCase().includes(q) ||
      command.description.toLowerCase().includes(q) ||
      command.aliases.some((alias) => alias.toLowerCase().includes(q)),
  );
}
