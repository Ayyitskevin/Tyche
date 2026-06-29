import type { ProviderRegistry } from '@tyche/data-adapters';
import type { ApiConfig } from './env';
import type { PersistenceStore } from './persistence/types';
import type { PluginHost } from './plugins/PluginHost';
import type { QuoteStreamHub } from './stream/hub';
import type { AuditSink } from './security/audit';

export interface AppContext {
  config: ApiConfig;
  registry: ProviderRegistry;
  persistence: PersistenceStore;
  plugins: PluginHost;
  hub: QuoteStreamHub;
  audit: AuditSink;
}
