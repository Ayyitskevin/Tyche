import type {
  AssetClass,
  DataProvenance,
  ModuleExportFormat,
  ProviderCapability,
} from '@tyche/contracts';

/** Arbitrary serialized panel state, persisted with the workspace. */
export type PanelStateData = Record<string, unknown>;

/** Context provided to a module when it first loads in a panel. */
export interface ModuleLoadContext {
  symbol: string | null;
  args: string[];
  commandId: string;
  assetClass: AssetClass | null;
}

export interface ModuleExportInput {
  state: PanelStateData;
  rows?: Array<Record<string, unknown>>;
  symbol: string | null;
}

export interface ModuleExportResult {
  format: ModuleExportFormat;
  filename: string;
  mime: string;
  content: string;
}

/** A tiny, declarative test fixture every module can ship. */
export interface ModuleTestFixture {
  /** A command-bar input that should route to this module. */
  input: string;
  expectedModuleId: string;
  expectedSymbol?: string | null;
}

/** Props the host passes to a module's panel component. */
export interface ModulePanelProps {
  panelId: string;
  moduleId: string;
  symbol: string | null;
  args: string[];
  commandId: string;
  assetClass: AssetClass | null;
  state: PanelStateData;
  setState: (next: PanelStateData) => void;
  /** Retarget this panel's instrument; propagates to linked panels in the same group. */
  setSymbol?: (symbol: string) => void;
  missingCapabilities: ProviderCapability[];
  active: boolean;
  /** Lift the panel's current data provenance to the host (for the frame footer). */
  reportProvenance?: (provenance: DataProvenance | null) => void;
  /** Lift a short plain-text data digest for the AI copilot's context packet. */
  reportSummary?: (summary: string | null) => void;
}

/** A streaming subscription a module can declare it needs. */
export interface StreamingSubscription {
  capability: ProviderCapability;
  symbols: string[];
}
