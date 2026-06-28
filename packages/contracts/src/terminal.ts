import { z } from 'zod';
import { AssetClassSchema, InstrumentIdentifierSchema } from './instruments';
import { ProviderCapabilitySchema } from './provider';

export const CommandCategorySchema = z.enum([
  'core',
  'market-data',
  'research',
  'fundamentals',
  'news',
  'portfolio',
  'analytics',
  'crypto',
  'system',
]);
export type CommandCategory = z.infer<typeof CommandCategorySchema>;

export const MaturitySchema = z.enum(['stable', 'beta', 'stub']);
export type Maturity = z.infer<typeof MaturitySchema>;

/** Default panel size hint in workspace grid units. */
export const PanelSizeHintSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export type PanelSizeHint = z.infer<typeof PanelSizeHintSchema>;

/**
 * The serializable metadata for a command in the registry. The runtime
 * `RegisteredCommand` in `@tyche/terminal-kernel` extends this with a handler
 * function (which is not part of the contract because it is not serializable).
 */
export const CommandDescriptorSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9]*$/, 'command id must be UPPERCASE'),
  aliases: z.array(z.string()).default([]),
  title: z.string(),
  description: z.string(),
  category: CommandCategorySchema,
  requiresInstrument: z.boolean().default(false),
  /** Empty array = accepts any asset class. */
  acceptedAssetClasses: z.array(AssetClassSchema).default([]),
  requiredCapabilities: z.array(ProviderCapabilitySchema).default([]),
  moduleId: z.string(),
  defaultPanelSize: PanelSizeHintSchema,
  examples: z.array(z.string()).default([]),
  maturity: MaturitySchema,
});
export type CommandDescriptor = z.infer<typeof CommandDescriptorSchema>;

/** Alias for the domain name used in the spec. */
export const TerminalCommandSchema = CommandDescriptorSchema;
export type TerminalCommand = CommandDescriptor;

// --- Parser output ---------------------------------------------------------

export const ParsedTokenKindSchema = z.enum([
  'command',
  'instrument',
  'yellow-key',
  'word',
  'flag',
]);
export type ParsedTokenKind = z.infer<typeof ParsedTokenKindSchema>;

export const ParsedTokenSchema = z.object({
  raw: z.string(),
  kind: ParsedTokenKindSchema,
  value: z.string(),
});
export type ParsedToken = z.infer<typeof ParsedTokenSchema>;

export const CommandParseResultSchema = z.object({
  raw: z.string(),
  tokens: z.array(ParsedTokenSchema),
  commandId: z.string().nullable(),
  matchedAlias: z.string().nullable(),
  instrument: InstrumentIdentifierSchema.nullable(),
  args: z.array(z.string()).default([]),
  /** Free-text query (e.g. for SECF / search fallback). */
  query: z.string().nullable(),
  assetClassHint: AssetClassSchema.nullable(),
  isFreeText: z.boolean(),
  ok: z.boolean(),
  error: z.string().optional(),
  suggestions: z.array(z.string()).default([]),
});
export type CommandParseResult = z.infer<typeof CommandParseResultSchema>;
