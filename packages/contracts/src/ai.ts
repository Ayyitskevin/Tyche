import { z } from 'zod';
import { IsoDateTime } from './common';
import { AssetClassSchema } from './instruments';
import { DataProvenanceSchema, formatCitation, type DataProvenance } from './provenance';

export const AIRoleSchema = z.enum(['system', 'user', 'assistant']);
export type AIRole = z.infer<typeof AIRoleSchema>;

export const AIMessageSchema = z.object({
  role: AIRoleSchema,
  content: z.string(),
  createdAt: IsoDateTime.optional(),
});
export type AIMessage = z.infer<typeof AIMessageSchema>;

export const AIPanelRefSchema = z.object({
  moduleId: z.string(),
  symbol: z.string().nullable().default(null),
  title: z.string().optional(),
  /** Short plain-text digest of the panel's data (e.g. "AAPL 187.40 +1.2%"). */
  summary: z.string().optional(),
  /** The panel's reported data source. */
  provenance: DataProvenanceSchema.optional(),
});
export type AIPanelRef = z.infer<typeof AIPanelRefSchema>;

export const AINoteRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  symbol: z.string().nullable().default(null),
  excerpt: z.string(),
});
export type AINoteRef = z.infer<typeof AINoteRefSchema>;

export const AISelectionSchema = z.object({
  panelId: z.string().optional(),
  description: z.string(),
  rows: z.array(z.record(z.unknown())).optional(),
});
export type AISelection = z.infer<typeof AISelectionSchema>;

/**
 * The terminal context handed to the AI copilot. The copilot must ground its
 * answers in this packet and cite provenance; it must NOT give personalized
 * buy/sell/hold advice.
 */
export const AIContextPacketSchema = z.object({
  activeSymbol: z.string().nullable().default(null),
  activeAssetClass: AssetClassSchema.nullable().default(null),
  openPanels: z.array(AIPanelRefSchema).default([]),
  selection: AISelectionSchema.nullable().default(null),
  recentCommands: z.array(z.string()).default([]),
  watchlistSymbols: z.array(z.string()).default([]),
  provenance: z.array(DataProvenanceSchema).default([]),
  notes: z.array(AINoteRefSchema).optional(),
});
export type AIContextPacket = z.infer<typeof AIContextPacketSchema>;

export const AIChatRequestSchema = z.object({
  messages: z.array(AIMessageSchema).min(1),
  context: AIContextPacketSchema,
});
export type AIChatRequest = z.infer<typeof AIChatRequestSchema>;

export const AICitationSchema = z.object({
  label: z.string(),
  provider: z.string().optional(),
  capability: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  asOf: IsoDateTime.optional(),
});
export type AICitation = z.infer<typeof AICitationSchema>;

/** Build a citation from a data provenance, using the canonical citation string. */
export function provenanceToCitation(p: DataProvenance): AICitation {
  return {
    label: formatCitation(p),
    provider: p.provider,
    capability: p.capability,
    asOf: p.freshness.asOf,
    ...(p.sourceUrl ? { sourceUrl: p.sourceUrl } : {}),
  };
}

export const AIChatResponseSchema = z.object({
  message: AIMessageSchema,
  citations: z.array(AICitationSchema).default([]),
  grounded: z.boolean(),
  disclaimer: z.string(),
  mode: z.enum(['mock', 'live']),
});
export type AIChatResponse = z.infer<typeof AIChatResponseSchema>;
