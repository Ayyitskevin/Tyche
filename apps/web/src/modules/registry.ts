import { ModuleRegistry, type ModuleDefinition } from '@tyche/module-sdk';
import { DEFAULT_COMMANDS } from '@tyche/terminal-kernel';
import type { ModuleComponent } from './types';
import { moduleComponents } from './components';
import { BetaPlaceholder } from './BetaPlaceholder';

const STREAMING_MODULES = new Set(['quote-monitor', 'watchlist', 'time-and-sales']);

/**
 * Build module definitions from the kernel's command surface (single source of
 * truth). Modules without a full component fall back to the beta placeholder.
 */
function buildDefinitions(): Array<ModuleDefinition<ModuleComponent>> {
  const byModule = new Map<string, ModuleDefinition<ModuleComponent>>();
  for (const command of DEFAULT_COMMANDS) {
    const existing = byModule.get(command.moduleId);
    if (existing) {
      if (!existing.commandIds.includes(command.id)) existing.commandIds.push(command.id);
      for (const cap of command.requiredCapabilities) {
        if (!existing.requiredCapabilities!.includes(cap)) existing.requiredCapabilities!.push(cap);
      }
      continue;
    }
    byModule.set(command.moduleId, {
      moduleId: command.moduleId,
      title: command.title,
      commandIds: [command.id],
      requiredCapabilities: [...command.requiredCapabilities],
      defaultPanelSize: command.defaultPanelSize,
      maturity: command.maturity,
      hasStreaming: STREAMING_MODULES.has(command.moduleId),
      component: moduleComponents[command.moduleId] ?? BetaPlaceholder,
    });
  }
  return [...byModule.values()];
}

export const moduleRegistry = new ModuleRegistry<ModuleComponent>();
moduleRegistry.registerAll(buildDefinitions());
