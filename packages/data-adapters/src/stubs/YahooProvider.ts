import { NO_CAPABILITIES, type ProviderDescriptor } from '@tyche/contracts';
import { StubProvider } from '../Provider';

/**
 * Scaffold adapter for Yahoo Finance public endpoints. Ships disabled: it
 * declares no live capabilities until implemented. Intended capabilities once
 * wired up: quotes, batchQuotes, historicalPrices, news. See DATA_PROVIDERS.md.
 */
export class YahooProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'yahoo',
    mode: 'public',
    capabilities: { ...NO_CAPABILITIES },
    freshness: [],
    attribution: 'Yahoo Finance',
    attributionRequired: true,
    homepage: 'https://finance.yahoo.com',
    description:
      'Scaffold for Yahoo Finance public endpoints (intended: quotes, history, news). ' +
      'Not implemented. Verify terms of use and entitlements before enabling.',
    requiresConfiguration: true,
  };
}
