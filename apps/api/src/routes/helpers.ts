import type { FastifyReply } from 'fastify';
import type { DataProvenance, ProviderCapability } from '@tyche/contracts';
import { CapabilityError, type DataProvider, type ProviderRegistry } from '@tyche/data-adapters';

/** Provenance stamp for locally-stored (non-market) data. */
export function localProvenance(capability: string): DataProvenance {
  const now = new Date().toISOString();
  return {
    provider: 'local',
    providerMode: 'user_supplied',
    capability,
    retrievedAt: now,
    freshness: { asOf: now, tier: 'live', ageMs: 0 },
  };
}

/** A provider that can answer instrument/search lookups (or the primary). */
export function lookupProvider(registry: ProviderRegistry): DataProvider {
  return registry.forCapability('quotes') ?? registry.primary();
}

/**
 * Resolve a capability to a provider and stream the result, translating missing
 * capabilities and provider errors into graceful 200/502 payloads rather than
 * crashes.
 */
export async function serveCapability(
  reply: FastifyReply,
  registry: ProviderRegistry,
  capability: ProviderCapability,
  loader: (provider: DataProvider) => Promise<unknown>,
): Promise<void> {
  const provider = registry.forCapability(capability);
  if (!provider) {
    reply.code(200).send({
      error: {
        kind: 'capability_unavailable',
        capability,
        message: `No enabled provider supplies "${capability}". Enable a provider that does (see DATA_PROVIDERS.md).`,
      },
      provenance: null,
    });
    return;
  }
  try {
    reply.code(200).send(await loader(provider));
  } catch (err) {
    if (err instanceof CapabilityError) {
      reply.code(200).send({
        error: { kind: 'capability_unavailable', capability, message: err.message },
        provenance: null,
      });
      return;
    }
    reply.code(502).send({
      error: {
        kind: 'provider_error',
        capability,
        message: err instanceof Error ? err.message : String(err),
      },
      provenance: null,
    });
  }
}

export function badRequest(reply: FastifyReply, message: string, detail?: unknown): void {
  reply.code(400).send({ error: { kind: 'bad_request', message, detail } });
}
