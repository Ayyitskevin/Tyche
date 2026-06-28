import { z } from 'zod';

/**
 * Shared primitive schemas used across the domain contracts.
 * Keep these permissive enough to round-trip real provider data, but typed
 * enough to be meaningful at the boundary.
 */

/** ISO-8601 timestamp, e.g. `2026-06-28T13:45:00.000Z`. */
export const IsoDateTime = z.string().datetime({ offset: true }).describe('ISO-8601 timestamp');
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** ISO-8601 calendar date (date-only is allowed via permissive string). */
export const IsoDate = z.string().min(1).describe('ISO-8601 date or datetime');
export type IsoDate = z.infer<typeof IsoDate>;

/** Non-empty identifier string. */
export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** ISO 4217-style currency code (kept permissive for crypto quote currencies). */
export const Currency = z.string().min(1).max(8).describe('Currency code, e.g. USD');
export type Currency = z.infer<typeof Currency>;

/** A finite number (rejects NaN / Infinity that can slip through JSON). */
export const FiniteNumber = z.number().finite();

/** Hex color string used for panel link-groups and watchlist tags. */
export const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .describe('Hex color, e.g. #38bdf8');
