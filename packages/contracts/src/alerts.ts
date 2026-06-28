import { z } from 'zod';
import { IsoDateTime } from './common';

export const AlertFieldSchema = z.enum(['price', 'changePercent', 'volume']);
export type AlertField = z.infer<typeof AlertFieldSchema>;

export const AlertOperatorSchema = z.enum([
  'gt',
  'gte',
  'lt',
  'lte',
  'crosses_above',
  'crosses_below',
]);
export type AlertOperator = z.infer<typeof AlertOperatorSchema>;

export const AlertRuleSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  field: AlertFieldSchema.default('price'),
  operator: AlertOperatorSchema,
  threshold: z.number(),
  active: z.boolean().default(true),
  /** Disable the rule after it fires once. */
  oneShot: z.boolean().default(false),
  note: z.string().optional(),
  createdAt: IsoDateTime,
  lastTriggeredAt: IsoDateTime.nullable().default(null),
});
export type AlertRule = z.infer<typeof AlertRuleSchema>;
