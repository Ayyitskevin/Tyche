import { z } from 'zod';
import { IsoDateTime } from './common';

/**
 * A local-first research note. `body` is markdown. Notes are owned by the user
 * (local persistence), never a market provider; they are exportable and the AI
 * copilot can ground on them.
 */
export const NoteSchema = z.object({
  id: z.string(),
  symbol: z.string().nullable().default(null),
  title: z.string(),
  /** Markdown body. */
  body: z.string(),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Note = z.infer<typeof NoteSchema>;

/** A portable export envelope of notes (for download / re-import). */
export const NoteExportSchema = z.object({
  version: z.number().int().default(1),
  exportedAt: IsoDateTime,
  notes: z.array(NoteSchema).default([]),
});
export type NoteExport = z.infer<typeof NoteExportSchema>;
