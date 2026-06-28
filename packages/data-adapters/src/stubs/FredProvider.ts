import { NO_CAPABILITIES, type ProviderDescriptor } from '@tyche/contracts';
import { StubProvider } from '../Provider';

/**
 * Scaffold adapter for FRED (Federal Reserve Economic Data). Ships disabled.
 * Intended use: macro/economic series feeding future macro modules. Requires a
 * free FRED_API_KEY. See DATA_PROVIDERS.md.
 */
export class FredProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'fred',
    mode: 'public',
    capabilities: { ...NO_CAPABILITIES },
    freshness: [],
    attribution: 'FRED — Federal Reserve Bank of St. Louis',
    attributionRequired: true,
    homepage: 'https://fred.stlouisfed.org',
    description:
      'Scaffold for FRED economic data (intended: macro time series). Not implemented. ' +
      'Requires a free API key.',
    requiresConfiguration: true,
  };
}
