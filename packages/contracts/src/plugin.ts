import { z } from 'zod';
import { ProviderCapabilitySchema } from './provider';

/**
 * Third-party plugin model. A plugin is a local module the operator deliberately
 * installs (named in config / dropped in a plugins dir) — the same trust level
 * as adding a dependency. Tyche never downloads or executes remote code. Every
 * plugin declares a manifest; a provider plugin only activates after passing the
 * provider conformance suite, so a misbehaving adapter is quarantined, not run.
 */

/** Plugin API compatibility version. A manifest must target the current major. */
export const PLUGIN_API_VERSION = 1 as const;

export const PluginKindSchema = z.enum(['provider', 'module']);
export type PluginKind = z.infer<typeof PluginKindSchema>;

export const PluginManifestSchema = z.object({
  /** Stable lowercase slug, unique per install. */
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'id must be a lowercase slug'),
  name: z.string().min(1),
  version: z.string().min(1),
  kind: PluginKindSchema,
  /** The plugin API version this manifest targets (must match the host's major). */
  apiVersion: z.number().int().positive(),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  /** Provider plugins: capabilities the adapter claims to serve (gated by conformance). */
  capabilities: z.array(ProviderCapabilitySchema).default([]),
  /** Module plugins: command ids the module registers. */
  commandIds: z.array(z.string()).default([]),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** active = registered & serving; quarantined = failed a gate; disabled = off by config. */
export const PluginStatusSchema = z.enum(['active', 'quarantined', 'disabled']);
export type PluginStatus = z.infer<typeof PluginStatusSchema>;

export const PluginConformanceCheckSchema = z.object({
  capability: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
});
export type PluginConformanceCheck = z.infer<typeof PluginConformanceCheckSchema>;

/** A loaded plugin's status, as surfaced by the API and the plugin manager. */
export const PluginInfoSchema = z.object({
  manifest: PluginManifestSchema,
  status: PluginStatusSchema,
  /** Why it was quarantined/disabled, when applicable. */
  reason: z.string().optional(),
  conformance: z.array(PluginConformanceCheckSchema).default([]),
});
export type PluginInfo = z.infer<typeof PluginInfoSchema>;
