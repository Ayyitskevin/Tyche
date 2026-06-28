import type { DataProvenance, ProviderCapabilities } from '@tyche/contracts';
import {
  toManifest,
  type ModuleDefinition,
} from './ModuleDefinition';
import { moduleMissingCapabilities } from './capabilities';

/** Standard shape for a module's async data hook result. */
export interface ModuleDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  provenance: DataProvenance | null;
}

export function initialDataState<T>(): ModuleDataState<T> {
  return { data: null, loading: true, error: null, provenance: null };
}

/**
 * A registry of modules keyed by id, with a command→module index. Manifests are
 * validated on registration; duplicate module ids and conflicting command
 * mappings are rejected so the module surface stays coherent.
 */
export class ModuleRegistry<C = unknown> {
  private readonly byId = new Map<string, ModuleDefinition<C>>();
  private readonly commandToModule = new Map<string, string>();

  register(def: ModuleDefinition<C>): void {
    const manifest = toManifest(def); // throws on invalid manifest
    if (this.byId.has(manifest.moduleId)) {
      throw new Error(`Duplicate moduleId: ${manifest.moduleId}`);
    }
    this.byId.set(manifest.moduleId, def);
    for (const commandId of manifest.commandIds) {
      const key = commandId.toUpperCase();
      const existing = this.commandToModule.get(key);
      if (existing && existing !== manifest.moduleId) {
        throw new Error(`Command ${commandId} already maps to module ${existing}`);
      }
      this.commandToModule.set(key, manifest.moduleId);
    }
  }

  registerAll(defs: ModuleDefinition<C>[]): void {
    for (const def of defs) this.register(def);
  }

  get(moduleId: string): ModuleDefinition<C> | undefined {
    return this.byId.get(moduleId);
  }

  forCommand(commandId: string): ModuleDefinition<C> | undefined {
    const moduleId = this.commandToModule.get(commandId.toUpperCase());
    return moduleId ? this.byId.get(moduleId) : undefined;
  }

  list(): ModuleDefinition<C>[] {
    return [...this.byId.values()];
  }

  size(): number {
    return this.byId.size;
  }

  /** Resolve the capability gap for a module against available capabilities. */
  missingFor(moduleId: string, available: ProviderCapabilities) {
    const def = this.byId.get(moduleId);
    if (!def) return [];
    return moduleMissingCapabilities(def.requiredCapabilities ?? [], available);
  }
}
