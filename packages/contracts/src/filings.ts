import { z } from 'zod';
import { IsoDateTime, IsoDate } from './common';

export const FilingDocumentSchema = z.object({
  type: z.string(), // e.g. 'primary', 'exhibit', 'xbrl'
  url: z.string().url().optional(),
  description: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type FilingDocument = z.infer<typeof FilingDocumentSchema>;

export const FilingSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  /** Form type, e.g. 10-K, 10-Q, 8-K, S-1. */
  form: z.string(),
  title: z.string(),
  filedAt: IsoDateTime,
  periodOfReport: IsoDate.optional(),
  accessionNumber: z.string().optional(),
  url: z.string().url().optional(),
  documents: z.array(FilingDocumentSchema).default([]),
});
export type Filing = z.infer<typeof FilingSchema>;
