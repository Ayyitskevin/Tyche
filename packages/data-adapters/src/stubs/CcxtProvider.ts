import { NO_CAPABILITIES, type ProviderDescriptor } from '@tyche/contracts';
import { StubProvider } from '../Provider';

/**
 * Scaffold adapter for CCXT-backed crypto exchanges. Ships disabled. Intended
 * capabilities once wired up: crypto quotes, orderBook, trades, historicalPrices.
 * Configure with CCXT_EXCHANGE (+ keys for private endpoints). See DATA_PROVIDERS.md.
 */
export class CcxtProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'ccxt',
    mode: 'user_supplied',
    capabilities: { ...NO_CAPABILITIES },
    freshness: [],
    attribution: 'CCXT + the configured exchange',
    attributionRequired: true,
    homepage: 'https://github.com/ccxt/ccxt',
    description:
      'Scaffold for CCXT crypto exchanges (intended: crypto quotes, order book, trades, history). ' +
      'Not implemented. Public market data only in the foundation — no order placement.',
    requiresConfiguration: true,
  };
}
