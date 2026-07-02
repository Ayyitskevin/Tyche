import {
  NO_CAPABILITIES,
  PROVIDER_CAPABILITY_KEYS,
  type ProviderCapabilities,
  type ProviderCapability,
  type ProviderDescriptor,
} from '@tyche/contracts';
import type { DataProvider } from './Provider';
import { MockProvider } from './MockProvider';
import { BinanceProvider } from './BinanceProvider';
import { FrankfurterProvider } from './FrankfurterProvider';
import { YahooProvider } from './stubs/YahooProvider';
import { SecEdgarProvider } from './stubs/SecEdgarProvider';
import { FredProvider } from './stubs/FredProvider';
import { CcxtProvider } from './stubs/CcxtProvider';

/**
 * Holds the set of enabled providers and answers "who can serve capability X?".
 * Capability resolution scans in registration order, so the primary (mock)
 * provider is consulted first.
 */
export class ProviderRegistry {
  private readonly providers: DataProvider[] = [];
  private readonly byName = new Map<string, DataProvider>();

  register(provider: DataProvider): void {
    const name = provider.descriptor.name;
    if (this.byName.has(name)) throw new Error(`Duplicate provider: ${name}`);
    this.providers.push(provider);
    this.byName.set(name, provider);
  }

  get(name: string): DataProvider | undefined {
    return this.byName.get(name);
  }

  list(): DataProvider[] {
    return [...this.providers];
  }

  descriptors(): ProviderDescriptor[] {
    return this.providers.map((p) => p.descriptor);
  }

  primary(): DataProvider {
    const first = this.providers[0];
    if (!first) throw new Error('No providers registered.');
    return first;
  }

  /**
   * The first registered provider that declares `capability` — and, when a
   * symbol is given, one that actually serves that symbol. Venue-scoped
   * adapters (e.g. binance) implement {@link DataProvider.servesSymbol} to
   * decline symbols outside their universe, so `BTC-USDT` routes to the crypto
   * venue while `AAPL` keeps routing to a general provider.
   */
  forCapability(capability: ProviderCapability, symbol?: string): DataProvider | undefined {
    return this.providers.find(
      (p) =>
        p.descriptor.capabilities[capability] &&
        (symbol === undefined || p.servesSymbol === undefined || p.servesSymbol(symbol)),
    );
  }

  /** Union of every registered provider's capabilities. */
  aggregateCapabilities(): ProviderCapabilities {
    const aggregate: ProviderCapabilities = { ...NO_CAPABILITIES };
    for (const key of PROVIDER_CAPABILITY_KEYS) {
      aggregate[key] = this.providers.some((p) => p.descriptor.capabilities[key]);
    }
    return aggregate;
  }

  missingCapabilities(required: readonly ProviderCapability[]): ProviderCapability[] {
    const aggregate = this.aggregateCapabilities();
    return required.filter((cap) => !aggregate[cap]);
  }
}

export interface ProviderRegistryConfig {
  /** Provider names to enable; defaults to `['mock']`. Mock is always present. */
  providers?: string[];
  referenceDate?: Date;
  /** Descriptive User-Agent for the SEC EDGAR adapter (required to enable it). */
  secEdgarUserAgent?: string | null;
  /** Free API key for the FRED adapter (required to enable it). */
  fredApiKey?: string | null;
}

function instantiate(name: string, config: ProviderRegistryConfig): DataProvider | null {
  switch (name.trim().toLowerCase()) {
    case 'mock':
      return new MockProvider(config.referenceDate ? { referenceDate: config.referenceDate } : {});
    case 'yahoo':
      return new YahooProvider();
    case 'sec':
    case 'secedgar':
      // Only enable when a User-Agent is configured; otherwise mock serves filings.
      return config.secEdgarUserAgent
        ? new SecEdgarProvider({ userAgent: config.secEdgarUserAgent })
        : null;
    case 'fred':
      // Only enable when an API key is configured; otherwise mock serves economics.
      return config.fredApiKey ? new FredProvider({ apiKey: config.fredApiKey }) : null;
    case 'binance':
      // Keyless public market data; scoped to crypto pairs via servesSymbol.
      return new BinanceProvider();
    case 'frankfurter':
    case 'ecb':
      // Keyless daily ECB reference rates; scoped to ISO currency pairs.
      return new FrankfurterProvider();
    case 'ccxt':
      return new CcxtProvider();
    default:
      return null;
  }
}

/**
 * Build a provider registry from a list of names. The mock provider is always
 * registered (as a fallback) so the terminal is never left without data.
 */
export function createProviderRegistry(config: ProviderRegistryConfig = {}): ProviderRegistry {
  const registry = new ProviderRegistry();
  const names = config.providers && config.providers.length > 0 ? config.providers : ['mock'];
  for (const name of names) {
    const provider = instantiate(name, config);
    if (provider) registry.register(provider);
  }
  if (!registry.get('mock')) {
    registry.register(
      new MockProvider(config.referenceDate ? { referenceDate: config.referenceDate } : {}),
    );
  }
  return registry;
}
