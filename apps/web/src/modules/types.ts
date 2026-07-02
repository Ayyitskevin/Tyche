import type { ComponentType, LazyExoticComponent } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';

/**
 * A panel module component — eager, or a `React.lazy` wrapper so the module's
 * code loads on first open instead of in the entry bundle. PanelHost renders
 * both behind one Suspense boundary.
 */
export type ModuleComponent =
  | ComponentType<ModulePanelProps>
  | LazyExoticComponent<ComponentType<ModulePanelProps>>;
