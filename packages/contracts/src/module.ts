import { z } from 'zod';
import { ProviderCapabilitySchema } from './provider';
import { PanelSizeHintSchema, MaturitySchema } from './terminal';

export const ModuleExportFormatSchema = z.enum(['csv', 'json', 'png', 'clipboard']);
export type ModuleExportFormat = z.infer<typeof ModuleExportFormatSchema>;

export const KeyboardShortcutSchema = z.object({
  keys: z.string(), // e.g. 'mod+s', 'g h'
  description: z.string(),
  commandId: z.string().optional(),
  action: z.string().optional(),
});
export type KeyboardShortcut = z.infer<typeof KeyboardShortcutSchema>;

/**
 * The serializable part of a module definition (the "manifest"). The full
 * `ModuleDefinition<Component>` in `@tyche/module-sdk` adds the React component
 * and data/lifecycle hooks, which are not part of the contract.
 */
export const ModuleManifestSchema = z.object({
  moduleId: z.string().regex(/^[a-z][a-z0-9-]*$/, 'moduleId must be kebab-case'),
  title: z.string(),
  description: z.string().optional(),
  /** Commands that route to this module. Must be non-empty. */
  commandIds: z.array(z.string()).min(1),
  requiredCapabilities: z.array(ProviderCapabilitySchema).default([]),
  defaultPanelSize: PanelSizeHintSchema,
  maturity: MaturitySchema,
  exportFormats: z.array(ModuleExportFormatSchema).default([]),
  keyboardShortcuts: z.array(KeyboardShortcutSchema).default([]),
  hasStreaming: z.boolean().default(false),
});
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;
