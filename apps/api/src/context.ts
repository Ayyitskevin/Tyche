import type { ProviderRegistry } from '@tyche/data-adapters';
import type { ApiConfig } from './env';
import type { PersistenceStore } from './persistence/types';
import type { QuoteStreamHub } from './stream/hub';
import type { AuditSink } from './security/audit';

export interface AppContext {
  config: ApiConfig;
  registry: ProviderRegistry;
  persistence: PersistenceStore;
  hub: QuoteStreamHub;
  audit: AuditSink;
}
