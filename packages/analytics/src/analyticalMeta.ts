/**
 * Analytical result provenance — the pure-compute counterpart to the provider
 * Envelope's DataProvenance. Every analytical output that this layer annotates
 * carries a formula/transform id, units, optional as-of / provider, and a status
 * that distinguishes live, cached, delayed, synthetic, estimated, and unavailable
 * results so a missing input can never silently appear as an authoritative zero.
 *
 * Additive and backward-compatible: pure math functions may still return bare
 * numbers; callers that need attribution wrap with {@link annotate} or read the
 * `meta` field attached to multi-field result objects.
 *
 * Educational analytics only — not investment advice.
 */

import { isMissing } from './validation';

/**
 * Data / computation quality for an analytical output.
 * - live      — computed from live market data
 * - cached    — computed from a cache hit
 * - delayed   — computed from exchange-delayed data
 * - synthetic — computed from mock / deterministic synthetic inputs
 * - estimated — model output under explicit assumptions (DCF, WACC, etc.)
 * - unavailable — inputs missing/degenerate; value must not be treated as zero
 * - partial   — some components present, composite incomplete (all-or-null scores)
 */
export type AnalyticalStatus =
  | 'live'
  | 'cached'
  | 'delayed'
  | 'synthetic'
  | 'estimated'
  | 'unavailable'
  | 'partial';

/** Unit of measure for a numeric analytical field. */
export type UnitKind =
  | 'ratio' // dimensionless decimal (0.09 = 9%)
  | 'percent' // already scaled ×100
  | 'currency' // money; pair with `currency` ISO code
  | 'shares'
  | 'bps'
  | 'score' // composite forensic / checklist score
  | 'count'
  | 'years'
  | 'dimensionless';

export interface AnalyticalMeta {
  /** Stable formula / transform identifier, e.g. `dcf.gordon-growth.v1`. */
  formulaId: string;
  status: AnalyticalStatus;
  units?: UnitKind;
  /** ISO 4217 currency when units === 'currency'. */
  currency?: string;
  /** ISO timestamp the underlying inputs represent, when known. */
  asOf?: string;
  /** Provider name when the inputs were data-backed. */
  provider?: string;
  /** Human-readable source note (e.g. "user inputs", "FRED DGS10"). */
  source?: string;
  notes?: string;
}

/** A value paired with analytical provenance. */
export interface AnalyticalResult<T> {
  value: T;
  meta: AnalyticalMeta;
}

export interface AnalyticalMetaInit {
  formulaId: string;
  status?: AnalyticalStatus;
  units?: UnitKind;
  currency?: string;
  asOf?: string;
  provider?: string;
  source?: string;
  notes?: string;
  /**
   * When provided, a null/undefined/non-finite value forces status to
   * `unavailable` unless an explicit status was already set to `partial`.
   */
  value?: unknown;
}

/**
 * Build analytical provenance. If `value` is missing and no status was forced
 * to `partial`, status becomes `unavailable`. Defaults to `estimated` for
 * model outputs with a present value.
 */
export function analyticalMeta(init: AnalyticalMetaInit): AnalyticalMeta {
  let status = init.status;
  if (status === undefined) {
    if (init.value !== undefined && isUnavailableValue(init.value)) {
      status = 'unavailable';
    } else {
      status = 'estimated';
    }
  } else if (status !== 'partial' && init.value !== undefined && isUnavailableValue(init.value)) {
    // Never let a present-looking status ride on a missing value.
    status = 'unavailable';
  }

  const meta: AnalyticalMeta = {
    formulaId: init.formulaId,
    status,
  };
  if (init.units !== undefined) meta.units = init.units;
  if (init.currency !== undefined) meta.currency = init.currency;
  if (init.asOf !== undefined) meta.asOf = init.asOf;
  if (init.provider !== undefined) meta.provider = init.provider;
  if (init.source !== undefined) meta.source = init.source;
  if (init.notes !== undefined) meta.notes = init.notes;
  return meta;
}

/** True when a scalar (or nullish) analytical value is unavailable. */
export function isUnavailableValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return isMissing(value);
  return false;
}

/** Wrap a value with analytical provenance. */
export function annotate<T>(value: T, init: AnalyticalMetaInit): AnalyticalResult<T> {
  return {
    value,
    meta: analyticalMeta({ ...init, value: init.value !== undefined ? init.value : value }),
  };
}

/** Convenience: an unavailable result with a null value. */
export function unavailable<T = null>(
  formulaId: string,
  opts: Omit<AnalyticalMetaInit, 'formulaId' | 'status' | 'value'> = {},
): AnalyticalResult<T | null> {
  return {
    value: null,
    meta: analyticalMeta({ formulaId, status: 'unavailable', ...opts, value: null }),
  };
}

/**
 * Infer a coarse status from provider-side freshness / mode when the analytics
 * layer is wrapping a data-backed input. Pure-compute models without provider
 * context should pass an explicit status instead.
 */
export function statusFromProvider(opts: {
  providerMode?: string;
  freshnessTier?: string;
  cacheHit?: boolean;
  stale?: boolean;
}): AnalyticalStatus {
  if (opts.providerMode === 'mock' || opts.freshnessTier === 'mock') return 'synthetic';
  if (opts.cacheHit) return 'cached';
  if (opts.freshnessTier === 'delayed' || opts.stale) return 'delayed';
  if (opts.freshnessTier === 'live') return 'live';
  if (opts.freshnessTier === 'eod' || opts.freshnessTier === 'historical') return 'delayed';
  return 'estimated';
}

/** Format a one-line citation for an analytical result (panels / exports). */
export function formatAnalyticalCitation(meta: AnalyticalMeta): string {
  const parts: string[] = [meta.formulaId];
  parts.push(meta.status);
  if (meta.provider) parts.push(meta.provider);
  if (meta.units) parts.push(meta.units);
  if (meta.currency) parts.push(meta.currency);
  if (meta.asOf) parts.push(`as of ${meta.asOf.slice(0, 10)}`);
  return parts.join(' · ');
}
