import { z } from 'zod';
import { IsoDateTime } from './common';
import { InstrumentIdentifierSchema } from './instruments';

/** Current serialization version for persisted workspaces. */
export const WORKSPACE_SCHEMA_VERSION = 1 as const;

export const GridPositionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export type GridPosition = z.infer<typeof GridPositionSchema>;

export const PanelSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  commandId: z.string().nullable().default(null),
  symbol: z.string().nullable().default(null),
  title: z.string(),
  grid: GridPositionSchema,
  /** Arbitrary serialized panel state (selected rows, range, interval, ...). */
  state: z.record(z.unknown()).default({}),
  /** Link group for color-coded panel linking; null = unlinked. */
  linkGroup: z.string().nullable().default(null),
  minimized: z.boolean().default(false),
  maximized: z.boolean().default(false),
  createdAt: IsoDateTime,
});
export type Panel = z.infer<typeof PanelSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.literal(WORKSPACE_SCHEMA_VERSION).default(WORKSPACE_SCHEMA_VERSION),
  panels: z.array(PanelSchema).default([]),
  activeInstrument: InstrumentIdentifierSchema.nullable().default(null),
  activePanelId: z.string().nullable().default(null),
  /** Grid columns for the workspace layout. */
  cols: z.number().int().positive().default(12),
  rowHeight: z.number().int().positive().default(30),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

// --- User preferences ------------------------------------------------------

export const ThemeSchema = z.enum(['dark', 'midnight', 'high-contrast']);
export type Theme = z.infer<typeof ThemeSchema>;

export const DensitySchema = z.enum(['comfortable', 'compact', 'dense']);
export type Density = z.infer<typeof DensitySchema>;

export const UserPreferencesSchema = z.object({
  theme: ThemeSchema.default('dark'),
  density: DensitySchema.default('compact'),
  defaultProvider: z.string().default('mock'),
  /** Command used when only a symbol is typed (e.g. `AAPL` -> DES). */
  defaultCommandId: z.string().default('DES'),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  /** Custom keybindings: keys -> commandId/action. */
  keymap: z.record(z.string()).default({}),
  /** Feature flags. */
  flags: z.record(z.boolean()).default({}),
  /** Plugin ids the operator has turned off; honored at the next API boot. */
  disabledPlugins: z.array(z.string()).default([]),
  updatedAt: IsoDateTime,
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
