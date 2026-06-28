import type { ModulePanelProps } from '@tyche/module-sdk';
import { EmptyState } from '@tyche/ui';
import { moduleRegistry } from './registry';

/**
 * Shared component for beta/stub modules. These are registered scaffolds: the
 * command routes and a panel opens, but the data view is not implemented yet.
 * The panel clearly explains what it needs — graceful, never a crash.
 */
export function BetaPlaceholder({ moduleId, commandId, missingCapabilities }: ModulePanelProps) {
  const def = moduleRegistry.get(moduleId);
  const required = def?.requiredCapabilities ?? [];
  const capabilities = missingCapabilities.length > 0 ? missingCapabilities : required;
  return (
    <EmptyState
      title={`${commandId} · ${def?.title ?? 'Beta module'}`}
      message={
        'This module is a scaffold in the foundation. The command routes here and the panel opens, ' +
        'but its data view is not implemented yet. It declares the capabilities it will need below.'
      }
      capabilities={capabilities.length > 0 ? capabilities : undefined}
    />
  );
}
