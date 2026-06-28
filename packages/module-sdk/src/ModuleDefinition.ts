import {
  ModuleManifestSchema,
  type KeyboardShortcut,
  type Maturity,
  type ModuleExportFormat,
  type ModuleManifest,
  type PanelSizeHint,
  type ProviderCapability,
} from '@tyche/contracts';
import type {
  ModuleExportInput,
  ModuleExportResult,
  ModuleLoadContext,
  ModuleTestFixture,
  PanelStateData,
  StreamingSubscription,
} from './PanelState';

/**
 * A module is registered through a single manifest. `ModuleDefinition` is the
 * runtime form: the serializable manifest fields plus the UI component (generic
 * `C` so this package stays UI-agnostic) and optional lifecycle/data hooks.
 */
export interface ModuleDefinition<C = unknown> {
  moduleId: string;
  title: string;
  description?: string;
  /** Commands that route to this module. */
  commandIds: string[];
  requiredCapabilities?: ProviderCapability[];
  defaultPanelSize: PanelSizeHint;
  maturity: Maturity;
  exportFormats?: ModuleExportFormat[];
  keyboardShortcuts?: KeyboardShortcut[];
  hasStreaming?: boolean;

  /** The panel UI component (e.g. a React component in the web app). */
  component: C;

  /** Optional: compute the initial serialized panel state. */
  loadInitialState?: (ctx: ModuleLoadContext) => PanelStateData | Promise<PanelStateData>;
  /** Optional: declare streaming subscriptions for a given symbol set. */
  streamingFor?: (symbols: string[]) => StreamingSubscription[];
  /** Optional: export the panel's current data. */
  exportData?: (input: ModuleExportInput) => ModuleExportResult | null;
  /** Optional: a declarative test fixture. */
  testFixture?: ModuleTestFixture;
}

/** Extract and validate the serializable manifest from a module definition. */
export function toManifest(def: ModuleDefinition): ModuleManifest {
  return ModuleManifestSchema.parse({
    moduleId: def.moduleId,
    title: def.title,
    description: def.description,
    commandIds: def.commandIds,
    requiredCapabilities: def.requiredCapabilities ?? [],
    defaultPanelSize: def.defaultPanelSize,
    maturity: def.maturity,
    exportFormats: def.exportFormats ?? [],
    keyboardShortcuts: def.keyboardShortcuts ?? [],
    hasStreaming: def.hasStreaming ?? false,
  });
}

export interface ModuleValidationResult {
  ok: boolean;
  manifest?: ModuleManifest;
  error?: string;
}

/** Non-throwing manifest validation, handy for tests and tooling. */
export function validateModuleDefinition(def: ModuleDefinition): ModuleValidationResult {
  const result = ModuleManifestSchema.safeParse({
    moduleId: def.moduleId,
    title: def.title,
    description: def.description,
    commandIds: def.commandIds,
    requiredCapabilities: def.requiredCapabilities ?? [],
    defaultPanelSize: def.defaultPanelSize,
    maturity: def.maturity,
    exportFormats: def.exportFormats ?? [],
    keyboardShortcuts: def.keyboardShortcuts ?? [],
    hasStreaming: def.hasStreaming ?? false,
  });
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, manifest: result.data };
}
