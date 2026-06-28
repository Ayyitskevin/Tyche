import { NO_CAPABILITIES, type ProviderDescriptor } from '@tyche/contracts';
import { StubProvider } from '../Provider';

/**
 * Scaffold adapter for SEC EDGAR (US filings). Ships disabled. Intended
 * capabilities once wired up: filings, fundamentals. EDGAR requires a
 * descriptive User-Agent header (SEC_EDGAR_USER_AGENT). See DATA_PROVIDERS.md.
 */
export class SecEdgarProvider extends StubProvider {
  readonly descriptor: ProviderDescriptor = {
    name: 'secedgar',
    mode: 'public',
    capabilities: { ...NO_CAPABILITIES },
    freshness: [],
    attribution: 'U.S. Securities and Exchange Commission — EDGAR',
    attributionRequired: false,
    homepage: 'https://www.sec.gov/edgar',
    description:
      'Scaffold for SEC EDGAR (intended: filings, fundamentals via company facts XBRL). ' +
      'Not implemented. Requires a descriptive User-Agent per SEC fair-access policy.',
    requiresConfiguration: true,
  };
}
